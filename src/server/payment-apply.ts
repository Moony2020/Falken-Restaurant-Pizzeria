import type { Types } from "mongoose";
import type { PaymentProvider } from "./models/constants.ts";
import { OrderModel } from "./models/order.ts";
import { PaymentModel } from "./models/order.ts";
import { audit, flagForReview, transitionOrder, type OrderLean } from "./order-transitions.ts";

// Turning a CONFIRMED payment into an order outcome. "Confirmed" means a provider adapter has already verified it
// (webhook signature checked, or the provider's API asked directly). Nothing a browser says ever reaches this code.
// The branded type below makes that a compile-time rule: only markVerified() can produce a VerifiedPayment, and it
// is meant to be called only by the provider adapters (E2/E3) after they have verified the event.

declare const verifiedBrand: unique symbol;

export type VerifiedPayment = {
  readonly [verifiedBrand]: true;
  provider: PaymentProvider;
  providerSessionId: string;
  providerPaymentId: string;
  /** Amount the provider reports as received, in whole SEK. */
  amountSek: number;
  currency: string;
  /** The order reference the provider carries back (client_reference_id / custom_id). Cross-checked, never trusted alone. */
  orderReference?: string;
};

export function markVerified(p: Omit<VerifiedPayment, typeof verifiedBrand>): VerifiedPayment {
  return p as VerifiedPayment;
}

export type ApplyOutcome =
  | "paid" // order moved to CONFIRMED with paymentStatus=paid
  | "already_paid" // this payment had already paid the order (duplicate event / retry)
  | "late_payment" // order was already cancelled or expired: money received, order NOT revived, flagged
  | "duplicate_payment" // order already paid by a different payment: flagged for refund
  | "amount_mismatch" // provider received a different amount or currency: flagged, order NOT paid
  | "reference_mismatch" // provider's order reference doesn't match the order we linked: flagged
  | "paid_after_refund"
  | "unknown_payment"
  | "unknown_order"
  | "conflict"; // lost a race we could not resolve: safe to retry

const SYSTEM_PAYMENT = (provider: PaymentProvider) => ({ type: "payment" as const, id: provider });

export async function applyVerifiedPayment(payment: VerifiedPayment, now: Date = new Date()): Promise<{ outcome: ApplyOutcome; orderId?: Types.ObjectId }> {
  const record = await PaymentModel.findOne({ provider: payment.provider, providerSessionId: payment.providerSessionId });
  if (!record) {
    await audit("payment_unknown_session", payment.providerSessionId, SYSTEM_PAYMENT(payment.provider), now, { paymentId: payment.providerPaymentId }, "payment");
    return { outcome: "unknown_payment" };
  }

  // A few tries: the order can change under us (another event for the same payment), and each pass re-reads it.
  for (let pass = 0; pass < 3; pass++) {
    const order = (await OrderModel.findById(record.orderId).lean()) as OrderLean | null;
    if (!order) return { outcome: "unknown_order" };
    const id = order._id;
    const actor = SYSTEM_PAYMENT(payment.provider);
    const detail = { paymentId: payment.providerPaymentId, receivedSek: payment.amountSek, expectedSek: order.totalSek, status: order.fulfillmentStatus };

    // What the provider received must match what we asked for, and it must be for THIS order.
    if (payment.orderReference !== undefined && payment.orderReference !== order.publicId) {
      await recordReceived(record._id, payment);
      await flagForReview(id, "reference_mismatch", "Provider order reference does not match", now);
      await audit("payment_reference_mismatch", String(id), actor, now, detail);
      return { outcome: "reference_mismatch", orderId: id };
    }
    if (payment.currency.toUpperCase() !== "SEK" || payment.amountSek !== order.totalSek) {
      await recordReceived(record._id, payment);
      await flagForReview(id, "amount_mismatch", `Received ${payment.amountSek} ${payment.currency}, expected ${order.totalSek} SEK`, now);
      await audit("payment_amount_mismatch", String(id), actor, now, { ...detail, currency: payment.currency });
      return { outcome: "amount_mismatch", orderId: id };
    }

    if (order.fulfillmentStatus === "PENDING_PAYMENT") {
      const t = await transitionOrder({ orderId: id, to: "CONFIRMED", actor, reason: `payment_confirmed:${payment.providerPaymentId}`, now, set: { paymentProvider: payment.provider, paymentId: record._id } });
      if (!t.ok) {
        if (t.reason === "conflict") continue; // the order moved meanwhile: look again
        return { outcome: "conflict", orderId: id };
      }
      // The order may have been paid by someone else between our read and the update: check who won.
      if (String(t.order.paymentId) !== String(record._id)) continue;
      await recordPaid(record._id, payment);
      return { outcome: t.changed ? "paid" : "already_paid", orderId: id };
    }

    if (order.paymentStatus === "paid") {
      if (order.paymentId && String(order.paymentId) === String(record._id)) {
        await recordPaid(record._id, payment); // repairs the Payment record if a crash left it behind
        return { outcome: "already_paid", orderId: id };
      }
      await recordPaid(record._id, payment);
      await flagForReview(id, "duplicate_payment", "A second payment arrived for an order that was already settled", now);
      await audit("payment_duplicate", String(id), actor, now, detail);
      return { outcome: "duplicate_payment", orderId: id };
    }

    // CANCELLED: the order was cancelled or expired before the confirmation arrived. The customer HAS paid, so the
    // money is recorded and a person is flagged, but the order is not silently revived.
    await recordPaid(record._id, payment);
    await flagForReview(id, "late_payment", "Payment confirmed after the order was cancelled or expired", now);
    await audit("payment_late", String(id), actor, now, detail);
    return { outcome: "late_payment", orderId: id };
  }
  return { outcome: "conflict", orderId: record.orderId };
}

async function recordReceived(paymentId: Types.ObjectId, p: VerifiedPayment) {
  await PaymentModel.updateOne({ _id: paymentId }, { $set: { providerPaymentId: p.providerPaymentId, receivedSek: p.amountSek } });
}

async function recordPaid(paymentId: Types.ObjectId, p: VerifiedPayment) {
  await PaymentModel.updateOne(
    { _id: paymentId },
    { $set: { status: "paid", providerPaymentId: p.providerPaymentId, receivedSek: p.amountSek } },
  );
}
