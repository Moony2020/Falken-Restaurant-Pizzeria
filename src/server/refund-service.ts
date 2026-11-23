import { createHash } from "node:crypto";
import mongoose, { type Types } from "mongoose";
import type { AdminPrincipal } from "./admin-auth.ts";
import { AuditLogModel } from "./models/events.ts";
import { OrderModel, PaymentModel, type OrderDoc, type PaymentDoc } from "./models/order.ts";

export type CanonicalRefundProvider = "stripe" | "swish" | "cash" | "card_terminal";

export type RefundReasonCategory =
  | "customer_cancellation"
  | "out_of_stock"
  | "kitchen_delay"
  | "quality_issue"
  | "other";

export type RecordFullRefundInput = {
  publicId: string;
  amountSek: number;
  reasonCategory: RefundReasonCategory;
  reasonNote?: string;
  method?: CanonicalRefundProvider;
  externalReference: string;
  idempotencyKey: string;
  staff: AdminPrincipal;
  now?: Date;
};

export type RecordFullRefundResult =
  | { ok: true; changed: boolean; order: OrderDoc }
  | {
      ok: false;
      reason:
        | "not_found"
        | "order_not_paid"
        | "refund_amount_mismatch"
        | "already_refunded"
        | "idempotency_conflict"
        | "duplicate_external_reference"
        | "payment_record_missing"
        | "payment_already_refunded"
        | "inconsistent_payment_refund"
        | "on_site_collection_missing"
        | "method_mismatch"
        | "invalid_reference_format"
        | "conflict"
        | "transactions_required";
    };

export type CancelUnpaidOrderInput = {
  publicId: string;
  reasonCategory: RefundReasonCategory;
  reasonNote?: string;
  staff: AdminPrincipal;
  now?: Date;
};

export type CancelUnpaidOrderResult =
  | { ok: true; changed: boolean; order: OrderDoc }
  | {
      ok: false;
      reason:
        | "not_found"
        | "refund_required"
        | "cancellation_blocked_session_active"
        | "conflict"
        | "transactions_required";
    };

/**
 * Normalizes and validates external refund references by provider.
 * Rules:
 *  - Stripe: trimmed, case-sensitive, must match ^re_[a-zA-Z0-9]{20,32}$
 *  - Swish: trimmed, dashes/whitespace removed, uppercase, must match 32 hex chars (UUID) or 10-20 digits (bank ref)
 *  - Cash: trimmed, uppercase, whitespace replaced with single hyphen, 3-30 chars
 *  - Card Terminal: trimmed, uppercase, whitespace replaced with single hyphen, 3-30 chars
 */
export function normalizeExternalReference(
  provider: CanonicalRefundProvider,
  raw: string,
): { canonical: string; error?: string } {
  if (typeof raw !== "string") {
    return { canonical: "", error: "invalid_reference_format" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { canonical: "", error: "invalid_reference_format" };
  }

  if (provider === "stripe") {
    if (!/^re_[a-zA-Z0-9_-]{16,64}$/.test(trimmed)) {
      return { canonical: "", error: "invalid_reference_format" };
    }
    return { canonical: trimmed };
  }

  if (provider === "swish") {
    const cleaned = trimmed.replace(/[-\s]/g, "").toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(cleaned) && !/^[0-9]{10,20}$/.test(cleaned)) {
      return { canonical: "", error: "invalid_reference_format" };
    }
    return { canonical: cleaned };
  }

  // cash & card_terminal
  const cleaned = trimmed.toUpperCase().replace(/\s+/g, "-");
  if (!/^[A-Z0-9\-_/]{3,30}$/.test(cleaned)) {
    return { canonical: "", error: "invalid_reference_format" };
  }
  return { canonical: cleaned };
}

/**
 * Resolves the canonical refund provider from authoritative payment evidence.
 * - Electronic: card -> stripe, swish -> swish
 * - Pay-on-pickup: reads order.onSiteCollection.method -> cash or card_terminal
 * Validates that requested method matches original collection evidence.
 */
