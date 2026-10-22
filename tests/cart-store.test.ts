import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cartStore, lineKey, MAX_LINE_QUANTITY } from "../src/lib/cart-store.ts";

const base = { productId: "vesuvio", variantId: "normal", removed: [], glutenFree: false, note: "", quantity: 1 };

beforeEach(() => cartStore.clear());

test("identical lines merge and add quantities", () => {
  cartStore.add(base);
  cartStore.add({ ...base, quantity: 2 });
  const lines = cartStore.getSnapshot();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3);
});

test("different size, removals, gluten-free or note create separate lines", () => {
  cartStore.add(base);
  cartStore.add({ ...base, variantId: "familj" });
  cartStore.add({ ...base, removed: ["Skinka"] });
  cartStore.add({ ...base, glutenFree: true });
  cartStore.add({ ...base, note: "Extra krispig" });
  assert.equal(cartStore.getSnapshot().length, 5);
});

test("removal order does not change the line identity", () => {
  assert.equal(lineKey({ ...base, removed: ["Ost", "Skinka"] }), lineKey({ ...base, removed: ["Skinka", "Ost"] }));
});

test("quantity is capped and zero removes the line", () => {
  cartStore.add({ ...base, quantity: 50 });
  assert.equal(cartStore.getSnapshot()[0].quantity, MAX_LINE_QUANTITY);
  const key = cartStore.getSnapshot()[0].key;
  cartStore.setQuantity(key, 0);
  assert.equal(cartStore.getSnapshot().length, 0);
});
