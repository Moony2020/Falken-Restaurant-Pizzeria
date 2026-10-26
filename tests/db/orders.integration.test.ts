import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { EXTRAS } from "../../src/data/extras.ts";
import { POST as cartValidate } from "../../src/app/api/cart/validate/route.ts";
import { POST as ordersPost } from "../../src/app/api/orders/route.ts";
import { getPublicMenu } from "../../src/server/catalog-repo.ts";
import { CategoryModel, ModifierModel, ProductModel } from "../../src/server/models/catalog.ts";
import { OrderModel, PaymentModel } from "../../src/server/models/order.ts";
import { createOrder, OrderError } from "../../src/server/orders-service.ts";
import { resetRateLimits } from "../../src/server/rate-limit.ts";
import { seedCatalog } from "../../src/server/seed.ts";

// Same safety rule as the seed test: only a throwaway local database, never Atlas.
const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);

// Thursday 22 Oct 2026, 12:00 Stockholm. Pickup 13:00 is inside winter hours (11-21).
const NOW = new Date("2026-10-22T10:00:00Z");
const PICKUP = "2026-10-22T11:00:00.000Z";

let counter = 0;
const key = () => `test-key-${String(++counter).padStart(8, "0")}`;
const item = (over: object = {}) => ({ productSlug: "vesuvio", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [], note: "", ...over });
const body = (items: object[] = [item()], over: object = {}) => ({
  idempotencyKey: key(),
  items,
  contact: { name: "Anna Svensson", phone: "070-123 45 67" },
  pickupAt: PICKUP,
  ...over,
});

const rejects = async (promise: Promise<unknown>, code: string, status: number) => {
  await assert.rejects(promise, (e: unknown) => e instanceof OrderError && e.code === code && e.status === status);
};
const pricingCodes = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    if (e instanceof OrderError && e.code === "pricing") return (e.details as { code: string }[]).map((i) => i.code);
    throw e;
  }
  return [];
};

