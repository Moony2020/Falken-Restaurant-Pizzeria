import { createHash } from "node:crypto";
import { CURRENT_SEASON, LAST_PICKUP_BEFORE_CLOSE, PICKUP_GRACE_MINUTES, PICKUP_MAX_AHEAD_HOURS, PREP_MINUTES, SLOT_STEP_MINUTES } from "../data/site.ts";
import { isValidPickupTime } from "../lib/hours.ts";
import { orderRequestSchema, type CartInput, type OrderRequest } from "./cart-schema.ts";
import { loadCatalogForCart } from "./catalog-repo.ts";
import { OrderModel, type OrderDoc } from "./models/order.ts";
import { RestaurantSettingsModel } from "./models/restaurant-settings.ts";
import { deriveAccessToken } from "./order-access.ts";
import { ORDER_EXPIRY_MINUTES } from "./payments-config.ts";
import { priceCart, type PricedLine, type PricingIssue } from "./pricing-engine.ts";

type OrderErrorCode = "invalid_request" | "pricing" | "pickup_unavailable" | "idempotency_conflict" | "price_changed" | "ordering_closed";

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
    .update(canonical({ items: req.items, contact: req.contact, pickupAt: new Date(req.pickupAt).toISOString(), paymentMethod: req.paymentMethod }))
    .digest("hex");
}

export type PublicOrder = {
  publicId: string;
  status: OrderDoc["fulfillmentStatus"];
  paymentStatus: OrderDoc["paymentStatus"];
  paymentMethod: OrderDoc["paymentMethod"];
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
    paymentMethod: o.paymentMethod ?? "card",
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

/** `accessToken` is only present when a token secret was supplied. It is derived, never stored, so a retry gets it back too. */
export type CreateOrderResult = { replayed: boolean; order: PublicOrder; accessToken?: string };

export type CreateOrderOptions = { tokenSecret?: string };

const isDuplicateKey = (err: unknown) => typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;

/**
 * A card order starts in PENDING_PAYMENT. A pay-on-pickup order is confirmed immediately, but remains
 * unpaid; the payment method is accepted, whereas all status and price fields remain server controlled.
 */
export async function createOrder(body: unknown, now: Date = new Date(), options: CreateOrderOptions = {}): Promise<CreateOrderResult> {
  const withToken = (order: PublicOrder, replayed: boolean): CreateOrderResult => ({
    replayed,
    order,
    accessToken: options.tokenSecret ? deriveAccessToken(order.publicId, options.tokenSecret) : undefined,
  });
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
    return withToken(toPublicOrder(existing), true);
  };
  const already = await replay();
  if (already) return already;

  let isManuallyOpen = false;
  const assertOrderingEnabled = async () => {
    const settings = await RestaurantSettingsModel.findById("restaurant")
      .select("onlineOrderingEnabled manualOverride")
      .lean();
    isManuallyOpen = settings?.manualOverride === "open";
    const isManuallyClosed =
      settings?.manualOverride === "closed" || settings?.onlineOrderingEnabled === false;
    if (isManuallyClosed) {
      throw new OrderError("ordering_closed", 409, "Onlinebeställningar är tillfälligt stängda.");
    }
  };
  await assertOrderingEnabled();

  const priced = await priceCartFromDb({ items: req.items });
  if (!priced.ok) {
    throw new OrderError("pricing", 422, "Some items can't be ordered", priced.issues satisfies PricingIssue[]);
  }

  if (req.expectedTotalSek !== undefined && req.expectedTotalSek !== priced.totalSek) {
    throw new OrderError("price_changed", 409, "The total has changed since you reviewed your order", {
      expectedSek: req.expectedTotalSek,
      actualSek: priced.totalSek,
    });
  }

  const pickupAt = new Date(req.pickupAt);
  const pickupOk = isValidPickupTime(pickupAt, now, CURRENT_SEASON, {
    prepMinutes: PREP_MINUTES,
    lastBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
    step: SLOT_STEP_MINUTES,
    graceMinutes: PICKUP_GRACE_MINUTES,
    maxAheadHours: PICKUP_MAX_AHEAD_HOURS,
  }, isManuallyOpen);
  if (!pickupOk) throw new OrderError("pickup_unavailable", 422, "The chosen pickup time is not available");

  try {
    // Recheck immediately before creation so a recently closed online-order switch is honored.
    await assertOrderingEnabled();
    const isPayOnPickup = req.paymentMethod === "pay_on_pickup";
    const fulfillmentStatus = isPayOnPickup ? "CONFIRMED" : "PENDING_PAYMENT";
    const created = await OrderModel.create({
      idempotencyKey: req.idempotencyKey,
      requestHash,
      items: priced.lines,
      subtotalSek: priced.subtotalSek,
      discountSek: 0,
      totalSek: priced.totalSek,
      pickupAt,
      contact: { name: req.contact.name, phone: req.contact.phone },
      paymentMethod: req.paymentMethod,
      paymentStatus: isPayOnPickup ? "unpaid" : "pending",
      fulfillmentStatus,
      ...(isPayOnPickup ? {} : { paymentExpiresAt: new Date(now.getTime() + ORDER_EXPIRY_MINUTES * 60_000) }),
      statusHistory: [{ at: now, to: fulfillmentStatus, actorType: "customer", reason: isPayOnPickup ? "order_confirmed_pay_on_pickup" : "order_created" }],
    });
    return withToken(toPublicOrder(created.toObject()), false);
  } catch (err) {
    // Two identical requests raced: the unique index let one win; return that order to the other.
    if (isDuplicateKey(err)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw err;
  }
}
