export const PRICE_STATUS = ["confirmed", "needs_review"] as const;
export type PriceStatus = (typeof PRICE_STATUS)[number];

/** Kitchen workflow. PENDING_PAYMENT exists only until the card provider confirms. */
export const FULFILLMENT_STATUS = [
  "PENDING_PAYMENT",
  "PAID",
  /** The restaurant accepted a pay-on-pickup order. Its payment may still be outstanding. */
  "CONFIRMED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "CANCELLED",
  "REFUNDED",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[number];

/** `pending` is a provider payment in progress; `unpaid` is a confirmed pay-on-pickup order. */
export const PAYMENT_STATUS = ["pending", "unpaid", "paid", "failed", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const PAYMENT_PROVIDER = ["stripe"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDER)[number];

/** How the customer intends to pay. This is deliberately separate from paymentStatus. */
export const PAYMENT_METHOD = ["card", "pay_on_pickup"] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

/** Slug of the gluten-free dough modifier seeded in the catalog. Only products with glutenFreeOption may use it. */
export const GLUTEN_FREE_SLUG = "glutenfri-deg";
