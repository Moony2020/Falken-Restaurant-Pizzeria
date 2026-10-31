import type { FulfillmentStatus, PaymentMethod, PaymentStatus } from "./models/constants.ts";

// The order life cycle, as pure data and pure functions: no database, no provider.
// Every status change in the system goes through canTransition(), so the rules live in one place.
//
//   PENDING_PAYMENT ──verified payment──▶ CONFIRMED ──staff──▶ ACKNOWLEDGED ──▶ PREPARING ──▶ READY_FOR_PICKUP ──▶ PICKED_UP
//                                                └────────staff──▶ PREPARING (acknowledgement is recorded atomically)
//        └──system / customer──▶ CANCELLED
//
// Money rules baked in:
//  - Only the verified payment layer can move a card order from PENDING_PAYMENT to CONFIRMED.
//  - Payment state is stored separately; staff never marks a Stripe order paid.
//  - CANCELLED is only reachable while nothing has been paid.

export type ActorType = "payment" | "staff" | "system" | "customer";
export type Actor = { type: ActorType; id?: string };

/** Which actor types may perform a transition. Empty or missing means the transition does not exist. */
const RULES: Partial<Record<FulfillmentStatus, Partial<Record<FulfillmentStatus, ActorType[]>>>> = {
  PENDING_PAYMENT: { CONFIRMED: ["payment"], CANCELLED: ["system", "customer"] },
  CONFIRMED: { ACKNOWLEDGED: ["staff"], PREPARING: ["staff"], CANCELLED: ["system", "customer"] },
  ACKNOWLEDGED: { PREPARING: ["staff"], CANCELLED: ["system", "customer"] },
  PREPARING: { READY_FOR_PICKUP: ["staff"] },
  READY_FOR_PICKUP: { PICKED_UP: ["staff"] },
  // CANCELLED and PICKED_UP are final here. Refund workflow is intentionally added later in A8.
};

export type TransitionCheck = { ok: true } | { ok: false; reason: "unknown_transition" | "actor_not_allowed" };

export function canTransition(from: FulfillmentStatus, to: FulfillmentStatus, actor: Actor): TransitionCheck {
  const allowed = RULES[from]?.[to];
  if (!allowed) return { ok: false, reason: "unknown_transition" };
  return allowed.includes(actor.type) ? { ok: true } : { ok: false, reason: "actor_not_allowed" };
}

/** Statuses a kitchen screen may show. Payment eligibility is checked separately in the query. */
export const KITCHEN_STATUSES: FulfillmentStatus[] = ["CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP"];

export const isFinal = (s: FulfillmentStatus) => !RULES[s];

/** A pay-on-pickup order cannot be handed over until a trusted on-site payment record exists. */
export function canMarkPickedUp(order: Pick<{ paymentMethod: PaymentMethod; paymentStatus: PaymentStatus }, "paymentMethod" | "paymentStatus">): boolean {
  return order.paymentMethod !== "pay_on_pickup" || order.paymentStatus === "paid";
}

/** All legal (from, to) pairs, for documentation and tests. */
export function allTransitions(): { from: FulfillmentStatus; to: FulfillmentStatus; actors: ActorType[] }[] {
  const out: { from: FulfillmentStatus; to: FulfillmentStatus; actors: ActorType[] }[] = [];
  for (const [from, targets] of Object.entries(RULES)) {
    for (const [to, actors] of Object.entries(targets ?? {})) {
      out.push({ from: from as FulfillmentStatus, to: to as FulfillmentStatus, actors: actors as ActorType[] });
    }
  }
  return out;
}
