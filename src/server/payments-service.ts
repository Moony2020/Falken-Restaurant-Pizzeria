import type { Types } from "mongoose";
import { OrderModel, PaymentModel } from "./models/order.ts";
import { verifyAccessToken } from "./order-access.ts";
import { recordedPaymentState, type ProviderCheck } from "./order-expiry.ts";
import type { OrderLean } from "./order-transitions.ts";
import { applyVerifiedPayment, markVerified, type ApplyOutcome } from "./payment-apply.ts";
import { PAYMENT_SESSION_MINUTES, type PaymentsConfig } from "./payments-config.ts";
import type { CheckoutSessionInfo, StripeGateway } from "./stripe-gateway.ts";
import { audit } from "./order-transitions.ts";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "./webhook-events.ts";

// Stripe Checkout for an existing order (test mode). Three rules run through everything here:
//  1. The amount always comes from the order saved on the server. Nothing the browser sends is used for money.
//  2. An order becomes PAID only after Stripe itself says the payment was made (the session is fetched from
//     Stripe, not read from the webhook body) and applyVerifiedPayment has checked order, amount and currency.
//  3. Anything we can't be sure about is left alone and flagged, never guessed.

export const MAX_SESSIONS_PER_ORDER = 5;

const orderRef = (o: { _id: Types.ObjectId }) => String(o._id);

// ---- creating a payment page --------------------------------------------------------------------------------

export type CheckoutResult =
  | { kind: "ok"; url: string; sessionId: string; reused: boolean }
  | { kind: "unavailable" } // payments switched off or Stripe not configured
  | { kind: "not_found" } // unknown order or wrong access token (deliberately indistinguishable)
  | { kind: "not_payable"; status: string }
  | { kind: "expired" }
  | { kind: "paid" } // Stripe had already taken the payment and we have now recorded it
  | { kind: "processing" } // payment is complete at Stripe but not confirmed as paid yet (asynchronous methods)
  | { kind: "too_many_attempts" };

export type CheckoutArgs = {
  publicId: string;
  token: string | null;
  origin: string;
  tokenSecret: string;
  gateway: StripeGateway | null;
  config: PaymentsConfig;
  now?: Date;
};

/** Stripe wants the smallest currency unit. Order totals are whole SEK, so this is exact: no rounding anywhere. */
export const sekToOre = (sek: number): number => {
  if (!Number.isInteger(sek) || sek < 0) throw new Error("amount must be a whole number of SEK");
  return sek * 100;
};

function lineItems(order: OrderLean): { name: string; unitAmountOre: number }[] {
  const lines = order.items.map((i) => ({
    name: `${i.quantity} × ${i.productNameSnapshot}${i.variantNameSnapshot && i.variantNameSnapshot !== "Standard" ? ` (${i.variantNameSnapshot})` : ""}`,
    unitAmountOre: sekToOre(i.lineTotalSek),
  }));
  // The charge is always exactly the saved order total. If the lines don't add up to it, charge one line instead.
  const sum = lines.reduce((a, l) => a + l.unitAmountOre, 0);
  return sum === sekToOre(order.totalSek) ? lines : [{ name: `Beställning ${order.publicId}`, unitAmountOre: sekToOre(order.totalSek) }];
}

