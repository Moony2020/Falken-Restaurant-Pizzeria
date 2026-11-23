import { randomBytes } from "node:crypto";
import mongoose, { type Model, type Types } from "mongoose";
import { FULFILLMENT_STATUS, PAYMENT_METHOD, PAYMENT_PROVIDER, PAYMENT_STATUS, type FulfillmentStatus, type PaymentMethod, type PaymentProvider, type PaymentStatus } from "./constants.ts";

// mongoose is CommonJS: destructure the default export so this also loads under plain Node ESM.
const { model, models, Schema } = mongoose;

const sek = { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: "{PATH} must be a whole number of SEK" } };

// Crockford base32 without ambiguous letters: 10 chars = 50 bits, so a public order link can't be guessed.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function generatePublicId(): string {
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
}

// Everything priced is copied into the order, so later menu edits never rewrite history (plan §5, §8).
const modifierSnapshotSchema = new Schema(
  {
    modifierSlug: { type: String, required: true },
    labelSv: { type: String, required: true },
    priceSek: sek,
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

const itemSchema = new Schema(
  {
    productSlug: { type: String, required: true },
    productNameSnapshot: { type: String, required: true },
    variantId: { type: String, required: true },
    variantNameSnapshot: { type: String, required: true },
    basePriceSek: sek,
    modifiersSnapshot: { type: [modifierSnapshotSchema], default: [] },
    removedIngredients: { type: [String], default: [] },
    note: { type: String, maxlength: 200, default: "" },
    ifUnavailable: { type: String, enum: ["call", "remove_item", "cancel_order"], default: "call" },
    quantity: { type: Number, required: true, min: 1, max: 20, validate: Number.isInteger },
    lineTotalSek: sek,
  },
  { _id: false },
);

// Every status change is appended here in the SAME atomic update that changes the status, so the history can
// never disagree with the order (no transactions needed, which also works on a standalone local MongoDB).
const statusHistorySchema = new Schema(
  {
    at: { type: Date, required: true },
    from: { type: String, enum: FULFILLMENT_STATUS },
    to: { type: String, enum: FULFILLMENT_STATUS, required: true },
    actorType: { type: String, enum: ["payment", "staff", "system", "customer"], required: true },
    actorId: { type: String, maxlength: 100 },
    reason: { type: String, maxlength: 200 },
  },
  { _id: false },
);

// Staff-recorded collection for an order that is paid at the counter. This is
// deliberately embedded in the Order so changing it and paymentStatus is one
// conditional MongoDB update, rather than two records that could diverge.
const onSiteCollectionSchema = new Schema(
  {
    method: { type: String, enum: ["cash", "card_terminal"], required: true },
    amountSek: sek,
    collectedBy: { type: String, required: true, maxlength: 100 },
    collectedAt: { type: Date, required: true },
    idempotencyKey: { type: String, required: true, minlength: 16, maxlength: 100 },
  },
  { _id: false },
);

// Immutable snapshot of seller/vendor identity captured server-side at order creation.
// MUST NOT be overwritten by settings changes, status transitions, retries, or idempotent replays.
// Legacy orders (no sellerSnapshot) must use the documented approved site-defaults fallback.
// NEVER accept sellerSnapshot from the client/browser.
const sellerSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 60, immutable: true },
    legalName: { type: String, maxlength: 100, immutable: true },
    street: { type: String, maxlength: 100, immutable: true },
    zip: { type: String, maxlength: 20, immutable: true },
    city: { type: String, maxlength: 50, immutable: true },
    country: { type: String, maxlength: 50, immutable: true },
    phone: { type: String, maxlength: 30, immutable: true },
  },
  { _id: false },
);

