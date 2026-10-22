import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { categories, products } from "../../src/data/menu.ts";
import { CategoryModel, ModifierModel, ProductModel } from "../../src/server/models/catalog.ts";
import { OrderModel } from "../../src/server/models/order.ts";
import { seedCatalog } from "../../src/server/seed.ts";

// Integration tests run only against a throwaway local database. They refuse anything else,
// so they can never touch the Atlas cluster that will hold real orders.
const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);

describe("seed + persistence (local test database)", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => {
    assert.ok(safe, "MONGODB_URI_TEST must be a local mongodb:// URI whose database name ends in _test");
    await mongoose.connect(uri as string, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([CategoryModel.init(), ProductModel.init(), ModifierModel.init(), OrderModel.init()]);
  });
  after(async () => {
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test("first seed inserts the whole menu", async () => {
    const r = await seedCatalog();
    assert.equal(r.categories, categories.length);
    assert.equal(r.products, products.length);
    assert.equal(r.modifiers, 1);
    assert.equal(await ProductModel.countDocuments(), products.length);
  });

  test("seeding again inserts nothing", async () => {
    const r = await seedCatalog();
    assert.deepEqual(r, { categories: 0, products: 0, modifiers: 0 });
  });

  test("re-seeding never overwrites an owner's price edit", async () => {
    await ProductModel.updateOne({ slug: "vesuvio", "variants.id": "normal" }, { $set: { "variants.$.priceSek": 115 } });
    await seedCatalog();
    const p = await ProductModel.findOne({ slug: "vesuvio" }).lean();
    assert.equal(p?.variants.find((v) => v.id === "normal")?.priceSek, 115);
  });

  test("unconfirmed prices are flagged needs_review, confirmed ones are not", async () => {
    const status = async (slug: string, variant: string) =>
      (await ProductModel.findOne({ slug }).lean())?.variants.find((v) => v.id === variant)?.priceStatus;

    assert.equal(await status("vegetariana", "normal"), "needs_review"); // Klass 3 conflict
    assert.equal(await status("vegetariana", "familj"), "confirmed");
    assert.equal(await status("lucas-special", "normal"), "needs_review");
    assert.equal(await status("lucas-special", "familj"), "needs_review");
    assert.equal(await status("calzone", "familj"), "needs_review"); // closed pizza family size
    assert.equal(await status("calzone", "normal"), "confirmed");
    assert.equal(await status("falafelrulle", "standard"), "needs_review");
    assert.equal(await status("kebabtallrik", "standard"), "confirmed");
  });

  test("every Klass 3 pizza has its Normal price flagged", async () => {
    const k3 = await ProductModel.find({ group: "Klass 3" }).lean();
    assert.equal(k3.length, 11);
    for (const p of k3) assert.equal(p.variants.find((v) => v.id === "normal")?.priceStatus, "needs_review", p.slug);
  });

  test("no paid extras are invented: only gluten-free dough is seeded", async () => {
    const mods = await ModifierModel.find().lean();
    assert.deepEqual(mods.map((m) => m.slug), ["glutenfri-deg"]);
  });

  test("slug uniqueness is enforced by the database", async () => {
    await assert.rejects(
      ProductModel.create({
        slug: "vesuvio",
        nameSv: "Dubblett",
        categorySlug: "pizza",
        variants: [{ id: "normal", label: "Normal", priceSek: 100, priceStatus: "confirmed" }],
      }),
      /E11000/,
    );
  });

  const orderInput = (key: string) => ({
    idempotencyKey: key,
    items: [
      {
        productSlug: "vesuvio",
        productNameSnapshot: "Vesuvio",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 110,
        quantity: 1,
        lineTotalSek: 110,
      },
    ],
    subtotalSek: 110,
    totalSek: 110,
    pickupAt: new Date("2026-10-23T11:00:00Z"),
    contact: { name: "Anna", phone: "070-123 45 67" },
  });

  test("an order is stored with a public id, and a duplicate idempotency key is rejected", async () => {
    const first = await OrderModel.create(orderInput("key-0000000000001"));
    assert.match(first.publicId, /^[0-9A-Z]{10}$/);
    await assert.rejects(OrderModel.create(orderInput("key-0000000000001")), /E11000/);
    assert.equal(await OrderModel.countDocuments(), 1);
  });

  test("an inconsistent order is refused before it reaches the database", async () => {
    const bad = { ...orderInput("key-0000000000002"), totalSek: 1 };
    await assert.rejects(OrderModel.create(bad), /Total 1/);
    assert.equal(await OrderModel.countDocuments({ idempotencyKey: "key-0000000000002" }), 0);
  });
});