export async function createCheckout(args: CheckoutArgs): Promise<CheckoutResult> {
  const { publicId, token, origin, tokenSecret, gateway, config, now = new Date() } = args;
  if (!config.enabled || !config.stripe || !gateway) return { kind: "unavailable" };

  // The public order number alone proves nothing: the access token handed out when the order was created is required.
  if (!verifyAccessToken(publicId, token, tokenSecret)) return { kind: "not_found" };
  const order = (await OrderModel.findOne({ publicId }).lean()) as OrderLean | null;
  if (!order) return { kind: "not_found" };
  if (order.fulfillmentStatus !== "PENDING_PAYMENT") return { kind: "not_payable", status: order.fulfillmentStatus };
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= now.getTime()) return { kind: "expired" };

  const existing = await PaymentModel.find({ orderId: order._id, provider: "stripe" }).sort({ createdAt: -1 }).lean();

  // A payment page for this order that is still open is reused, so a double click or a reload never makes a second one.
  for (const p of existing.filter((x) => x.status === "pending")) {
    const session = await gateway.retrieveSession(p.providerSessionId);
    if (session.status === "open" && session.url) return { kind: "ok", url: session.url, sessionId: session.id, reused: true };
    if (session.status === "complete") {
      if (session.paymentStatus === "paid") {
        const outcome = await settleSession(session, now);
        return outcome === "paid" || outcome === "already_paid" ? { kind: "paid" } : { kind: "processing" };
      }
      return { kind: "processing" }; // completed, money not here yet
    }
    await markPaymentDead(p._id, "expired"); // the page timed out: a new one may be made below
  }

  if (existing.length >= MAX_SESSIONS_PER_ORDER) return { kind: "too_many_attempts" };

  const attempt = existing.length + 1;
  const base = config.siteUrl ?? origin;
  const session = await gateway.createCheckoutSession({
    publicId,
    orderId: orderRef(order),
    lines: lineItems(order),
    successUrl: `${base}/bestallning/${publicId}`,
    cancelUrl: `${base}/bestallning/${publicId}?avbruten=1`,
    expiresAt: Math.floor(now.getTime() / 1000) + PAYMENT_SESSION_MINUTES * 60,
    // Deterministic per order and attempt: two simultaneous requests get the very same session back from Stripe.
    idempotencyKey: `falken-checkout:${orderRef(order)}:${attempt}`,
  });
  if (!session.url) throw new Error("Stripe returned a session without a payment page address");

  try {
    await PaymentModel.create({ orderId: order._id, provider: "stripe", providerSessionId: session.id, amountSek: order.totalSek, status: "pending" });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // the simultaneous twin already stored it: fine
  }
  await audit("checkout_session_created", orderRef(order), { type: "customer" }, now, { attempt, sessionId: session.id });
  return { kind: "ok", url: session.url, sessionId: session.id, reused: false };
}

async function markPaymentDead(paymentId: Types.ObjectId, status: "expired" | "failed") {
  await PaymentModel.updateOne({ _id: paymentId, status: "pending" }, { $set: { status } });
}

// ---- turning Stripe's answer into an order outcome ---------------------------------------------------------

/** `session` must come from Stripe's API (retrieveSession), never from a request body. */
export async function settleSession(session: CheckoutSessionInfo, now: Date): Promise<ApplyOutcome | "not_paid"> {
  if (session.status !== "complete" || session.paymentStatus !== "paid") return "not_paid";
  const { outcome } = await applyVerifiedPayment(
    markVerified({
      provider: "stripe",
      providerSessionId: session.id,
      providerPaymentId: session.paymentIntentId ?? session.id,
      // A missing or fractional amount can never equal a whole-SEK order total, so it is flagged as a mismatch.
      amountSek: session.amountTotal === null ? -1 : session.amountTotal / 100,
      currency: session.currency ?? "",
      orderReference: session.clientReferenceId ?? "(missing)",
    }),
    now,
  );
  return outcome;
}

// ---- the webhook ------------------------------------------------------------------------------------------

export type WebhookResult = { status: number; body: { received: boolean; outcome?: string; error?: string } };

const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export async function handleStripeWebhook(args: { rawBody: string; signature: string | null; gateway: StripeGateway | null; now?: Date }): Promise<WebhookResult> {
  const { rawBody, signature, gateway, now = new Date() } = args;
  if (!gateway) return { status: 503, body: { received: false, error: "payments_unavailable" } };
  if (!signature) return { status: 400, body: { received: false, error: "missing_signature" } };

  // Verified against the exact bytes that were received. Anything that fails is refused before it touches the database.
  let event;
  try {
    event = await gateway.constructEvent(rawBody, signature);
  } catch {
    return { status: 400, body: { received: false, error: "invalid_signature" } };
  }
  if (!HANDLED.has(event.type) || !event.sessionId) return { status: 200, body: { received: true, outcome: "ignored" } };

  const claim = await claimWebhookEvent({ provider: "stripe", eventId: event.id, type: event.type, now });
  if (claim.kind === "duplicate") return { status: 200, body: { received: true, outcome: "duplicate" } };
  if (claim.kind === "in_progress") return { status: 409, body: { received: false, error: "in_progress" } }; // Stripe retries

  try {
    const outcome = await processSessionEvent(gateway, event.type, event.sessionId, now);
    await completeWebhookEvent("stripe", event.id, outcome, now);
    return { status: 200, body: { received: true, outcome } };
  } catch (err) {
    // Recorded as failed so Stripe's retry (or a person) can run it again. Nothing is lost.
    await failWebhookEvent("stripe", event.id, err);
    return { status: 500, body: { received: false, error: "processing_failed" } };
  }
}

