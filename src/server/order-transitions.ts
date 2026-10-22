import type { Types } from "mongoose";
import type { FulfillmentStatus, PaymentProvider } from "./models/constants.ts";
import { AuditLogModel } from "./models/events.ts";
import { OrderModel, type OrderDoc } from "./models/order.ts";
import { canTransition, type Actor } from "./order-state.ts";

// The only place an order's status is written. It checks the rules in order-state.ts, then changes the status
// and appends the history entry in ONE atomic update that only matches if the order is still in the status we
// read. Two requests racing for the same change: one wins, the other finds the order already moved.

export type OrderLean = OrderDoc & { _id: Types.ObjectId };

export type TransitionResult =
  | { ok: true; changed: boolean; order: OrderLean }
  | { ok: false; reason: "not_found" | "unknown_transition" | "actor_not_allowed" | "conflict"; from?: FulfillmentStatus };

export type TransitionArgs = {
  orderId: Types.ObjectId | string;
  to: FulfillmentStatus;
  actor: Actor;
  reason?: string;
  now?: Date;
  /** Fields that must change together with the status. Nothing else can be set through here. */
  set?: { paymentProvider?: PaymentProvider; paymentId?: Types.ObjectId };
};

export async function transitionOrder({ orderId, to, actor, reason, now = new Date(), set }: TransitionArgs): Promise<TransitionResult> {
  const order = (await OrderModel.findById(orderId).lean()) as OrderLean | null;
  if (!order) return { ok: false, reason: "not_found" };

  const from = order.fulfillmentStatus;
  // Asking for the status the order is already in is not an error: retries and duplicate events land here.
  if (from === to) return { ok: true, changed: false, order };

  const check = canTransition(from, to, actor);
  if (!check.ok) {
    await audit("transition_rejected", String(order._id), actor, now, { from, to, why: check.reason });
    return { ok: false, reason: check.reason, from };
  }

  const fields: Record<string, unknown> = { fulfillmentStatus: to };
  if (to === "PAID") {
    fields.paymentStatus = "paid";
    fields.paidAt = now;
  }
  if (to === "CANCELLED") fields.cancelledAt = now;
  if (to === "REFUNDED") fields.paymentStatus = "refunded";
  if (set?.paymentProvider) fields.paymentProvider = set.paymentProvider;
  if (set?.paymentId) fields.paymentId = set.paymentId;

  const updated = (await OrderModel.findOneAndUpdate(
    { _id: order._id, fulfillmentStatus: from },
    {
      $set: fields,
      $push: { statusHistory: { at: now, from, to, actorType: actor.type, actorId: actor.id, reason } },
    },
    { new: true },
  ).lean()) as OrderLean | null;

  if (updated) return { ok: true, changed: true, order: updated };

  // Lost the race. If the winner made the very change we wanted, that is success; otherwise report a conflict.
  const current = (await OrderModel.findById(order._id).lean()) as OrderLean | null;
  if (current && current.fulfillmentStatus === to) return { ok: true, changed: false, order: current };
  return { ok: false, reason: "conflict", from: current?.fulfillmentStatus };
}

/** Append-only note for things that don't belong inside the order. Never throws: auditing must not break a payment. */
export async function audit(
  action: string,
  entityId: string,
  actor: Actor,
  at: Date,
  detail?: Record<string, unknown>,
  entity = "order",
): Promise<void> {
  try {
    await AuditLogModel.create({ at, action, entity, entityId, actorType: actor.type, actorId: actor.id, detail });
  } catch (err) {
    console.error("audit log write failed:", err instanceof Error ? err.message : "unknown");
  }
}

/** Flags an order for a person to look at. Keeps the first reason: later problems are recorded in the audit log. */
export async function flagForReview(orderId: Types.ObjectId | string, reason: string, detail: string, now: Date): Promise<void> {
  await OrderModel.updateOne(
    { _id: orderId, "needsReview.reason": { $exists: false } },
    { $set: { needsReview: { reason, detail: detail.slice(0, 300), at: now } } },
  );
}
