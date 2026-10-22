export const PRICE_STATUS = ["confirmed", "needs_review"] as const;
export type PriceStatus = (typeof PRICE_STATUS)[number];

/** Kitchen workflow (plan §3). PENDING_PAYMENT exists only until the payment provider confirms. */
export const FULFILLMENT_STATUS = [
  "PENDING_PAYMENT",
  "PAID",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "CANCELLED",
  "REFUNDED",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUS)[number];

export const PAYMENT_STATUS = ["pending", "paid", "failed", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const PAYMENT_PROVIDER = ["stripe", "paypal"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDER)[number];

/** Slug of the gluten-free dough modifier seeded in the catalog. Only products with glutenFreeOption may use it. */
export const GLUTEN_FREE_SLUG = "glutenfri-deg";
