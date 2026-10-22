import { createHash } from "node:crypto";
import { CURRENT_SEASON, LAST_PICKUP_BEFORE_CLOSE, PICKUP_GRACE_MINUTES, PICKUP_MAX_AHEAD_HOURS, PREP_MINUTES, SLOT_STEP_MINUTES } from "../data/site.ts";
import { isValidPickupTime } from "../lib/hours.ts";
import { orderRequestSchema, type CartInput, type OrderRequest } from "./cart-schema.ts";
import { loadCatalogForCart } from "./catalog-repo.ts";
import { OrderModel, type OrderDoc } from "./models/order.ts";
import { priceCart, type PricedLine, type PricingIssue } from "./pricing-engine.ts";

type OrderErrorCode = "invalid_request" | "pricing" | "pickup_unavailable" | "idempotency_conflict";

export class OrderError extends Error {
  // Explicit fields (not constructor parameter properties): plain Node runs this file with type stripping.
  readonly code: OrderErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: OrderErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Prices a cart against the live catalog. Nothing is stored. */
export async function priceCartFromDb(cart: CartInput) {
  const productSlugs = [...new Set(cart.items.map((i) => i.productSlug))];
  const modifierSlugs = [...new Set(cart.items.flatMap((i) => i.modifiers.map((m) => m.slug)))];
  const catalog = await loadCatalogForCart(productSlugs, modifierSlugs);
  return priceCart(cart, catalog);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Fingerprint of what the customer asked for. The idempotency key itself is not part of it. */
export function hashRequest(req: OrderRequest): string {
  return createHash("sha256")
    .update(canonical({ items: req.items, contact: req.contact, pickupAt: new Date(req.pickupAt).toISOString() }))
    .digest("hex");
}

export type PublicOrder = {
  publicId: string;
  status: OrderDoc["fulfillmentStatus"];
  paymentStatus: OrderDoc["paymentStatus"];
  subtotalSek: number;
  totalSek: number;
  currency: "SEK";
  pickupAt: string;
  items: Pick<PricedLine, "productNameSnapshot" | "variantNameSnapshot" | "quantity" | "lineTotalSek" | "removedIngredients" | "modifiersSnapshot" | "note">[];
};

/** What the browser gets back. No phone number, idempotency key or internal ids. */
export function toPublicOrder(o: OrderDoc): PublicOrder {
  return {
    publicId: o.publicId,
    status: o.fulfillmentStatus,
    paymentStatus: o.paymentStatus,
    subtotalSek: o.subtotalSek,
    totalSek: o.totalSek,
    currency: o.currency,
    pickupAt: o.pickupAt.toISOString(),
    items: o.items.map((i) => ({
      productNameSnapshot: i.productNameSnapshot,
      variantNameSnapshot: i.variantNameSnapshot,
      quantity: i.quantity,
      lineTotalSek: i.lineTotalSek,
      removedIngredients: i.removedIngredients,
      modifiersSnapshot: i.modifiersSnapshot,
      note: i.note,
    })),
  };
}

export type CreateOrderResult = { replayed: boolean; order: PublicOrder };

const isDuplicateKey = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;

/**
 * Creates an order in PENDING_PAYMENT. This function can never produce a paid or confirmed order:
 * status fields are fixed here and are not part of the accepted request. Only a verified payment
 * webhook (a later phase) may move an order forward.
 */
export async function createOrder(body: unknown, now: Date = new Date()): Promise<CreateOrderResult> {
  const parsed = orderRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new OrderError("invalid_request", 400, "The order request is invalid", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const req = parsed.data;
  const requestHash = hashRequest(req);

  // A retry with the same key returns the order that already exists, even if prices or hours changed since.
  const replay = async (): Promise<CreateOrderResult | null> => {
    const existing = await OrderModel.findOne({ idempotencyKey: req.idempotencyKey }).lean();
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new OrderError("idempotency_conflict", 409, "This idempotency key was already used for a different order");
    }
    return { replayed: true, order: toPublicOrder(existing) };
  };
  const already = await replay();
  if (already) return already;

  const priced = await priceCartFromDb({ items: req.items });
  if (!priced.ok) {
    throw new OrderError("pricing", 422, "Some items can't be ordered", priced.issues satisfies PricingIssue[]);
  }

  const pickupAt = new Date(req.pickupAt);
  const pickupOk = isValidPickupTime(pickupAt, now, CURRENT_SEASON, {
    prepMinutes: PREP_MINUTES,
    lastBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
    step: SLOT_STEP_MINUTES,
    graceMinutes: PICKUP_GRACE_MINUTES,
    maxAheadHours: PICKUP_MAX_AHEAD_HOURS,
  });
  if (!pickupOk) throw new OrderError("pickup_unavailable", 422, "The chosen pickup time is not available");

  try {
    const created = await OrderModel.create({
      idempotencyKey: req.idempotencyKey,
      requestHash,
      items: priced.lines,
      subtotalSek: priced.subtotalSek,
      discountSek: 0,
      totalSek: priced.totalSek,
      pickupAt,
      contact: { name: req.contact.name, phone: req.contact.phone },
      paymentStatus: "pending",
      fulfillmentStatus: "PENDING_PAYMENT",
    });
    return { replayed: false, order: toPublicOrder(created.toObject()) };
  } catch (err) {
    // Two identical requests raced: the unique index let one win; return that order to the other.
    if (isDuplicateKey(err)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw err;
  }
}