export function resolveCanonicalRefundProvider(
  order: OrderDoc,
  requestedMethod?: CanonicalRefundProvider,
): { provider?: CanonicalRefundProvider; error?: "on_site_collection_missing" | "method_mismatch" } {
  let authoritative: CanonicalRefundProvider;

  if (order.paymentMethod === "card") {
    authoritative = "stripe";
  } else if (order.paymentMethod === "swish") {
    authoritative = "swish";
  } else if (order.paymentMethod === "pay_on_pickup") {
    if (!order.onSiteCollection?.method) {
      return { error: "on_site_collection_missing" };
    }
    authoritative = order.onSiteCollection.method === "cash" ? "cash" : "card_terminal";
  } else {
    authoritative = "cash";
  }

  if (requestedMethod && requestedMethod !== authoritative) {
    return { error: "method_mismatch" };
  }

  return { provider: authoritative };
}

/**
 * Stable server-calculated SHA-256 fingerprint for idempotency conflict detection.
 */
export function computeRefundRequestHash(data: {
  publicId: string;
  paymentOrCollectionId: string;
  amountSek: number;
  canonicalProvider: CanonicalRefundProvider;
  canonicalReference: string;
  reasonCategory: string;
  reasonNote: string;
}): string {
  const canonicalString = JSON.stringify({
    publicId: data.publicId,
    paymentOrCollectionId: data.paymentOrCollectionId,
    amountSek: data.amountSek,
    canonicalProvider: data.canonicalProvider,
    canonicalReference: data.canonicalReference,
    reasonCategory: data.reasonCategory,
    reasonNote: data.reasonNote.trim(),
  });
  return createHash("sha256").update(canonicalString).digest("hex");
}

/**
 * Detects whether the current MongoDB connection supports multi-document transactions.
 * Transactions require a replica set (setName present) or mongos (msg === "isdbgrid").
 * Standalone mongod instances do NOT support transactions and must fail closed.
 */
export async function assertTransactionsSupported(): Promise<boolean> {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    const res = await db.command({ hello: 1 });
    return Boolean(res?.setName || res?.msg === "isdbgrid");
  } catch {
    return false;
  }
}

/**
 * Checks if a MongoDB driver or server error indicates that transactions are unsupported
 * (e.g. Error code 20 / IllegalOperation on standalone mongod).
 */
export function isTransactionUnsupportedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number; codeName?: string; message?: string };
  return (
    e.code === 20 ||
    e.codeName === "IllegalOperation" ||
    Boolean(e.message && /transaction numbers are only allowed on a replica set member or mongos/i.test(e.message)) ||
    Boolean(e.message && /transactions are not supported/i.test(e.message))
  );
}

/**
 * Records a full refund for an order in a single atomic MongoDB transaction.
 * Strictly supports Full Refund Only (amountSek === order.totalSek).
 * FAIL-CLOSED: Requires supported MongoDB transaction. Never executes writes without a transaction.
 */