const refundRecordSchema = new Schema(
  {
    amountSek: sek,
    reasonCategory: {
      type: String,
      enum: ["customer_cancellation", "out_of_stock", "kitchen_delay", "quality_issue", "other"],
      required: true,
    },
    reasonNote: { type: String, maxlength: 300, default: "" },
    canonicalProvider: {
      type: String,
      enum: ["stripe", "swish", "cash", "card_terminal"],
      required: true,
    },
    externalReference: { type: String, required: true },
    canonicalReference: { type: String, required: true },
    verificationTier: {
      type: String,
      enum: ["admin_attested", "provider_confirmed"],
      default: "admin_attested",
      required: true,
    },
    recordedBy: { type: String, required: true, maxlength: 100 },
    recordedAt: { type: Date, required: true },
    idempotencyKey: { type: String, required: true, minlength: 16, maxlength: 100 },
    requestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, default: generatePublicId },
    /** Client-generated key; a retried checkout with the same key returns the same order instead of a second one. */
    idempotencyKey: { type: String, required: true, unique: true, minlength: 16, maxlength: 100 },
    /** SHA-256 of the canonical request. Same key + different hash means the client reused a key for another order. */
    requestHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    items: {
      type: [itemSchema],
      validate: { validator: (v: unknown[]) => v.length > 0, message: "An order needs at least one item" },
    },
    subtotalSek: sek,
    discountSek: { ...sek, default: 0 },
    totalSek: sek,
    currency: { type: String, enum: ["SEK"], default: "SEK" },
    pickupAt: { type: Date, required: true },
    contact: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      phone: { type: String, required: true, trim: true, maxlength: 30 },
    },
    paymentProvider: { type: String, enum: PAYMENT_PROVIDER },
    paymentMethod: { type: String, enum: PAYMENT_METHOD, default: "card", required: true, index: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "pending", index: true },
    fulfillmentStatus: { type: String, enum: FULFILLMENT_STATUS, default: "PENDING_PAYMENT", index: true },
    /** After this moment an order that is still unpaid may be cancelled (after the provider has been asked). */
    paymentExpiresAt: { type: Date, index: true },
    /** The trusted Payment record that paid this order. Written atomically with the Stripe confirmation. */
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    paidAt: { type: Date },
    onSiteCollection: { type: onSiteCollectionSchema, required: false },
    totalRefundedSek: { ...sek, default: 0 },
    refundRecord: { type: refundRecordSchema, required: false },
    /** Immutable seller identity snapshot created server-side at order creation. Absent on legacy orders. */
    sellerSnapshot: { type: sellerSnapshotSchema, required: false, immutable: true },
    /** Populated by an explicit acknowledgement or atomically when staff starts preparing. */
    acknowledgedAt: { type: Date, index: true },
    acknowledgedBy: { type: String, maxlength: 100 },
    cancelledAt: { type: Date },
    statusHistory: { type: [statusHistorySchema], default: [] },
    /** Something needs a person: a late payment, an amount mismatch, a double payment. Never cleared automatically. */
    needsReview: {
      reason: { type: String, maxlength: 100 },
      detail: { type: String, maxlength: 300 },
      at: { type: Date },
    },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

export const ORDER_MODEL_GUARD_VERSION = 2;

/**
 * Checks whether a given path targets the protected root 'sellerSnapshot'
 * using exact root or dot/bracket boundary matching.
 * Unrelated fields containing 'sellerSnapshot' as a substring are NOT matched.
 */
export function isProtectedSellerSnapshotPath(path: string): boolean {
  if (typeof path !== "string") return false;
  return (
    path === "sellerSnapshot" ||
    path.startsWith("sellerSnapshot.") ||
    path.startsWith("sellerSnapshot[")
  );
}

/**
 * Shared validation logic for mutation attempts against Order.sellerSnapshot.
 * Enforces strict immutability across ALL MongoDB update operators ($set, $unset,
 * $rename, $currentDate, $min, $max, $addToSet, $push, $pull, $pop, $inc, $mul,
 * $setOnInsert, etc.), replacement operations, and bulkWrite batches.
 */
