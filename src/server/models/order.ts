import { randomBytes } from "node:crypto";
import mongoose, { type Model, type Types } from "mongoose";
import { FULFILLMENT_STATUS, PAYMENT_PROVIDER, PAYMENT_STATUS, type FulfillmentStatus, type PaymentProvider, type PaymentStatus } from "./constants.ts";

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
    quantity: { type: Number, required: true, min: 1, max: 20, validate: Number.isInteger },
    lineTotalSek: sek,
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true, default: generatePublicId },
    /** Client-generated key; a retried checkout with the same key returns the same order instead of a second one. */
    idempotencyKey: { type: String, required: true, unique: true, minlength: 16, maxlength: 100 },
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
    paymentStatus: { type: String, enum: PAYMENT_STATUS, default: "pending", index: true },
    fulfillmentStatus: { type: String, enum: FULFILLMENT_STATUS, default: "PENDING_PAYMENT", index: true },
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
  items: {
    productSlug: string;
    productNameSnapshot: string;
    variantId: string;
    variantNameSnapshot: string;
    basePriceSek: number;
    modifiersSnapshot: { modifierSlug: string; labelSv: string; priceSek: number; quantity: number }[];
    removedIngredients: string[];
    note: string;
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
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
};

export const OrderModel = (models.Order as Model<OrderDoc> | undefined) ?? model<OrderDoc>("Order", orderSchema);

// ---- Payments -------------------------------------------------------------

const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, enum: PAYMENT_PROVIDER, required: true },
    /** Stripe Checkout Session id / PayPal order id. */
    providerSessionId: { type: String, required: true },
    providerPaymentId: { type: String },
    amountSek: sek,
    currency: { type: String, enum: ["SEK"], default: "SEK" },
    status: { type: String, enum: PAYMENT_STATUS, default: "pending" },
    /** Webhook event ids already applied. A replayed event is recognised here and ignored. */
    processedEventIds: { type: [String], default: [] },
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
  refundedSek: number;
};

export const PaymentModel = (models.Payment as Model<PaymentDoc> | undefined) ?? model<PaymentDoc>("Payment", paymentSchema);
