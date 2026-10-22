import { test } from "node:test";
import assert from "node:assert/strict";
import { ModifierModel, ProductModel } from "../src/server/models/catalog.ts";
import { generatePublicId, OrderModel } from "../src/server/models/order.ts";
import { products } from "../src/data/menu.ts";

// Pure schema validation: no database connection needed.

const variant = { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" };
const product = (over: object = {}) =>
  new ProductModel({ slug: "x", nameSv: "X", categorySlug: "pizza", variants: [variant], ...over });

test("product accepts whole-SEK prices", () => {
  assert.equal(product().validateSync(), undefined);
});

test("product rejects fractional, negative and missing prices", () => {
  assert.ok(product({ variants: [{ ...variant, priceSek: 110.5 }] }).validateSync());
  assert.ok(product({ variants: [{ ...variant, priceSek: -1 }] }).validateSync());
  assert.ok(product({ variants: [{ id: "normal", label: "Normal" }] }).validateSync());
});

test("product needs variants and unique variant ids", () => {
  assert.ok(product({ variants: [] }).validateSync());
  assert.ok(product({ variants: [variant, variant] }).validateSync());
});

test("variants default to needs_review: nothing is sellable by accident", () => {
  const p = product({ variants: [{ id: "n", label: "N", priceSek: 100 }] });
  assert.equal(p.variants[0].priceStatus, "needs_review");
});

test("modifier prices must be whole numbers per variant", () => {
  const ok = new ModifierModel({ slug: "ost", labelSv: "Extra ost", priceByVariantSek: { normal: 20 } });
  assert.equal(ok.validateSync(), undefined);
  const bad = new ModifierModel({ slug: "ost", labelSv: "Extra ost", priceByVariantSek: { normal: 19.5 } });
  assert.ok(bad.validateSync());
});

const line = (over: object = {}) => ({
  productSlug: "vesuvio",
  productNameSnapshot: "Vesuvio",
  variantId: "normal",
  variantNameSnapshot: "Normal",
  basePriceSek: 110,
  modifiersSnapshot: [{ modifierSlug: "glutenfri-deg", labelSv: "Glutenfri pizzadeg", priceSek: 30, quantity: 1 }],
  quantity: 2,
  lineTotalSek: 280,
  ...over,
});
const order = (over: object = {}) =>
  new OrderModel({
    idempotencyKey: "0123456789abcdef",
    items: [line()],
    subtotalSek: 280,
    totalSek: 280,
    pickupAt: new Date("2026-10-23T11:00:00Z"),
    contact: { name: "Anna", phone: "070-123 45 67" },
    ...over,
  });

test("a consistent order validates and starts unpaid", async () => {
  const o = order();
  await o.validate();
  assert.equal(o.paymentStatus, "pending");
  assert.equal(o.fulfillmentStatus, "PENDING_PAYMENT");
});

// The arithmetic check lives in a pre("validate") hook, which validateSync() skips: use async validate().
test("order rejects a wrong line total, subtotal or total", async () => {
  await assert.rejects(order({ items: [line({ lineTotalSek: 220 })] }).validate(), /Line total/);
  await assert.rejects(order({ subtotalSek: 300, totalSek: 300 }).validate(), /Subtotal/);
  await assert.rejects(order({ totalSek: 250 }).validate(), /Total 250/);
  await assert.rejects(order({ discountSek: 30, totalSek: 280 }).validate(), /Total 280/);
});

test("a discount that adds up is accepted", async () => {
  await order({ discountSek: 30, totalSek: 250 }).validate();
});

test("order discount cannot exceed the subtotal", () => {
  assert.ok(order({ discountSek: 400, totalSek: -120 }).validateSync());
});

test("order rejects empty items, bad quantities and short idempotency keys", () => {
  assert.ok(order({ items: [], subtotalSek: 0, totalSek: 0 }).validateSync());
  assert.ok(order({ items: [line({ quantity: 0, lineTotalSek: 0 })], subtotalSek: 0, totalSek: 0 }).validateSync());
  assert.ok(order({ items: [line({ quantity: 21, lineTotalSek: 2940 })], subtotalSek: 2940, totalSek: 2940 }).validateSync());
  assert.ok(order({ idempotencyKey: "short" }).validateSync());
});

test("public ids are 10 unambiguous characters and do not collide", () => {
  const ids = new Set(Array.from({ length: 5000 }, generatePublicId));
  assert.equal(ids.size, 5000);
  for (const id of ids) assert.match(id, /^[0-9A-HJKMNP-TV-Z]{10}$/);
});

test("menu data: every unconfirmed variant id exists on its product", () => {
  for (const p of products) {
    for (const id of p.unconfirmedVariants ?? []) {
      assert.ok(p.variants.some((v) => v.id === id), `${p.id} flags unknown variant ${id}`);
    }
  }
});