export function assertSafeSellerSnapshotMutation(
  update: unknown,
  isReplacement: boolean
): void {
  if (!update) return;

  // 1. Array-based MongoDB update pipelines (e.g. [{ $set: ... }])
  if (Array.isArray(update)) {
    for (const stage of update) {
      if (typeof stage === "object" && stage !== null) {
        for (const stageVal of Object.values(stage as Record<string, unknown>)) {
          if (typeof stageVal === "object" && stageVal !== null) {
            for (const path of Object.keys(stageVal as Record<string, unknown>)) {
              if (isProtectedSellerSnapshotPath(path)) {
                throw new Error("sellerSnapshot is immutable and cannot be modified or removed via update pipeline");
              }
            }
          }
        }
      }
    }
    throw new Error("Update pipelines are not permitted on Order documents to protect sellerSnapshot immutability");
  }

  if (typeof update !== "object" || update === null) return;
  const updateObj = update as Record<string, unknown>;

  // 2. Replacement operations (replaceOne, findOneAndReplace, or direct object replacement)
  const isDirectReplacement = isReplacement || Object.keys(updateObj).some((k) => !k.startsWith("$"));
  if (isDirectReplacement) {
    if ("sellerSnapshot" in updateObj) {
      throw new Error("sellerSnapshot is immutable and cannot be replaced or modified");
    } else {
      throw new Error("sellerSnapshot is immutable and cannot be removed or omitted in replacement");
    }
  }

  // 3. Generic MongoDB operator inspection:
  // Inspect every operator key ($set, $unset, $rename, $currentDate, $min, $max, $addToSet, $push, $pull, $pop, $inc, $mul, $setOnInsert, etc.)
  for (const [opKey, opVal] of Object.entries(updateObj)) {
    if (opKey.startsWith("$")) {
      if (typeof opVal !== "object" || opVal === null) continue;
      const opObj = opVal as Record<string, unknown>;

      if (opKey === "$rename") {
        // For $rename, check BOTH source field path AND destination field path
        for (const sourcePath of Object.keys(opObj)) {
          if (isProtectedSellerSnapshotPath(sourcePath)) {
            throw new Error("sellerSnapshot is immutable and cannot be renamed");
          }
        }
        for (const destPath of Object.values(opObj)) {
          if (typeof destPath === "string" && isProtectedSellerSnapshotPath(destPath)) {
            throw new Error("sellerSnapshot is immutable and cannot be renamed");
          }
        }
      } else {
        // For all other update operators ($set, $unset, $currentDate, $min, $max, $addToSet, $push, $pull, $pop, $inc, $mul, $setOnInsert, etc.)
        for (const targetPath of Object.keys(opObj)) {
          if (isProtectedSellerSnapshotPath(targetPath)) {
            if (opKey === "$unset") {
              throw new Error("sellerSnapshot is immutable and cannot be removed");
            }
            if (opKey === "$setOnInsert") {
              throw new Error("sellerSnapshot is immutable and cannot be modified via $setOnInsert");
            }
            throw new Error(`sellerSnapshot is immutable and cannot be modified via ${opKey}`);
          }
        }
      }
    } else {
      // Top-level field in an update object (not starting with $)
      if (isProtectedSellerSnapshotPath(opKey)) {
        throw new Error("sellerSnapshot is immutable and cannot be modified");
      }
    }
  }
}

interface MongooseUpdateQuery {
  getUpdate(): unknown;
  op?: string;
}

function rejectSellerSnapshotUpdate(this: MongooseUpdateQuery) {
  const update = this.getUpdate();
  if (!update) return;
  const isReplacementOp = this.op === "replaceOne" || this.op === "findOneAndReplace";
  assertSafeSellerSnapshotMutation(update, isReplacementOp);
}

type SchemaWithPre = {
  pre(event: string, fn: (this: MongooseUpdateQuery) => void): void;
};
const hookableSchema = orderSchema as unknown as SchemaWithPre;
hookableSchema.pre("updateOne", rejectSellerSnapshotUpdate);
hookableSchema.pre("updateMany", rejectSellerSnapshotUpdate);
hookableSchema.pre("findOneAndUpdate", rejectSellerSnapshotUpdate);
hookableSchema.pre("replaceOne", rejectSellerSnapshotUpdate);
hookableSchema.pre("findOneAndReplace", rejectSellerSnapshotUpdate);