describe("orders + pricing on a local test database", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => {
    assert.ok(safe, "MONGODB_URI_TEST must be a local mongodb:// URI whose database name ends in _test");
    // Each integration file gets its own database: node runs test files in parallel.
    await mongoose.connect(uri as string, { dbName: "falken_orders_test", serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([CategoryModel.init(), ProductModel.init(), ModifierModel.init(), OrderModel.init(), PaymentModel.init()]);
    await seedCatalog();
  });
  after(async () => {
    mock.timers.reset();
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(() => resetRateLimits());

  describe("server-side prices", () => {
    test("totals come from the database, with sizes, removal and gluten-free", async () => {
      const { order, replayed } = await createOrder(
        body([
          item({ productSlug: "hawaii", variantId: "familj", quantity: 2, removedIngredients: ["ananas"], modifiers: [{ slug: "glutenfri-deg", quantity: 1 }], note: "Extra krispig" }),
          item({ productSlug: "kebabtallrik", variantId: "standard" }),
        ]),
        NOW,
      );
      assert.equal(replayed, false);
      assert.equal(order.items[0].lineTotalSek, (275 + 30) * 2);
      assert.deepEqual(order.items[0].removedIngredients, ["Ananas"]);
      assert.equal(order.items[1].lineTotalSek, 125);
      assert.equal(order.totalSek, 610 + 125);
    });

    test("a new order is PENDING_PAYMENT / pending and exposes no private data", async () => {
      const { order } = await createOrder(body(), NOW);
      assert.equal(order.status, "PENDING_PAYMENT");
      assert.equal(order.paymentStatus, "pending");
      assert.match(order.publicId, /^[0-9A-Z]{10}$/);
      assert.ok(!JSON.stringify(order).includes("070-123"));
      assert.ok(!("idempotencyKey" in order));
    });

    test("creating orders never creates payments", async () => {
      await createOrder(body(), NOW);
      assert.equal(await PaymentModel.countDocuments(), 0);
    });

    test("an order keeps its snapshot when the menu price changes later", async () => {
      const { order } = await createOrder(body(), NOW);
      await ProductModel.updateOne({ slug: "vesuvio", "variants.id": "normal" }, { $set: { "variants.$.priceSek": 115 } });
      try {
        const stored = await OrderModel.findOne({ publicId: order.publicId }).lean();
        assert.equal(stored?.items[0].basePriceSek, 110);
        assert.equal(stored?.totalSek, 110);
        const fresh = await createOrder(body(), NOW);
        assert.equal(fresh.order.totalSek, 115);
      } finally {
        await ProductModel.updateOne({ slug: "vesuvio", "variants.id": "normal" }, { $set: { "variants.$.priceSek": 110 } });
      }
    });
  });

  describe("unconfirmed and unavailable items", () => {
    test("Klass 3 Normal is refused, its Familj size is orderable", async () => {
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "vegetariana" })]), NOW)), ["price_unconfirmed"]);
      const { order } = await createOrder(body([item({ productSlug: "vegetariana", variantId: "familj" })]), NOW);
      assert.equal(order.totalSek, 285);
    });

    test("closed-pizza Familj and the falafel dishes are refused", async () => {
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "ingela", variantId: "familj" })]), NOW)), ["price_unconfirmed"]);
      // A calzone has no family size at all, so asking for one is simply an unknown size.
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "calzone", variantId: "familj" })]), NOW)), ["unknown_variant"]);
      assert.ok((await createOrder(body([item({ productSlug: "calzone" })]), NOW)).order.totalSek === 110);
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "falafelrulle", variantId: "standard" })]), NOW)), ["price_unconfirmed"]);
    });

    test("an owner confirming a price makes the item orderable", async () => {
      await ProductModel.updateOne({ slug: "falafelrulle", "variants.id": "standard" }, { $set: { "variants.$.priceStatus": "confirmed" } });
      try {
        const { order } = await createOrder(body([item({ productSlug: "falafelrulle", variantId: "standard" })]), NOW);
        assert.equal(order.totalSek, 125);
      } finally {
        await ProductModel.updateOne({ slug: "falafelrulle", "variants.id": "standard" }, { $set: { "variants.$.priceStatus": "needs_review" } });
      }
    });

    test("unavailable sizes and inactive products are refused", async () => {
      await ProductModel.updateOne({ slug: "bari", "variants.id": "familj" }, { $set: { "variants.$.available": false } });
      await ProductModel.updateOne({ slug: "disco" }, { $set: { active: false } });
      try {
        assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "bari", variantId: "familj" })]), NOW)), ["variant_unavailable"]);
        assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "disco" })]), NOW)), ["product_unavailable"]);
      } finally {
        await ProductModel.updateOne({ slug: "bari", "variants.id": "familj" }, { $set: { "variants.$.available": true } });
        await ProductModel.updateOne({ slug: "disco" }, { $set: { active: true } });
      }
    });

    test("no paid extras exist until the owner defines them", async () => {
      assert.deepEqual(await pricingCodes(createOrder(body([item({ modifiers: [{ slug: "extra-ost", quantity: 1 }] })]), NOW)), ["unknown_modifier"]);
    });

    test("gluten-free only works on pizzas, and only once", async () => {
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "kebabtallrik", variantId: "standard", modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] })]), NOW)), ["modifier_not_allowed"]);
      assert.deepEqual(await pricingCodes(createOrder(body([item({ modifiers: [{ slug: "glutenfri-deg", quantity: 2 }] })]), NOW)), ["modifier_quantity"]);
    });

    test("removal rules follow the category", async () => {
      assert.deepEqual(await pricingCodes(createOrder(body([item({ removedIngredients: ["Ananas"] })]), NOW)), ["unknown_ingredient"]);
      assert.deepEqual(await pricingCodes(createOrder(body([item({ productSlug: "hamburgare-90-g", variantId: "standard", removedIngredients: ["Bröd"] })]), NOW)), ["removal_not_allowed"]);
    });
  });

  describe("tampering", () => {
    const before = () => OrderModel.countDocuments();

    test("client-supplied price, total and status fields are refused and nothing is stored", async () => {
      const count = await before();
      for (const extra of [{ totalSek: 1 }, { subtotalSek: 1 }, { paymentStatus: "paid" }, { fulfillmentStatus: "PAID" }, { discountSek: 100 }]) {
        await rejects(createOrder({ ...body(), ...extra }, NOW), "invalid_request", 400);
      }
      await rejects(createOrder(body([{ ...item(), priceSek: 1 }]), NOW), "invalid_request", 400);
      assert.equal(await OrderModel.countDocuments(), count);
    });

    test("NoSQL operator objects are refused", async () => {
      await rejects(createOrder(body([item({ productSlug: { $ne: null } })]), NOW), "invalid_request", 400);
      await rejects(createOrder({ ...body(), idempotencyKey: { $gt: "" } }, NOW), "invalid_request", 400);
    });

    test("pickup times the kitchen can't serve are refused", async () => {
      for (const pickupAt of ["2026-10-22T10:05:00.000Z", "2026-10-22T19:30:00.000Z", "2026-10-22T11:07:00.000Z", "2026-10-21T11:00:00.000Z"]) {
        await rejects(createOrder(body([item()], { pickupAt }), NOW), "pickup_unavailable", 422);
      }
    });
  });

  describe("the total the customer approved", () => {
    const priceChanged = async (promise: Promise<unknown>, expectedSek: number, actualSek: number) => {
      await assert.rejects(promise, (e: unknown) => {
        const d = e instanceof OrderError ? (e.details as { expectedSek: number; actualSek: number }) : null;
        return e instanceof OrderError && e.code === "price_changed" && e.status === 409 && d?.expectedSek === expectedSek && d?.actualSek === actualSek;
      });
    };

    test("an order whose approved total matches the server total is created", async () => {
      const { order } = await createOrder(body([item()], { expectedTotalSek: 110 }), NOW);
      assert.equal(order.totalSek, 110);
    });

    test("a wrong total is refused with both amounts and nothing is stored", async () => {
      const b = body([item()], { expectedTotalSek: 1 });
      await priceChanged(createOrder(b, NOW), 1, 110);
      assert.equal(await OrderModel.countDocuments({ idempotencyKey: b.idempotencyKey }), 0);
    });

    test("a menu price change after the customer approved is caught, never charged silently", async () => {
      await ProductModel.updateOne({ slug: "vesuvio", "variants.id": "normal" }, { $set: { "variants.$.priceSek": 115 } });
      try {
        await priceChanged(createOrder(body([item()], { expectedTotalSek: 110 }), NOW), 110, 115);
        const { order } = await createOrder(body([item()], { expectedTotalSek: 115 }), NOW);
        assert.equal(order.totalSek, 115);
      } finally {
        await ProductModel.updateOne({ slug: "vesuvio", "variants.id": "normal" }, { $set: { "variants.$.priceSek": 110 } });
      }
    });

    test("the approved total is only a guard: it can't lower the price", async () => {
      await priceChanged(createOrder(body([item({ quantity: 2 })], { expectedTotalSek: 50 }), NOW), 50, 220);
    });

    test("malformed approved totals are refused as invalid", async () => {
      for (const expectedTotalSek of [-1, 1.5, "110", null]) {
        await rejects(createOrder(body([item()], { expectedTotalSek }), NOW), "invalid_request", 400);
      }
    });
  });

  describe("idempotency", () => {
    test("the same key and request returns the same order, once", async () => {
      const b = body();
      const first = await createOrder(b, NOW);
      const again = await createOrder(b, NOW);
      assert.equal(first.replayed, false);
      assert.equal(again.replayed, true);
      assert.equal(again.order.publicId, first.order.publicId);
      assert.equal(await OrderModel.countDocuments({ idempotencyKey: b.idempotencyKey }), 1);
    });

    test("the key can't be reused for a different order", async () => {
      const b = body();
      await createOrder(b, NOW);
      await rejects(createOrder({ ...b, items: [item({ variantId: "familj" })] }, NOW), "idempotency_conflict", 409);
      await rejects(createOrder({ ...b, contact: { name: "Någon Annan", phone: "070-999 99 99" } }, NOW), "idempotency_conflict", 409);
    });

    test("a retry still succeeds after the pickup time has passed", async () => {
      const b = body();
      const first = await createOrder(b, NOW);
      const later = await createOrder(b, new Date("2026-10-22T15:00:00Z"));
      assert.equal(later.replayed, true);
      assert.equal(later.order.publicId, first.order.publicId);
    });

    test("parallel duplicate submissions create exactly one order", async () => {
      const b = body();
      const results = await Promise.all(Array.from({ length: 8 }, () => createOrder(b, NOW)));
      assert.equal(new Set(results.map((r) => r.order.publicId)).size, 1);
      assert.equal(results.filter((r) => !r.replayed).length, 1);
      assert.equal(await OrderModel.countDocuments({ idempotencyKey: b.idempotencyKey }), 1);
    });

    test("an invalid order doesn't burn its key", async () => {
      const bad = body([item({ productSlug: "vegetariana" })]);
      await rejects(createOrder(bad, NOW), "pricing", 422);
      assert.equal(await OrderModel.countDocuments({ idempotencyKey: bad.idempotencyKey }), 0);
      const fixed = { ...bad, items: [item({ productSlug: "vegetariana", variantId: "familj" })] };
      assert.equal((await createOrder(fixed, NOW)).replayed, false);
    });
  });

  describe("menu API data", () => {
    test("exposes the menu without internal fields and flags unorderable sizes", async () => {
      const menu = await getPublicMenu();
      assert.equal(menu.categories.length, 9);
      assert.ok(menu.products.length >= 102);
      assert.ok(!JSON.stringify(menu).includes("reviewNote"));
      const vegetariana = menu.products.find((p) => p.slug === "vegetariana");
      assert.deepEqual(vegetariana?.variants.map((v) => [v.id, v.orderable]), [["normal", false], ["familj", true]]);
      assert.equal(menu.modifiers.length, 1 + EXTRAS.length);
      assert.ok(menu.modifiers.some((m) => m.slug === "glutenfri-deg"));
      assert.ok(menu.modifiers.every((m) => Object.values(m.priceByVariantSek).every(Number.isInteger)));
    });

    test("inactive products and unconfirmed extras stay off the menu", async () => {
      await ProductModel.updateOne({ slug: "disco" }, { $set: { active: false } });
      await ModifierModel.updateMany({}, { $set: { priceStatus: "needs_review" } });
      try {
        const menu = await getPublicMenu();
        assert.ok(!menu.products.some((p) => p.slug === "disco"));
        assert.equal(menu.modifiers.length, 0);
      } finally {
        await ProductModel.updateOne({ slug: "disco" }, { $set: { active: true } });
        await ModifierModel.updateMany({}, { $set: { priceStatus: "confirmed" } });
      }
    });
  });

  describe("HTTP routes", () => {
    // The orders route refuses to run without a token secret. Tests bring their own throwaway one so they never
    // depend on a developer's .env.local or on CI secrets, and put the environment back afterwards.
    const TEST_SECRET = "test-only-order-token-secret-0123456789";
    let savedSecret: string | undefined;
    before(() => {
      savedSecret = process.env.ORDER_TOKEN_SECRET;
      process.env.ORDER_TOKEN_SECRET = TEST_SECRET;
    });
    after(() => {
      if (savedSecret === undefined) delete process.env.ORDER_TOKEN_SECRET;
      else process.env.ORDER_TOKEN_SECRET = savedSecret;
    });
    let ip = 0;
    const post = (handler: (r: Request) => Promise<Response>, url: string, payload: unknown, headers: Record<string, string> = {}) =>
      handler(
        new Request(`http://shop.test${url}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
          body: typeof payload === "string" ? payload : JSON.stringify(payload),
        }),
      );

    test("cart validation returns server totals and refuses unconfirmed prices", async () => {
      const ok = await post(cartValidate, "/api/cart/validate", { items: [item({ productSlug: "hawaii", variantId: "familj" })] });
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).totalSek, 275);

      const refused = await post(cartValidate, "/api/cart/validate", { items: [item({ productSlug: "vegetariana" })] });
      assert.equal(refused.status, 422);
      assert.equal((await refused.json()).issues[0].code, "price_unconfirmed");
    });

    test("seeded extras are priced by the server on any pizza: Vesuvio + extra ost + bacon + champinjoner = 110 + 10 + 20 + 10", async () => {
      const modifiers = ["extra-extra-ost", "extra-bacon", "extra-champinjoner"].map((slug) => ({ slug, quantity: 1 }));
      const res = await post(cartValidate, "/api/cart/validate", { items: [item({ modifiers })] });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).totalSek, 150);
    });

    test("cart validation ignores nothing: a client total is a 400", async () => {
      const res = await post(cartValidate, "/api/cart/validate", { items: [item()], totalSek: 1 });
      assert.equal(res.status, 400);
    });

    test("POST /api/orders creates a pending order (201) and replays on retry (200)", async () => {
      mock.timers.enable({ apis: ["Date"], now: NOW });
      try {
        const b = body();
        const created = await post(ordersPost, "/api/orders", b);
        assert.equal(created.status, 201);
        const { order } = await created.json();
        assert.equal(order.status, "PENDING_PAYMENT");
        assert.equal(order.paymentStatus, "pending");

        const retry = await post(ordersPost, "/api/orders", b);
        assert.equal(retry.status, 200);
        assert.equal((await retry.json()).order.publicId, order.publicId);
      } finally {
        mock.timers.reset();
      }
    });

    test("POST /api/orders answers 409 price_changed when the approved total is stale", async () => {
      mock.timers.enable({ apis: ["Date"], now: NOW });
      try {
        const res = await post(ordersPost, "/api/orders", body([item()], { expectedTotalSek: 100 }));
        assert.equal(res.status, 409);
        const json = await res.json();
        assert.equal(json.error, "price_changed");
        assert.deepEqual(json.details, { expectedSek: 100, actualSek: 110 });
      } finally {
        mock.timers.reset();
      }
    });

    test("POST /api/orders refuses a forged status or total", async () => {
      for (const extra of [{ status: "PAID" }, { paymentStatus: "paid" }, { totalSek: 0 }]) {
        const res = await post(ordersPost, "/api/orders", { ...body(), ...extra });
        assert.equal(res.status, 400);
      }
    });

    test("transport guards: content type, JSON, foreign origin, size", async () => {
      assert.equal((await post(ordersPost, "/api/orders", "x=1", { "content-type": "application/x-www-form-urlencoded" })).status, 415);
      assert.equal((await post(ordersPost, "/api/orders", "{broken")).status, 400);
      assert.equal((await post(ordersPost, "/api/orders", body(), { origin: "https://evil.example" })).status, 403);
      assert.equal((await post(ordersPost, "/api/orders", { pad: "x".repeat(30_000) })).status, 413);
    });

    test("orders are rate limited per client address", async () => {
      const headers = { "x-forwarded-for": "203.0.113.7" };
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await post(ordersPost, "/api/orders", {}, headers)).status);
      assert.equal(statuses.filter((s) => s === 429).length, 2);
      assert.equal(statuses.slice(0, 10).every((s) => s === 400), true);
    });
  });
});