async function processSessionEvent(gateway: StripeGateway, type: string, sessionId: string, now: Date): Promise<string> {
  const payment = await PaymentModel.findOne({ provider: "stripe", providerSessionId: sessionId });
  if (!payment) {
    await audit("payment_unknown_session", sessionId, { type: "payment", id: "stripe" }, now, { type }, "payment");
    return "unknown_payment";
  }

  if (type === "checkout.session.expired") {
    await markPaymentDead(payment._id, "expired");
    return "session_expired";
  }
  if (type === "checkout.session.async_payment_failed") {
    await markPaymentDead(payment._id, "failed");
    return "payment_failed";
  }

  // "completed" does not mean "paid": asynchronous methods complete the session first and pay later. Ask Stripe.
  const session = await gateway.retrieveSession(sessionId);
  const outcome = await settleSession(session, now);
  return outcome === "not_paid" ? "awaiting_payment" : outcome;
}

// ---- reading an order's state --------------------------------------------------------------------------------

export type OrderStatusResult =
  | {
      kind: "ok";
      order: {
        publicId: string;
        status: string;
        paymentStatus: string;
        totalSek: number;
        pickupAt: string;
        paidAt: string | null;
        items: { productNameSnapshot: string; variantNameSnapshot: string; quantity: number; lineTotalSek: number }[];
      };
    }
  | { kind: "not_found" };

/** Read-only and token-protected. Coming back from Stripe proves nothing; this server-side state is the truth. */
export async function getOrderStatus(args: { publicId: string; token: string | null; tokenSecret: string }): Promise<OrderStatusResult> {
  if (!verifyAccessToken(args.publicId, args.token, args.tokenSecret)) return { kind: "not_found" };
  const o = (await OrderModel.findOne({ publicId: args.publicId }).lean()) as OrderLean | null;
  if (!o) return { kind: "not_found" };
  return {
    kind: "ok",
    order: {
      publicId: o.publicId,
      status: o.fulfillmentStatus,
      paymentStatus: o.paymentStatus,
      totalSek: o.totalSek,
      pickupAt: o.pickupAt.toISOString(),
      paidAt: o.paidAt ? o.paidAt.toISOString() : null,
      items: o.items.map((i) => ({
        productNameSnapshot: i.productNameSnapshot,
        variantNameSnapshot: i.variantNameSnapshot,
        quantity: i.quantity,
        lineTotalSek: i.lineTotalSek,
      })),
    },
  };
}

// ---- expiry that asks Stripe -----------------------------------------------------------------------------------

/**
 * Provider check for expirePendingOrders. An order with a payment page that may still be open, or a payment that has
 * not settled, is "unknown" and is NOT cancelled. If Stripe can't be reached the answer is "unknown" too.
 */
export function makeStripeExpiryCheck(gateway: StripeGateway, now: Date = new Date()): ProviderCheck {
  return async (order) => {
    const base = await recordedPaymentState(order);
    if (base !== "unknown") return base;

    const pending = await PaymentModel.find({ orderId: order._id, provider: "stripe", status: "pending" });
    let open = false;
    for (const p of pending) {
      let session: CheckoutSessionInfo;
      try {
        session = await gateway.retrieveSession(p.providerSessionId);
      } catch {
        return "unknown";
      }
      if (session.status === "expired") {
        await markPaymentDead(p._id, "expired");
      } else if (session.status === "complete" && session.paymentStatus === "paid") {
        const outcome = await settleSession(session, now);
        // Recorded as paid just now: the order is no longer pending, so there is nothing to cancel or to flag.
        return outcome === "paid" || outcome === "already_paid" ? "unknown" : "paid";
      } else {
        open = true; // still open, or complete but not settled yet
      }
    }
    return open ? "unknown" : "unpaid";
  };
}