(orderSchema as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion = ORDER_MODEL_GUARD_VERSION;

// A stored order must add up. This catches a bad price calculation before it reaches the database.
orderSchema.pre("validate", function () {
  const items = this.items ?? [];
  let subtotal = 0;
  for (const item of items) {
    const extras = item.modifiersSnapshot.reduce((sum, m) => sum + m.priceSek * m.quantity, 0);
    const expected = (item.basePriceSek + extras) * item.quantity;
    if (item.lineTotalSek !== expected) {
      this.invalidate("items", `Line total for ${item.productSlug} is ${item.lineTotalSek}, expected ${expected}`);
    }
    subtotal += item.lineTotalSek;
  }
  if (this.subtotalSek !== subtotal) this.invalidate("subtotalSek", `Subtotal ${this.subtotalSek} does not match items (${subtotal})`);
  if (this.discountSek > this.subtotalSek) this.invalidate("discountSek", "Discount exceeds subtotal");
  if (this.totalSek !== this.subtotalSek - this.discountSek) {
    this.invalidate("totalSek", `Total ${this.totalSek} does not equal subtotal minus discount`);
  }
  if (this.totalRefundedSek !== undefined) {
    if (this.refundRecord) {
      if (this.totalRefundedSek !== this.refundRecord.amountSek) {
        this.invalidate("totalRefundedSek", `totalRefundedSek ${this.totalRefundedSek} does not match refundRecord amount ${this.refundRecord.amountSek}`);
      }
    } else if (this.totalRefundedSek !== 0) {
      this.invalidate("totalRefundedSek", `totalRefundedSek is ${this.totalRefundedSek} without a refundRecord`);
    }
    if (this.totalRefundedSek > this.totalSek) {
      this.invalidate("totalRefundedSek", `Total refunded ${this.totalRefundedSek} exceeds order total ${this.totalSek}`);
    }
  }
});

export type OrderDoc = {
  publicId: string;
  idempotencyKey: string;
  requestHash: string;
  items: {
    productSlug: string;
    productNameSnapshot: string;
    variantId: string;
    variantNameSnapshot: string;
    basePriceSek: number;
    modifiersSnapshot: { modifierSlug: string; labelSv: string; priceSek: number; quantity: number }[];
    removedIngredients: string[];
    note: string;
    ifUnavailable: "call" | "remove_item" | "cancel_order";
    quantity: number;
    lineTotalSek: number;
  }[];
  subtotalSek: number;
  discountSek: number;
  totalSek: number;
  currency: "SEK";
  pickupAt: Date;
  contact: { name: string; phone: string };
  paymentProvider?: PaymentProvider;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  paymentExpiresAt?: Date;
  paymentId?: Types.ObjectId;
  paidAt?: Date;
  onSiteCollection?: {
    method: "cash" | "card_terminal";
    amountSek: number;
    collectedBy: string;
    collectedAt: Date;
    idempotencyKey: string;
  };
  totalRefundedSek?: number;
  refundRecord?: {
    amountSek: number;
    reasonCategory: "customer_cancellation" | "out_of_stock" | "kitchen_delay" | "quality_issue" | "other";
    reasonNote?: string;
    canonicalProvider: "stripe" | "swish" | "cash" | "card_terminal";
    externalReference: string;
    canonicalReference: string;
    verificationTier: "admin_attested" | "provider_confirmed";
    recordedBy: string;
    recordedAt: Date;
    idempotencyKey: string;
    requestHash: string;
  };
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  cancelledAt?: Date;
  statusHistory: {
    at: Date;
    from?: FulfillmentStatus;
    to: FulfillmentStatus;
    actorType: "payment" | "staff" | "system" | "customer";
    actorId?: string;
    reason?: string;
  }[];
  needsReview?: { reason?: string; detail?: string; at?: Date };
  /** Immutable seller snapshot written at order creation. Optional — absent on legacy orders. */
  sellerSnapshot?: {
    name: string;
    legalName?: string;
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
    phone?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
};

if (models.Order) {
  const existingSchema = models.Order.schema;
  const pmEnum = (existingSchema.path("paymentMethod") as { enumValues?: string[] } | undefined)?.enumValues;
  const onSiteMethod = existingSchema.path("onSiteCollection.method");
  const onSiteKey = existingSchema.path("onSiteCollection.idempotencyKey");
  const sellerSnapshotPath = existingSchema.path("sellerSnapshot.name");
  const refundCanonicalPath = existingSchema.path("refundRecord.canonicalReference");
  const guardVersion = (existingSchema as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion;

  // Next.js hot reload invariant: recompile if payment methods, onSiteCollection,
  // sellerSnapshot schema path, refundRecord schema path, or the current security guard version is missing/stale.
  const isUpToDate =
    Boolean(pmEnum && pmEnum.includes("swish")) &&
    Boolean(onSiteMethod) &&
    Boolean(onSiteKey) &&
    Boolean(sellerSnapshotPath) &&
    Boolean(refundCanonicalPath) &&
    guardVersion === ORDER_MODEL_GUARD_VERSION;

  if (!isUpToDate) {
    delete (models as Record<string, unknown>).Order;
  }
}

const RawOrderModel = ((models.Order as Model<OrderDoc> | undefined) ?? model<OrderDoc>("Order", orderSchema));

// Wrap bulkWrite on OrderModel to enforce sellerSnapshot immutability without double-wrapping on reuse
const rawWithGuard = RawOrderModel as unknown as { _bulkWriteHardened?: boolean };
if (!rawWithGuard._bulkWriteHardened) {
  const originalOrderBulkWrite = RawOrderModel.bulkWrite.bind(RawOrderModel);
  RawOrderModel.bulkWrite = function (
    ops: Parameters<typeof originalOrderBulkWrite>[0],
    options?: Parameters<typeof originalOrderBulkWrite>[1]
  ) {
    if (Array.isArray(ops)) {
      for (const op of ops) {
        if (typeof op !== "object" || op === null) continue;
        const opObj = op as Record<string, unknown>;
        if (opObj.updateOne) {
          const u = (opObj.updateOne as Record<string, unknown>).update;
          assertSafeSellerSnapshotMutation(u, false);
        } else if (opObj.updateMany) {
          const u = (opObj.updateMany as Record<string, unknown>).update;
          assertSafeSellerSnapshotMutation(u, false);
        } else if (opObj.replaceOne) {
          const r = (opObj.replaceOne as Record<string, unknown>).replacement;
          assertSafeSellerSnapshotMutation(r, true);
        }
      }
    }
    return originalOrderBulkWrite(ops, options);
  } as typeof RawOrderModel.bulkWrite;

  rawWithGuard._bulkWriteHardened = true;
}

export const OrderModel = RawOrderModel;

// ---- Payments -------------------------------------------------------------

const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDER, required: true },
    /** Stripe Checkout Session id. */
    providerSessionId: { type: String, required: true },
    providerPaymentId: { type: String },
    amountSek: sek,
    currency: { type: String, enum: ["SEK"], default: "SEK" },
    status: { type: String, enum: PAYMENT_STATUS, default: "pending" },
    /** Webhook event ids already applied. A replayed event is recognised here and ignored. */
    processedEventIds: { type: [String], default: [] },
    /** What the provider says it received, in whole SEK. May differ from amountSek (that is flagged, never ignored). */
    receivedSek: { type: Number, min: 0, validate: Number.isInteger },
    refundedSek: { ...sek, default: 0 },
  },
  { timestamps: true },
);

paymentSchema.index({ provider: 1, providerSessionId: 1 }, { unique: true });

export type PaymentDoc = {
  orderId: Types.ObjectId;
  provider: PaymentProvider;
  providerSessionId: string;
  providerPaymentId?: string;
  amountSek: number;
  currency: "SEK";
  status: PaymentStatus;
  processedEventIds: string[];
  receivedSek?: number;
  refundedSek: number;
};

if (models.Payment) {
  const provEnum = (models.Payment.schema.path("provider") as { enumValues?: string[] } | undefined)?.enumValues;
  if (!provEnum || !provEnum.includes("swish")) {
    delete (models as Record<string, unknown>).Payment;
  }
}
export const PaymentModel = (models.Payment as Model<PaymentDoc> | undefined) ?? model<PaymentDoc>("Payment", paymentSchema);
