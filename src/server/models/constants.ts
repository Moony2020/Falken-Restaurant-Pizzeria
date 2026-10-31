export const PRICE_STATUS = ["confirmed", "needs_review"] as const;
export type PriceStatus = (typeof PRICE_STATUS)[number];

/** Kitchen workflow. PENDING_PAYMENT exists only until the card provider confirms. */
export const FULFILLMENT_STATUS = [
  "PENDING_PAYMENT",
  /** The order was accepted automatically by the system, not manually approved by staff. */
  "CONFIRMED",
  /** A staff member has seen the order. Starting preparation also records this acknowledgement. */
  "ACKNOWLEDGED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "CANCELLED",
  /** Legacy read-only values. A1 creates no new orders in these states. */
  "PAID",
  "ACCEPTED",
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

/** Roles for the restaurant's private administration area. */
// FALKEN is a single restaurant: every staff account uses the same Admin capabilities.
export const STAFF_ROLE = ["ADMIN"] as const;
export type StaffRole = (typeof STAFF_ROLE)[number];

/** Slug of the gluten-free dough modifier seeded in the catalog. Only products with glutenFreeOption may use it. */
export const GLUTEN_FREE_SLUG = "glutenfri-deg";
