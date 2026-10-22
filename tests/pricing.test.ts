import { test } from "node:test";
import assert from "node:assert/strict";
import { products, getProduct } from "../src/data/menu.ts";
import { unitPrice, lineTotal, GLUTEN_FREE_SURCHARGE } from "../src/lib/pricing.ts";

const need = (id: string) => {
  const p = getProduct(id);
  assert.ok(p, `missing product ${id}`);
  return p;
};

test("pizza prices follow the class table (Normal / Familj)", () => {
  assert.equal(unitPrice(need("vesuvio"), "normal"), 110);
  assert.equal(unitPrice(need("vesuvio"), "familj"), 265);
  assert.equal(unitPrice(need("hawaii"), "normal"), 120);
  assert.equal(unitPrice(need("charbello"), "familj"), 380);
});

test("kebabpizza uses its own prices", () => {
  assert.equal(unitPrice(need("kebabpizza-super"), "normal"), 150);
  assert.equal(unitPrice(need("kebabpizza-super"), "familj"), 350);
});

test("gluten-free adds 30 kr on pizzas only", () => {
  assert.equal(unitPrice(need("vesuvio"), "normal", true), 110 + GLUTEN_FREE_SURCHARGE);
  assert.equal(unitPrice(need("kebabtallrik"), "standard", true), 125);
});

test("line total multiplies quantity", () => {
  assert.equal(lineTotal(need("hawaii"), { variantId: "familj", glutenFree: true, quantity: 3 }), (275 + 30) * 3);
});

test("unknown variant throws instead of pricing at zero", () => {
  assert.throws(() => unitPrice(need("vesuvio"), "jumbo"));
});

test("menu integrity: 91 numbered dishes, unique ids, positive prices", () => {
  const numbered = products.filter((p) => p.number !== undefined).map((p) => p.number as number);
  assert.equal(numbered.length, 91);
  assert.deepEqual(
    [...numbered].sort((a, b) => a - b),
    Array.from({ length: 91 }, (_, i) => i + 1),
  );
  assert.equal(new Set(products.map((p) => p.id)).size, products.length);
  for (const p of products) {
    assert.ok(p.variants.length > 0, `${p.id} has no variants`);
    for (const v of p.variants) assert.ok(v.price > 0, `${p.id}/${v.id} has bad price`);
  }
});
