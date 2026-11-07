import mongoose from "mongoose";
import { AuditLogModel } from "./models/events.ts";
import { OrderModel } from "./models/order.ts";
import type { AdminPrincipal } from "./admin-auth.ts";

export type OnSitePaymentMethod = "cash" | "card_terminal";

export type CollectionResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_found" | "wrong_payment_method" | "already_collected" | "conflict" };

/**
 * Records an explicitly confirmed counter collection. The amount is never an
 * input: MongoDB copies the saved order total into the embedded receipt while
 * atomically marking this pay-on-pickup order as paid. The receipt and its
 * audit record share a MongoDB transaction, so a failed audit write cannot
 * leave a paid order without collection evidence.
 */
export async function collectPayOnPickupPayment(input: {
  publicId: string;
  method: OnSitePaymentMethod;
  idempotencyKey: string;
  staff: AdminPrincipal;
  now?: Date;
}): Promise<CollectionResult> {
  const now = input.now ?? new Date();
  // Do not rely on background auto-index creation: the deduplication constraint
  // must exist before a staff member can record a counter payment.
  await AuditLogModel.init();
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const order = await OrderModel.findOne({ publicId: input.publicId })
        .select("_id paymentMethod paymentStatus onSiteCollection totalSek")
        .session(session)
        .lean();
      if (!order) return { ok: false, reason: "not_found" } as const;
      if (order.paymentMethod !== "pay_on_pickup") return { ok: false, reason: "wrong_payment_method" } as const;

      const existing = order.onSiteCollection;
      if (existing) {
        return existing.idempotencyKey === input.idempotencyKey
          ? { ok: true, changed: false } as const
          : { ok: false, reason: "already_collected" } as const;
      }
      if (order.paymentStatus !== "unpaid") return { ok: false, reason: "already_collected" } as const;

      const updated = await OrderModel.findOneAndUpdate(
        {
          _id: order._id,
          paymentMethod: "pay_on_pickup",
          paymentStatus: "unpaid",
          onSiteCollection: { $exists: false },
        },
        {
          $set: {
            paymentStatus: "paid",
            paidAt: now,
            onSiteCollection: {
              method: input.method,
              amountSek: order.totalSek,
              collectedBy: input.staff.id,
              collectedAt: now,
              idempotencyKey: input.idempotencyKey,
            },
          },
        },
        { new: true, session },
      ).lean();

      if (!updated) {
        const current = await OrderModel.findById(order._id).select("onSiteCollection").session(session).lean();
        return current?.onSiteCollection?.idempotencyKey === input.idempotencyKey
          ? { ok: true, changed: false } as const
          : { ok: false, reason: "conflict" } as const;
      }

      // Do not acknowledge success merely because Mongo accepted the update.
      // This catches a stale strict Mongoose model which would otherwise drop
      // an unknown embedded field while still changing paymentStatus.
      const receipt = updated.onSiteCollection;
      if (
        !receipt ||
        receipt.method !== input.method ||
        receipt.amountSek !== order.totalSek ||
        receipt.collectedBy !== input.staff.id ||
        receipt.idempotencyKey !== input.idempotencyKey
      ) {
        throw new Error("Pay-on-pickup collection evidence was not persisted");
      }

      await AuditLogModel.create([{
        at: now,
        action: "pay_on_pickup_collected",
        entity: "order",
        entityId: String(order._id),
        actorType: "staff",
        actorId: input.staff.id,
        deduplicationKey: `pay_on_pickup_collected:${order._id}`,
        detail: { method: input.method, amountSek: order.totalSek },
      }], { session });
      return { ok: true, changed: true } as const;
    }, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      readPreference: "primary",
    });
  } finally {
    await session.endSession();
  }
}
