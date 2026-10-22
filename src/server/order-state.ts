import type { FulfillmentStatus } from "./models/constants.ts";

// The order life cycle, as pure data and pure functions: no database, no provider.
// Every status change in the system goes through canTransition(), so the rules live in one place.
//
//   PENDING_PAYMENT ──payment──▶ PAID ──staff──▶ ACCEPTED ──▶ PREPARING ──▶ READY_FOR_PICKUP ──▶ PICKED_UP
//        │                         └──────────── payment (a confirmed refund) ──▶ REFUNDED ◀─────────┘
//        └──system / customer──▶ CANCELLED
//
// Money rules baked in:
//  - Only the payment layer can move an order to PAID, and only from PENDING_PAYMENT.
//  - Staff can never mark an order paid, and can't cancel one that is already paid: a paid order ends in
//    REFUNDED, and only after the payment layer confirms the refund.
//  - CANCELLED is only reachable while nothing has been paid.

export type ActorType = "payment" | "staff" | "system" | "customer";
export type Actor = { type: ActorType; id?: string };

/** Which actor types may perform a transition. Empty or missing means the transition does not exist. */
const RULES: Partial<Record<FulfillmentStatus, Partial<Record<FulfillmentStatus, ActorType[]>>>> = {
  PENDING_PAYMENT: { PAID: ["payment"], CANCELLED: ["system", "customer"] },
  PAID: { ACCEPTED: ["staff"], REFUNDED: ["payment"] },
  ACCEPTED: { PREPARING: ["staff"], REFUNDED: ["payment"] },
  PREPARING: { READY_FOR_PICKUP: ["staff"], REFUNDED: ["payment"] },
  READY_FOR_PICKUP: { PICKED_UP: ["staff"], REFUNDED: ["payment"] },
  PICKED_UP: { REFUNDED: ["payment"] },
  // CANCELLED and REFUNDED are final.
};

export type TransitionCheck = { ok: true } | { ok: false; reason: "unknown_transition" | "actor_not_allowed" };

export function canTransition(from: FulfillmentStatus, to: FulfillmentStatus, actor: Actor): TransitionCheck {
  const allowed = RULES[from]?.[to];
  if (!allowed) return { ok: false, reason: "unknown_transition" };
  return allowed.includes(actor.type) ? { ok: true } : { ok: false, reason: "actor_not_allowed" };
}

/** Statuses from which the order has been paid for. */
export const PAID_STATUSES: FulfillmentStatus[] = ["PAID", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"];

/** Statuses a kitchen screen may show: paid and still to be made or handed over. Never PENDING_PAYMENT. */
export const KITCHEN_STATUSES: FulfillmentStatus[] = ["PAID", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"];

export const isFinal = (s: FulfillmentStatus) => !RULES[s];
export const isPaidStatus = (s: FulfillmentStatus) => PAID_STATUSES.includes(s);

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
