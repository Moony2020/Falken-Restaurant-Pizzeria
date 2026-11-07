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
  createdAt?: Date;
  updatedAt?: Date;
};

if (models.Order) {
  const pmEnum = (models.Order.schema.path("paymentMethod") as { enumValues?: string[] } | undefined)?.enumValues;
  // Next.js hot reload can retain a pre-A5 Order model. Strict mode would then
  // silently discard onSiteCollection while accepting the rest of an update.
  // Recompile when either required part of the current schema is missing.
  const onSiteMethod = models.Order.schema.path("onSiteCollection.method");
  const onSiteKey = models.Order.schema.path("onSiteCollection.idempotencyKey");
  if (!pmEnum || !pmEnum.includes("swish") || !onSiteMethod || !onSiteKey) {
    delete (models as Record<string, unknown>).Order;
  }
}
export const OrderModel = (models.Order as Model<OrderDoc> | undefined) ?? model<OrderDoc>("Order", orderSchema);

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