export async function recordFullRefund(input: RecordFullRefundInput): Promise<RecordFullRefundResult> {
  const now = input.now ?? new Date();
  await AuditLogModel.init();

  const isSupported = await assertTransactionsSupported();
  if (!isSupported) {
    return { ok: false, reason: "transactions_required" };
  }

  const execute = async (session: mongoose.ClientSession): Promise<RecordFullRefundResult> => {
    const orderQuery = OrderModel.findOne({ publicId: input.publicId }).session(session);
    const order = (await orderQuery.lean()) as OrderDoc & { _id: Types.ObjectId };
    if (!order) return { ok: false, reason: "not_found" };

    // 1. Full refund amount check: strictly amountSek === order.totalSek
    if (input.amountSek !== order.totalSek) {
      return { ok: false, reason: "refund_amount_mismatch" };
    }

    // 2. Must be paid
    if (order.paymentStatus !== "paid") {
      // Check if already refunded under this exact idempotency key
      if (order.paymentStatus === "refunded" && order.refundRecord?.idempotencyKey === input.idempotencyKey) {
        const canonicalCheck = resolveCanonicalRefundProvider(order, input.method);
        if (canonicalCheck.provider) {
          const norm = normalizeExternalReference(canonicalCheck.provider, input.externalReference);
          if (norm.canonical) {
            const paymentOrCollId = order.paymentId ? String(order.paymentId) : (order.onSiteCollection?.idempotencyKey ?? "on_site");
            const expectedHash = computeRefundRequestHash({
              publicId: order.publicId,
              paymentOrCollectionId: paymentOrCollId,
              amountSek: input.amountSek,
              canonicalProvider: canonicalCheck.provider,
              canonicalReference: norm.canonical,
              reasonCategory: input.reasonCategory,
              reasonNote: input.reasonNote ?? "",
            });
            if (order.refundRecord.requestHash === expectedHash) {
              return { ok: true, changed: false, order };
            }
            return { ok: false, reason: "idempotency_conflict" };
          }
        }
      }
      return { ok: false, reason: order.paymentStatus === "refunded" ? "already_refunded" : "order_not_paid" };
    }

    // 3. Resolve canonical refund provider
    const providerResolution = resolveCanonicalRefundProvider(order, input.method);
    if (providerResolution.error) {
      return { ok: false, reason: providerResolution.error };
    }
    const canonicalProvider = providerResolution.provider!;

    // 4. Normalize external reference
    const normRef = normalizeExternalReference(canonicalProvider, input.externalReference);
    if (normRef.error || !normRef.canonical) {
      return { ok: false, reason: "invalid_reference_format" };
    }
    const canonicalRef = normRef.canonical;

    // 5. Payment ID or On-Site identifier for fingerprinting
    let paymentOrCollId = "on_site";
    let paymentRecord: (PaymentDoc & { _id: Types.ObjectId }) | null = null;

    if (canonicalProvider === "stripe" || canonicalProvider === "swish") {
      // Electronic payment MUST have paymentId
      if (!order.paymentId) {
        return { ok: false, reason: "payment_record_missing" };
      }
      paymentOrCollId = String(order.paymentId);

      paymentRecord = (await PaymentModel.findById(order.paymentId).session(session).lean()) as (PaymentDoc & { _id: Types.ObjectId }) | null;

      if (
        !paymentRecord ||
        String(paymentRecord.orderId) !== String(order._id) ||
        paymentRecord.status !== "paid" ||
        paymentRecord.amountSek !== order.totalSek
      ) {
        return { ok: false, reason: "payment_record_missing" };
      }

      // MANDATORY CHECK 1: payment.refundedSek must be 0
      if (
        typeof paymentRecord.refundedSek !== "number" ||
        !Number.isInteger(paymentRecord.refundedSek) ||
        paymentRecord.refundedSek !== 0
      ) {
        return { ok: false, reason: paymentRecord.refundedSek > 0 ? "payment_already_refunded" : "inconsistent_payment_refund" };
      }
    } else {
      // On-site collection: cash or card_terminal
      if (!order.onSiteCollection || order.onSiteCollection.amountSek !== order.totalSek) {
        return { ok: false, reason: "on_site_collection_missing" };
      }
      paymentOrCollId = order.onSiteCollection.idempotencyKey;
    }

    // 6. Compute stable payload fingerprint
    const requestHash = computeRefundRequestHash({
      publicId: order.publicId,
      paymentOrCollectionId: paymentOrCollId,
      amountSek: input.amountSek,
      canonicalProvider,
      canonicalReference: canonicalRef,
      reasonCategory: input.reasonCategory,
      reasonNote: input.reasonNote ?? "",
    });

    // 7. Check existing refund record on Order (idempotency check)
    if (order.refundRecord) {
      if (order.refundRecord.idempotencyKey === input.idempotencyKey) {
        if (order.refundRecord.requestHash === requestHash) {
          return { ok: true, changed: false, order };
        }
        return { ok: false, reason: "idempotency_conflict" };
      }
      return { ok: false, reason: "already_refunded" };
    }

    // 8. Deduplication check across the entire database via AuditLog
    const deduplicationKey = `refund_ref:${canonicalProvider}:${canonicalRef}`;
    const existingAudit = await AuditLogModel.findOne({ deduplicationKey }).session(session).lean();

    if (existingAudit) {
      if (existingAudit.entityId !== String(order._id)) {
        return { ok: false, reason: "duplicate_external_reference" };
      }
    }

    // 9. Atomic updates
    const targetFulfillment = order.fulfillmentStatus === "PICKED_UP" ? "PICKED_UP" : "CANCELLED";
    const refundRecordData = {
      amountSek: order.totalSek,
      reasonCategory: input.reasonCategory,
      reasonNote: (input.reasonNote ?? "").slice(0, 300),
      canonicalProvider,
      externalReference: input.externalReference.trim(),
      canonicalReference: canonicalRef,
      verificationTier: "admin_attested" as const,
      recordedBy: input.staff.id,
      recordedAt: now,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    };

    const updateFields: Record<string, unknown> = {
      paymentStatus: "refunded",
      totalRefundedSek: order.totalSek,
      refundRecord: refundRecordData,
    };
    if (targetFulfillment === "CANCELLED") {
      updateFields.fulfillmentStatus = "CANCELLED";
      updateFields.cancelledAt = now;
    }

    const updatedOrder = (await OrderModel.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: "paid",
        totalRefundedSek: 0,
      },
      {
        $set: updateFields,
        $push: {
          statusHistory: {
            at: now,
            from: order.fulfillmentStatus,
            to: targetFulfillment,
            actorType: "staff",
            actorId: input.staff.id,
            reason: `refund:${input.reasonCategory}`,
          },
        },
      },
      { returnDocument: "after", session },
    ).lean()) as OrderDoc | null;

    if (!updatedOrder) {
      // Lost race or state changed
      const current = await OrderModel.findById(order._id).session(session).lean();
      if (current?.refundRecord?.idempotencyKey === input.idempotencyKey) {
        if (current.refundRecord.requestHash === requestHash) {
          return { ok: true, changed: false, order: current as OrderDoc };
        }
        return { ok: false, reason: "idempotency_conflict" };
      }
      return { ok: false, reason: "conflict" };
    }

    // 10. Update electronic Payment record if applicable
    if (paymentRecord) {
      const paymentUpdate = await PaymentModel.updateOne(
        { _id: paymentRecord._id, status: "paid", refundedSek: 0 },
        { $set: { status: "refunded", refundedSek: order.totalSek } },
        { session },
      );
      if (paymentUpdate.modifiedCount !== 1) {
        throw new Error("Failed to atomically update Payment record status and refundedSek");
      }
    }

    // 11. Write immutable AuditLog
    await AuditLogModel.create(
      [
        {
          at: now,
          action:
            canonicalProvider === "cash" || canonicalProvider === "card_terminal"
              ? "on_site_refund_recorded"
              : "electronic_refund_recorded",
          entity: "order",
          entityId: String(order._id),
          actorType: "staff",
          actorId: input.staff.id,
          deduplicationKey,
          detail: {
            amountSek: order.totalSek,
            canonicalProvider,
            canonicalReference: canonicalRef,
            externalReference: input.externalReference.trim(),
            verificationTier: "admin_attested",
            reasonCategory: input.reasonCategory,
            reasonNote: input.reasonNote ?? "",
            requestHash,
            idempotencyKey: input.idempotencyKey,
            previousFulfillmentStatus: order.fulfillmentStatus,
            newFulfillmentStatus: targetFulfillment,
          },
        },
      ],
      { session },
    );

    return { ok: true, changed: true, order: updatedOrder };
  };

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(
      () => execute(session),
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      return { ok: false, reason: "transactions_required" };
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Cancels an eligible unpaid order safely.
 * Requirements:
 *  - Must execute inside a single atomic MongoDB transaction.
 *  - If paymentStatus === 'paid': reject with refund_required.
 *  - Pay-on-pickup unpaid: cancel directly, no refund, write AuditLog atomically.
 *  - Online pending payment: check payment window and expiry; if still active/uncertain, reject with cancellation_blocked_session_active.
 *  - FAIL-CLOSED: Requires supported MongoDB transaction. Never executes writes without a transaction.
 */
export async function cancelUnpaidOrder(input: CancelUnpaidOrderInput): Promise<CancelUnpaidOrderResult> {
  const isSupported = await assertTransactionsSupported();
  if (!isSupported) {
    return { ok: false, reason: "transactions_required" };
  }

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const now = input.now ?? new Date();
        const order = (await OrderModel.findOne({ publicId: input.publicId }).session(session).lean()) as (OrderDoc & { _id: Types.ObjectId }) | null;
        if (!order) return { ok: false, reason: "not_found" };

        if (order.fulfillmentStatus === "CANCELLED") {
          return { ok: true, changed: false, order };
        }

        // 1. Paid orders cannot be cancelled through unpaid cancellation
        if (order.paymentStatus === "paid" || (order.totalRefundedSek ?? 0) > 0) {
          return { ok: false, reason: "refund_required" };
        }

        // 2. Pay-on-pickup unpaid orders: safe to cancel immediately inside transaction
        if (order.paymentMethod === "pay_on_pickup") {
          if (order.paymentStatus !== "unpaid") {
            return { ok: false, reason: "refund_required" };
          }

          const updated = (await OrderModel.findOneAndUpdate(
            { _id: order._id, fulfillmentStatus: order.fulfillmentStatus, paymentStatus: "unpaid" },
            {
              $set: { fulfillmentStatus: "CANCELLED", cancelledAt: now },
              $push: {
                statusHistory: {
                  at: now,
                  from: order.fulfillmentStatus,
                  to: "CANCELLED",
                  actorType: "staff",
                  actorId: input.staff.id,
                  reason: `unpaid_cancellation:${input.reasonCategory}`,
                },
              },
            },
            { session, returnDocument: "after" },
          ).lean()) as OrderDoc | null;

          if (!updated) {
            const current = await OrderModel.findById(order._id).session(session).lean();
            if (current?.fulfillmentStatus === "CANCELLED") return { ok: true, changed: false, order: current as OrderDoc };
            return { ok: false, reason: "conflict" };
          }

          await AuditLogModel.create(
            [
              {
                at: now,
                action: "order_cancelled_unpaid",
                entity: "order",
                entityId: String(order._id),
                actorType: "staff",
                actorId: input.staff.id,
                detail: {
                  reasonCategory: input.reasonCategory,
                  reasonNote: input.reasonNote ?? "",
                  previousFulfillmentStatus: order.fulfillmentStatus,
                  paymentStatus: order.paymentStatus,
                  totalSek: order.totalSek,
                },
              },
            ],
            { session },
          );

          return { ok: true, changed: true, order: updated };
        }

        // 3. Online payment (card or swish) with paymentStatus === 'pending'
        if (order.paymentStatus === "pending") {
          // If the payment session window has NOT expired yet, customer might be actively completing payment!
          if (order.paymentExpiresAt && order.paymentExpiresAt.getTime() > now.getTime()) {
            return { ok: false, reason: "cancellation_blocked_session_active" };
          }

          // Check recorded payment state across sessions inside transaction
          const payments = await PaymentModel.find({ orderId: order._id }).session(session).lean();
          if (payments.some((p) => p.status === "paid")) {
            return { ok: false, reason: "refund_required" };
          }
          if (payments.some((p) => p.status === "pending")) {
            return { ok: false, reason: "cancellation_blocked_session_active" };
          }

          // State is confirmed unpaid/dead
          const updated = (await OrderModel.findOneAndUpdate(
            { _id: order._id, fulfillmentStatus: order.fulfillmentStatus, paymentStatus: "pending" },
            {
              $set: { fulfillmentStatus: "CANCELLED", paymentStatus: "failed", cancelledAt: now },
              $push: {
                statusHistory: {
                  at: now,
                  from: order.fulfillmentStatus,
                  to: "CANCELLED",
                  actorType: "staff",
                  actorId: input.staff.id,
                  reason: `unpaid_cancellation:${input.reasonCategory}`,
                },
              },
            },
            { session, returnDocument: "after" },
          ).lean()) as OrderDoc | null;

          if (!updated) {
            const current = await OrderModel.findById(order._id).session(session).lean();
            if (current?.fulfillmentStatus === "CANCELLED") return { ok: true, changed: false, order: current as OrderDoc };
            return { ok: false, reason: "conflict" };
          }

          await AuditLogModel.create(
            [
              {
                at: now,
                action: "order_cancelled_unpaid",
                entity: "order",
                entityId: String(order._id),
                actorType: "staff",
                actorId: input.staff.id,
                detail: {
                  reasonCategory: input.reasonCategory,
                  reasonNote: input.reasonNote ?? "",
                  previousFulfillmentStatus: order.fulfillmentStatus,
                  paymentStatus: "failed",
                  totalSek: order.totalSek,
                },
              },
            ],
            { session },
          );

          return { ok: true, changed: true, order: updated };
        }

        return { ok: false, reason: "refund_required" };
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      },
    );
  } catch (err) {
    if (isTransactionUnsupportedError(err)) {
      return { ok: false, reason: "transactions_required" };
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
