import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FULFILLMENT_STATUS, type FulfillmentStatus } from "../src/server/models/constants.ts";
import { allTransitions, canTransition, isFinal, isPaidStatus, KITCHEN_STATUSES, PAID_STATUSES, type Actor, type ActorType } from "../src/server/order-state.ts";

const ACTORS: ActorType[] = ["payment", "staff", "system", "customer"];
const as = (type: ActorType): Actor => ({ type });

describe("order state machine", () => {
  test("the happy path is allowed, step by step, for the right actors only", () => {
    const path: [FulfillmentStatus, FulfillmentStatus, ActorType][] = [
      ["PENDING_PAYMENT", "PAID", "payment"],
      ["PAID", "ACCEPTED", "staff"],
      ["ACCEPTED", "PREPARING", "staff"],
      ["PREPARING", "READY_FOR_PICKUP", "staff"],
      ["READY_FOR_PICKUP", "PICKED_UP", "staff"],
    ];
    for (const [from, to, actor] of path) assert.deepEqual(canTransition(from, to, as(actor)), { ok: true }, `${from}→${to}`);
  });

  test("only the payment layer can mark an order PAID, and only from PENDING_PAYMENT", () => {
    for (const actor of ACTORS) {
      const r = canTransition("PENDING_PAYMENT", "PAID", as(actor));
      assert.equal(r.ok, actor === "payment", actor);
    }
    for (const from of FULFILLMENT_STATUS.filter((s) => s !== "PENDING_PAYMENT")) {
      for (const actor of ACTORS) assert.equal(canTransition(from, "PAID", as(actor)).ok, false, `${from}→PAID by ${actor}`);
    }
  });

  test("staff and customers can never reach PAID or REFUNDED", () => {
    for (const from of FULFILLMENT_STATUS) {
      for (const actor of ["staff", "customer", "system"] as const) {
        assert.equal(canTransition(from, "PAID", as(actor)).ok, false);
        assert.equal(canTransition(from, "REFUNDED", as(actor)).ok, false);
      }
    }
  });

  test("an order that has been paid can't be cancelled: it ends in REFUNDED, by the payment layer", () => {
    for (const from of PAID_STATUSES) {
      for (const actor of ACTORS) assert.equal(canTransition(from, "CANCELLED", as(actor)).ok, false, `${from}→CANCELLED by ${actor}`);
      assert.equal(canTransition(from, "REFUNDED", as("payment")).ok, true, `${from}→REFUNDED`);
    }
  });

  test("an unpaid order can be cancelled by the system (expiry) or the customer, not by staff or payment", () => {
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("system")).ok, true);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("customer")).ok, true);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("staff")).ok, false);
    assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", as("payment")).ok, false);
  });

  test("kitchen steps belong to staff only", () => {
    for (const [from, to] of [["PAID", "ACCEPTED"], ["ACCEPTED", "PREPARING"], ["PREPARING", "READY_FOR_PICKUP"], ["READY_FOR_PICKUP", "PICKED_UP"]] as const) {
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
    assert.deepEqual(canTransition("PAID", "PREPARING", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("PAID", "PICKED_UP", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("PREPARING", "ACCEPTED", as("staff")), { ok: false, reason: "unknown_transition" });
    assert.deepEqual(canTransition("PICKED_UP", "PAID", as("payment")), { ok: false, reason: "unknown_transition" });
  });

  test("the transition table contains exactly the intended pairs", () => {
    const pairs = allTransitions().map((t) => `${t.from}>${t.to}`).sort();
    assert.deepEqual(pairs, [
      "ACCEPTED>PREPARING", "ACCEPTED>REFUNDED",
      "PAID>ACCEPTED", "PAID>REFUNDED",
      "PENDING_PAYMENT>CANCELLED", "PENDING_PAYMENT>PAID",
      "PICKED_UP>REFUNDED",
      "PREPARING>READY_FOR_PICKUP", "PREPARING>REFUNDED",
      "READY_FOR_PICKUP>PICKED_UP", "READY_FOR_PICKUP>REFUNDED",
    ].sort());
  });

  test("the kitchen never sees unpaid, cancelled, refunded or finished orders", () => {
    assert.deepEqual([...KITCHEN_STATUSES], ["PAID", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"]);
    for (const s of ["PENDING_PAYMENT", "CANCELLED", "REFUNDED", "PICKED_UP"] as const) assert.ok(!KITCHEN_STATUSES.includes(s), s);
    for (const s of KITCHEN_STATUSES) assert.ok(isPaidStatus(s));
    assert.ok(!isPaidStatus("PENDING_PAYMENT") && !isPaidStatus("CANCELLED"));
  });
});
