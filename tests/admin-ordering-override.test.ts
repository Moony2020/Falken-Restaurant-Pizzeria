import assert from "node:assert/strict";
import test from "node:test";
import { canAcceptOnlineOrders, isRestaurantOpenBySettings, isRestaurantOrderingDisabled } from "../src/lib/hours.ts";
import { resolveOrderingUpdate } from "../src/server/admin-overview.ts";

test("manual open overrides closed schedule and enables ordering from the quick toggle", () => {
  const update = resolveOrderingUpdate({ targetState: true });

  assert.deepEqual(update, { onlineOrderingEnabled: true, manualOverride: "open" });
  assert.equal(isRestaurantOpenBySettings(false, update.manualOverride ?? null), true);
  assert.equal(isRestaurantOrderingDisabled({
    onlineOrderingEnabled: false,
    manualOverride: "open",
  }), false);
  assert.equal(canAcceptOnlineOrders(true, {
    onlineOrderingEnabled: false,
    manualOverride: "open",
  }), true);
});

test("manual close overrides an open schedule", () => {
  const update = resolveOrderingUpdate({ targetState: false });

  assert.deepEqual(update, { manualOverride: "closed" });
  assert.equal(isRestaurantOpenBySettings(true, update.manualOverride ?? null), false);
  assert.equal(isRestaurantOrderingDisabled({
    onlineOrderingEnabled: true,
    manualOverride: update.manualOverride ?? null,
  }), true);
});

test("automatic schedule mode clears the override and follows schedule", () => {
  const update = resolveOrderingUpdate({ manualOverride: null });

  assert.deepEqual(update, { manualOverride: null });
  assert.equal(isRestaurantOpenBySettings(true, update.manualOverride ?? null), true);
  assert.equal(isRestaurantOpenBySettings(false, update.manualOverride ?? null), false);
  assert.equal(canAcceptOnlineOrders(true, {
    onlineOrderingEnabled: true,
    manualOverride: update.manualOverride ?? null,
  }), true);
});

test("changing online ordering preserves the manual schedule/open state", () => {
  assert.deepEqual(resolveOrderingUpdate({ enabled: false }), { onlineOrderingEnabled: false });
  assert.equal(isRestaurantOpenBySettings(false, "open"), true);
  assert.equal(canAcceptOnlineOrders(true, { onlineOrderingEnabled: false, manualOverride: "open" }), true);
});
