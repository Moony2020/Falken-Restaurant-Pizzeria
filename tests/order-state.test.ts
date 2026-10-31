import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FULFILLMENT_STATUS, type FulfillmentStatus } from "../src/server/models/constants.ts";
import { allTransitions, canMarkPickedUp, canTransition, isFinal, KITCHEN_STATUSES, type Actor, type ActorType } from "../src/server/order-state.ts";

const ACTORS: ActorType[] = ["payment", "staff", "system", "customer"];
const as = (type: ActorType): Actor => ({ type });

describe("order state machine", () => {
  test("the happy path is allowed, step by step, for the right actors only", () => {
    const path: [FulfillmentStatus, FulfillmentStatus, ActorType][] = [
      ["PENDING_PAYMENT", "CONFIRMED", "payment"],
      ["CONFIRMED", "ACKNOWLEDGED", "staff"],
      ["ACKNOWLEDGED", "PREPARING", "staff"],
      ["PREPARING", "READY_FOR_PICKUP", "staff"],
      ["READY_FOR_PICKUP", "PICKED_UP", "staff"],
    ];
    for (const [from, to, actor] of path) assert.deepEqual(canTransition(from, to, as(actor)), { ok: true }, `${from}→${to}`);
  });

  test("a pay-on-pickup order is confirmed without becoming paid, then enters the kitchen flow", () => {
    assert.deepEqual(canTransition("CONFIRMED", "PREPARING", as("staff")), { ok: true });
    assert.deepEqual(canTransition("CONFIRMED", "ACKNOWLEDGED", as("staff")), { ok: true });
    for (const actor of ACTORS) assert.equal(canTransition("PENDING_PAYMENT", "PAID", as(actor)).ok, false);
  });

  test("only the payment layer can confirm a pending card order", () => {
    for (const actor of ACTORS) {
      const r = canTransition("PENDING_PAYMENT", "CONFIRMED", as(actor));
      assert.equal(r.ok, actor === "payment", actor);
    }
    for (const from of FULFILLMENT_STATUS.filter((s) => s !== "PENDING_PAYMENT")) {
      for (const actor of ACTORS) assert.equal(canTransition(from, "CONFIRMED", as(actor)).ok, false, `${from}→CONFIRMED by ${actor}`);
    }
  });

  test("staff and customers can never confirm a pending card order", () => {
    for (const from of FULFILLMENT_STATUS) {
      for (const actor of ["staff", "customer", "system"] as const) {
        assert.equal(canTransition(from, "CONFIRMED", as(actor)).ok, false);
      }
    }
  });

  test("a payment confirmation cannot be substituted for a refund transition", () => {
    assert.equal(canTransition("CONFIRMED", "CANCELLED", as("payment")).ok, false);
  });

  test("an unpaid order can be cancelled by the system (expiry) or the customer, not by staff or payment", () => {
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("system")).ok, true);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("customer")).ok, true);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("staff")).ok, false);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("payment")).ok, false);
  });

  test("kitchen steps belong to staff only", () => {
    for (const [from, to] of [["CONFIRMED", "ACKNOWLEDGED"], ["CONFIRMED", "PREPARING"], ["ACKNOWLEDGED", "PREPARING"], ["PREPARING", "READY_FOR_PICKUP"], ["READY_FOR_PICKUP", "PICKED_UP"]] as const) {
      assert.equal(canTransition(from, to, as("staff")).ok, true);
      for (const actor of ["payment", "system", "customer"] as const) {
        assert.deepEqual(canTransition(from, to, as(actor)), { ok: false, reason: "actor_not_allowed" });
      }
    }
  });

  test("CANCELLED and REFUNDED are final: nothing leaves them", () => {
    for (const final of ["CANCELLED", "REFUNDED"] as const) {
      assert.ok(isFinal(final));
      for (const to of FULFILLMENT_STATUS) {
        for (const actor of ACTORS) assert.equal(canTransition(final, to, as(actor)).ok, false, `${final}→${to}`);
      }
    }
  });

  test("no skipping steps and no going backwards", () => {
    assert.deepEqual(canTransition("CONFIRMED", "READY_FOR_PICKUP", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("CONFIRMED", "PICKED_UP", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("PREPARING", "ACKNOWLEDGED", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("PICKED_UP", "CONFIRMED", as("payment")), { ok: false, reason: "unknown_transition" });
  });

  test("the transition table contains exactly the intended pairs", () => {
    const pairs = allTransitions().map((t) => `${t.from}>${t.to}`).sort();
    assert.deepEqual(pairs, [
      "ACKNOWLEDGED>CANCELLED",
      "ACKNOWLEDGED>PREPARING",
      "CONFIRMED>ACKNOWLEDGED", "CONFIRMED>CANCELLED", "CONFIRMED>PREPARING",
      "PENDING_PAYMENT>CANCELLED", "PENDING_PAYMENT>CONFIRMED",
      "PREPARING>READY_FOR_PICKUP",
      "READY_FOR_PICKUP>PICKED_UP",
    ].sort());
  });

  test("the kitchen only sees paid online orders or explicitly confirmed pay-on-pickup orders", () => {
    assert.deepEqual([...KITCHEN_STATUSES], ["CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP"]);
    for (const s of ["PENDING_PAYMENT", "CANCELLED", "PICKED_UP"] as const) assert.ok(!KITCHEN_STATUSES.includes(s), s);
  });

  test("pay-on-pickup cannot be picked up before a trusted collection record marks it paid", () => {
    assert.equal(canMarkPickedUp({ paymentMethod: "pay_on_pickup", paymentStatus: "unpaid" }), false);
    assert.equal(canMarkPickedUp({ paymentMethod: "pay_on_pickup", paymentStatus: "paid" }), true);
    assert.equal(canMarkPickedUp({ paymentMethod: "card", paymentStatus: "paid" }), true);
  });
});
