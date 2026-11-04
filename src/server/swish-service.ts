import { randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import { OrderModel, PaymentModel } from "./models/order.ts";
import { verifyAccessToken } from "./order-access.ts";
import type { OrderLean } from "./order-transitions.ts";
import { audit } from "./order-transitions.ts";
import { applyVerifiedPayment, markVerified, type ApplyOutcome } from "./payment-apply.ts";
import { PAYMENT_SESSION_MINUTES, type PaymentsConfig } from "./payments-config.ts";
import type { SwishGateway, SwishPaymentInfo } from "./swish-gateway.ts";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "./webhook-events.ts";

export const MAX_SWISH_SESSIONS_PER_ORDER = 5;

const orderRef = (o: { _id: Types.ObjectId }) => String(o._id);

export type SwishCheckoutResult =
  | {
      kind: "ok";
      instructionUUID: string;
      token: string;
      swishUrl: string;
      reused: boolean;
      expiresAt: number;
    }
  | { kind: "unavailable" }
  | { kind: "not_found" }
  | { kind: "not_payable"; status: string }
  | { kind: "expired" }
  | { kind: "paid" }
  | { kind: "too_many_attempts" };

export type SwishCheckoutArgs = {
  publicId: string;
  token: string | null;
  origin: string;
  tokenSecret: string;
  gateway: SwishGateway | null;
  config: PaymentsConfig;
  now?: Date;
};

export async function createSwishCheckout(args: SwishCheckoutArgs): Promise<SwishCheckoutResult> {
  const { publicId, token, origin, tokenSecret, gateway, config, now = new Date() } = args;
  if (!config.enabled || !config.swish || !gateway) return { kind: "unavailable" };

  if (!verifyAccessToken(publicId, token, tokenSecret)) return { kind: "not_found" };
  const order = (await OrderModel.findOne({ publicId }).lean()) as OrderLean | null;
  if (!order) return { kind: "not_found" };
  if (order.fulfillmentStatus !== "PENDING_PAYMENT") return { kind: "not_payable", status: order.fulfillmentStatus };
  if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() <= now.getTime()) return { kind: "expired" };

  const existing = await PaymentModel.find({ orderId: order._id, provider: "swish" }).sort({ createdAt: -1 }).lean();

  // If a pending payment request is already open, check if it's paid or can be reused
  for (const p of existing.filter((x) => x.status === "pending")) {
    try {
      const swishInfo = await gateway.retrievePaymentRequest(p.providerSessionId);
      if (swishInfo.status === "PAID") {
        const outcome = await settleSwishPayment(swishInfo, now);
        if (outcome === "paid" || outcome === "already_paid") return { kind: "paid" };
      }
      if (swishInfo.status === "CREATED") {
        const token = swishInfo.paymentRequestToken ?? "";
        return {
          kind: "ok",
          instructionUUID: p.providerSessionId,
          token,
          swishUrl: `swish://paymentrequest?token=${token}`,
          reused: true,
          expiresAt: Math.floor(now.getTime() / 1000) + PAYMENT_SESSION_MINUTES * 60,
        };
      }
      if (swishInfo.status === "DECLINED" || swishInfo.status === "ERROR" || swishInfo.status === "CANCELLED") {
        await PaymentModel.updateOne({ _id: p._id, status: "pending" }, { $set: { status: "failed" } });
      }
    } catch {
      // If retrieval fails (e.g. timeout), continue to allow retry
    }
  }

  if (existing.length >= MAX_SWISH_SESSIONS_PER_ORDER) return { kind: "too_many_attempts" };

  const attempt = existing.length + 1;
  const base = config.siteUrl ?? origin;
  const instructionUUID = randomUUID().replace(/-/g, "").toUpperCase();

  const swishReq = await gateway.createPaymentRequest({
    instructionUUID,
    payeePaymentReference: order.publicId,
    callbackUrl: `${base}/api/webhooks/swish`,
    amountSek: order.totalSek,
    message: `Falken Bestallning ${order.publicId}`,
  });

  const tokenStr = swishReq.paymentRequestToken ?? "";

  try {
    await PaymentModel.create({
      orderId: order._id,
      provider: "swish",
      providerSessionId: instructionUUID,
      amountSek: order.totalSek,
      status: "pending",
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
  }

  await audit("swish_payment_request_created", orderRef(order), { type: "customer" }, now, { attempt, instructionUUID });

  return {
    kind: "ok",
    instructionUUID,
    token: tokenStr,
    swishUrl: `swish://paymentrequest?token=${tokenStr}`,
    reused: false,
    expiresAt: Math.floor(now.getTime() / 1000) + PAYMENT_SESSION_MINUTES * 60,
  };
}

export async function settleSwishPayment(info: SwishPaymentInfo, now: Date): Promise<ApplyOutcome | "not_paid"> {
  if (info.status !== "PAID") return "not_paid";

  const { outcome } = await applyVerifiedPayment(
    markVerified({
      provider: "swish",
      providerSessionId: info.id,
      providerPaymentId: info.paymentReference ?? info.id,
      amountSek: info.amount,
      currency: info.currency,
      orderReference: info.payeePaymentReference,
    }),
    now,
  );
  return outcome;
}

export type SwishCallbackBody = {
  id: string; // instructionUUID
  paymentReference?: string;
  payeePaymentReference?: string;
  amount: number | string;
  currency: string;
  status: string;
  datePaid?: string;
  errorMessage?: string;
  errorCode?: string;
};

export type SwishWebhookResult = {
  status: number;
  body: { received: boolean; outcome?: string; error?: string };
};

export async function handleSwishWebhook(args: {
  rawBody: string;
  gateway: SwishGateway | null;
  now?: Date;
}): Promise<SwishWebhookResult> {
  const { rawBody, gateway, now = new Date() } = args;
  if (!gateway) return { status: 503, body: { received: false, error: "payments_unavailable" } };

  let callback: SwishCallbackBody;
  try {
    callback = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { received: false, error: "invalid_json" } };
  }

  const { id: instructionUUID, status } = callback;
  if (!instructionUUID || !status) {
    return { status: 400, body: { received: false, error: "missing_fields" } };
  }

  const claim = await claimWebhookEvent({
    provider: "swish",
    eventId: `${instructionUUID}:${status}`,
    type: status,
    now,
  });
  if (claim.kind === "duplicate") {
    return { status: 200, body: { received: true, outcome: "duplicate_event_ignored" } };
  }
  if (claim.kind === "in_progress") {
    return { status: 409, body: { received: false, error: "event_in_progress" } };
  }

  try {
    // Authoritative verification: ask Swish API directly for the payment state
    const verifiedInfo = await gateway.retrievePaymentRequest(instructionUUID);
    if (verifiedInfo.status === "PAID") {
      const outcome = await settleSwishPayment(verifiedInfo, now);
      await completeWebhookEvent("swish", `${instructionUUID}:${status}`, outcome, now);
      return { status: 200, body: { received: true, outcome } };
    } else {
      await completeWebhookEvent("swish", `${instructionUUID}:${status}`, `status_${verifiedInfo.status}`, now);
      return { status: 200, body: { received: true, outcome: `status_${verifiedInfo.status}` } };
    }
  } catch (err) {
    await failWebhookEvent("swish", `${instructionUUID}:${status}`, err);
    return { status: 500, body: { received: false, error: "settlement_failed" } };
  }
}

