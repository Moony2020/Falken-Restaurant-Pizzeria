import { PaymentModel } from "./models/order.ts";
import { OrderModel } from "./models/order.ts";
import { audit, flagForReview, transitionOrder, type OrderLean } from "./order-transitions.ts";
import { ORDER_EXPIRY_MINUTES } from "./payments-config.ts";

// Cancelling orders that were never paid. This function is NOT scheduled anywhere: nothing runs it by itself yet
// (a protected endpoint or an external scheduler is a later decision). It is also deliberately cautious:
//
//  An order is cancelled only when we can positively say it was not paid. If the customer may still be completing a
//  payment (an open session) or we can't tell, the order is left alone. Cancelling an order whose payment is
//  about to land is exactly the mistake this guards against; a payment that still arrives late is handled by
//  applyVerifiedPayment (money recorded, order flagged).

export type PaymentState = "paid" | "unpaid" | "unknown";
export type ProviderCheck = (order: OrderLean) => Promise<PaymentState>;

/**
 * What we know from our own records. Providers are asked in E2/E3, which will plug in a stronger check:
 *  - a payment already marked paid          → "paid"
 *  - a session that may still be open       → "unknown" (we can't be sure without asking the provider)
 *  - no payment at all, or only dead ones   → "unpaid"
 */
export const recordedPaymentState: ProviderCheck = async (order) => {
  const payments = await PaymentModel.find({ orderId: order._id }).lean();
  if (payments.some((p) => p.status === "paid")) return "paid";
  if (payments.some((p) => p.status === "pending")) return "unknown";
  return "unpaid";
};

export type ExpiryResult = { examined: number; cancelled: number; skippedUnknown: number; foundPaid: number };

export async function expirePendingOrders(args: { now?: Date; limit?: number; check?: ProviderCheck } = {}): Promise<ExpiryResult> {
  const { now = new Date(), limit = 100, check = recordedPaymentState } = args;
  const cutoff = new Date(now.getTime() - ORDER_EXPIRY_MINUTES * 60_000);

  // Due = past its own deadline, or (older orders without one) older than the expiry window.
  const due = (await OrderModel.find({
    fulfillmentStatus: "PENDING_PAYMENT",
    $or: [{ paymentExpiresAt: { $lte: now } }, { paymentExpiresAt: { $exists: false }, createdAt: { $lte: cutoff } }],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean()) as OrderLean[];

  const result: ExpiryResult = { examined: due.length, cancelled: 0, skippedUnknown: 0, foundPaid: 0 };
  for (const order of due) {
    const state = await check(order);
    if (state === "unknown") {
      result.skippedUnknown++;
      continue;
    }
    if (state === "paid") {
      // Paid but still pending means a confirmation was missed. Never cancel; ask a person to look.
      result.foundPaid++;
      await flagForReview(order._id, "paid_but_pending", "Expiry found a paid payment on an unpaid order", now);
      await audit("expiry_found_paid", String(order._id), { type: "system" }, now);
      continue;
    }
    const t = await transitionOrder({ orderId: order._id, to: "CANCELLED", actor: { type: "system" }, reason: "payment_window_expired", now });
    if (t.ok && t.changed) result.cancelled++;
  }
  return result;
}
