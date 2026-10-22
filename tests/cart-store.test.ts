import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { cartStore, lineKey, MAX_LINE_QUANTITY } from "../src/lib/cart-store.ts";

const base = { productSlug: "vesuvio", variantId: "normal", removed: [], modifiers: [], note: "", ifUnavailable: "call" as const, quantity: 1 };

beforeEach(() => cartStore.clear());

test("identical lines merge and add quantities", () => {
  cartStore.add(base);
  cartStore.add({ ...base, quantity: 2 });
  const lines = cartStore.getSnapshot();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 3);
});

test("different size, removals, extras or note create separate lines", () => {
  cartStore.add(base);
  cartStore.add({ ...base, variantId: "familj" });
  cartStore.add({ ...base, removed: ["Skinka"] });
  cartStore.add({ ...base, modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] });
  cartStore.add({ ...base, note: "Extra krispig" });
  assert.equal(cartStore.getSnapshot().length, 5);
});

test("removal and extra order does not change the line identity", () => {
  assert.equal(lineKey({ ...base, removed: ["Ost", "Skinka"] }), lineKey({ ...base, removed: ["Skinka", "Ost"] }));
  const a = [{ slug: "a", quantity: 1 }, { slug: "b", quantity: 2 }];
  assert.equal(lineKey({ ...base, modifiers: a }), lineKey({ ...base, modifiers: [...a].reverse() }));
});

test("quantity is capped and zero removes the line", () => {
  cartStore.add({ ...base, quantity: 50 });
  assert.equal(cartStore.getSnapshot()[0].quantity, MAX_LINE_QUANTITY);
  const key = cartStore.getSnapshot()[0].key;
  cartStore.setQuantity(key, 0);
  assert.equal(cartStore.getSnapshot().length, 0);
});

test("the cart stores no prices", () => {
  cartStore.add(base);
  const json = JSON.stringify(cartStore.getSnapshot());
  assert.ok(!/price|priceSek|total/i.test(json.replace(/seenTotalSek/g, "")), json);
});

test("a remembered total is kept until the quantity changes", () => {
  cartStore.add(base);
  const key = cartStore.getSnapshot()[0].key;
  cartStore.setSeen({ [key]: 110 });
  assert.equal(cartStore.getSnapshot()[0].seenTotalSek, 110);
  cartStore.setSeen({ [key]: 110 });
  assert.equal(cartStore.getSnapshot()[0].seenTotalSek, 110);
  cartStore.setQuantity(key, 2);
  assert.equal(cartStore.getSnapshot()[0].seenTotalSek, undefined);
});

test("adding to an existing line forgets the remembered total", () => {
  cartStore.add(base);
  cartStore.setSeen({ [cartStore.getSnapshot()[0].key]: 110 });
  cartStore.add(base);
  assert.equal(cartStore.getSnapshot()[0].seenTotalSek, undefined);
});
