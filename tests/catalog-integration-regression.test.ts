import assert from "node:assert/strict";
import test, { after, before, describe } from "node:test";
import mongoose from "mongoose";
import { ProductModel, CategoryModel, ModifierModel } from "../src/server/models/catalog.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { createOrder, OrderError } from "../src/server/orders-service.ts";
import type { OrderRequest } from "../src/server/cart-schema.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas or any port other than our
// dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_catalog_integration_regression_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const TEST_SECRET = "falken-test-order-secret-min-32-chars-long";
const NOW = new Date("2026-10-22T10:00:00Z"); // Thursday inside opening hours
const VALID_PICKUP_AT = "2026-10-22T11:00:00.000Z"; // Valid slot on 15-min grid

const APPROVED_IMAGE = "/images/dishes/pizza/vesuvio.webp";

before(async () => {
  // Clear any ambient remote MONGODB_URI loaded from .env.local to avoid connecting or failing
  delete process.env.MONGODB_URI;

  await mongoose.disconnect();
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });

  const host = mongoose.connection.host;
  const port = mongoose.connection.port;
  const dbName = mongoose.connection.name;

  if (port !== TEST_MONGODB_PORT) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Expected port ${TEST_MONGODB_PORT}, but connected to port ${port}! ABORTING.`);
  }

  if (dbName !== TEST_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Expected db ${TEST_DB_NAME}, but connected to ${dbName}! ABORTING.`);
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Connected to remote host ${host}! ABORTING.`);
  }

  const adminDb = mongoose.connection.db?.admin();
  const hello = await adminDb?.command({ hello: 1 });
  if (!hello?.setName || hello.setName !== TEST_REPLICA_SET) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Replica set is not ${TEST_REPLICA_SET}! ABORTING.`);
  }

  // Ensure restaurant settings exist and allow online ordering
  await RestaurantSettingsModel.findByIdAndUpdate(
    "restaurant",
    {
      onlineOrderingEnabled: true,
      manualOverride: null,
      updatedAt: NOW,
    },
    { upsert: true },
  );

  // Clean only synthetic test data owned by this test suite
  await cleanupSyntheticData();
});

after(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await cleanupSyntheticData();
    }
  } finally {
    await mongoose.disconnect();
  }
});

async function cleanupSyntheticData() {
  await ProductModel.deleteMany({ slug: { $regex: /^synth-int-/ } });
  await CategoryModel.deleteMany({ slug: { $regex: /^synth-int-/ } });
  await ModifierModel.deleteMany({ slug: { $regex: /^synth-int-/ } });
  await OrderModel.deleteMany({ publicId: { $regex: /^synth-int-/ } });
  await OrderModel.deleteMany({ idempotencyKey: { $regex: /^k-int-/ } });
  await PaymentModel.deleteMany({ providerSessionId: { $regex: /^cs_synth_int_/ } });
}

// Helpers to seed synthetic entities
async function seedCategory(slug: string, overrides: Record<string, unknown> = {}) {
  await CategoryModel.deleteOne({ slug });
  return await CategoryModel.create({
    slug,
    nameSv: `Kategori ${slug}`,
    blurbSv: "Beskrivning för test",
    removable: true,
    active: true,
    sortOrder: 1,
    ...overrides,
  });
}

async function seedProduct(slug: string, overrides: Record<string, unknown> = {}) {
  await ProductModel.deleteOne({ slug });
  return await ProductModel.create({
    slug,
    nameSv: "Syntetisk Pizza",
    descriptionSv: "Skapad endast för integrationstest",
    image: APPROVED_IMAGE,
    active: true,
    sortOrder: 10,
    categorySlug: "synth-int-cat-main",
    ingredients: ["Tomatsås", "Ost", "Skinka"],
    allergens: ["gluten", "laktos"],
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 265, available: true, priceStatus: "confirmed" },
    ],
    modifierSlugs: ["synth-int-extra-ost"],
    glutenFreeOption: true,
    ...overrides,
  });
}

async function seedModifier(slug: string, overrides: Record<string, unknown> = {}) {
  await ModifierModel.deleteOne({ slug });
  return await ModifierModel.create({
    slug,
    labelSv: "Syntetisk Extra Ost",
    groupSlug: "extras",
    priceByVariantSek: { normal: 20, familj: 35 },
    maxQty: 3,
    compatibleCategories: ["synth-int-cat-main"],
    active: true,
    priceStatus: "confirmed",
    ...overrides,
  });
}

function makeItem(
  productSlug: string,
  variantId: string,
  overrides: Partial<OrderRequest["items"][number]> = {},
): OrderRequest["items"][number] {
  return {
    productSlug,
    variantId,
    quantity: 1,
    removedIngredients: [],
    modifiers: [],
    note: "",
    ifUnavailable: "call",
    ...overrides,
  };
}

function makeOrderBody(overrides: Partial<OrderRequest> = {}): OrderRequest {
  return {
    idempotencyKey: `k-int-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    items: [makeItem("synth-int-p1", "normal")],
    contact: { name: "Testkund", phone: "070-123 45 67" },
    pickupAt: VALID_PICKUP_AT,
    expectedTotalSek: 110,
    paymentMethod: "pay_on_pickup",
    ...overrides,
  };
}

describe("A6.4 — Catalog Integration & Regression Suite", () => {
  // --------------------------------------------------------------------------
  // TC-INT-01: Product price changes after a customer prepares a cart
  // --------------------------------------------------------------------------
  test("TC-INT-01: rejects order when product variant price changed after cart preparation (409 price_changed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p1", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    });

    const initialOrderCount = await OrderModel.countDocuments();

    // Customer carts at 110 SEK
    const body = makeOrderBody({
      items: [makeItem("synth-int-p1", "normal")],
      expectedTotalSek: 110,
    });

    // Admin updates price to 125 SEK in DB
    await ProductModel.updateOne(
      { slug: "synth-int-p1", "variants.id": "normal" },
      { $set: { "variants.$.priceSek": 125 } },
    );

    // Customer submits order
    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "price_changed");
        assert.equal(err.status, 409);
        const details = err.details as { expectedSek: number; actualSek: number };
        assert.equal(details.expectedSek, 110);
        assert.equal(details.actualSek, 125);
        return true;
      },
    );

    // Ensure zero orders were created
    const finalOrderCount = await OrderModel.countDocuments();
    assert.equal(finalOrderCount, initialOrderCount);
  });

  // --------------------------------------------------------------------------
  // TC-INT-02: Modifier price changes after a customer selects the extra
  // --------------------------------------------------------------------------
  test("TC-INT-02: rejects order when paid modifier price changed after selection (409 price_changed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p2", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod1"],
    });
    await seedModifier("synth-int-mod1", {
      priceByVariantSek: { normal: 20 },
      compatibleCategories: ["synth-int-cat-main"],
    });

    const initialOrderCount = await OrderModel.countDocuments();

    // Customer carts dish (110) + extra (20) = expectedTotalSek: 130
    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p2", "normal", {
          modifiers: [{ slug: "synth-int-mod1", quantity: 1 }],
        }),
      ],
      expectedTotalSek: 130,
    });

    // Admin updates modifier price to 25 SEK in DB
    await ModifierModel.updateOne(
      { slug: "synth-int-mod1" },
      { $set: { "priceByVariantSek.normal": 25 } },
    );

    // Customer submits order
    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "price_changed");
        assert.equal(err.status, 409);
        const details = err.details as { expectedSek: number; actualSek: number };
        assert.equal(details.expectedSek, 130);
        assert.equal(details.actualSek, 135);
        return true;
      },
    );

    const finalOrderCount = await OrderModel.countDocuments();
    assert.equal(finalOrderCount, initialOrderCount);
  });

  // --------------------------------------------------------------------------
  // TC-INT-03: Product or variant becomes unavailable before order creation
  // --------------------------------------------------------------------------
  test("TC-INT-03A: rejects order when product becomes inactive (422 product_unavailable)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p3a", { active: true });

    const body = makeOrderBody({
      items: [makeItem("synth-int-p3a", "normal")],
      expectedTotalSek: 110,
    });

    // Admin deactivates product
    await ProductModel.updateOne({ slug: "synth-int-p3a" }, { $set: { active: false } });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "product_unavailable"));
        return true;
      },
    );
  });

  test("TC-INT-03B: rejects order when variant becomes unavailable (422 variant_unavailable)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p3b", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    });

    const body = makeOrderBody({
      items: [makeItem("synth-int-p3b", "normal")],
      expectedTotalSek: 110,
    });

    // Admin sets variant available to false
    await ProductModel.updateOne(
      { slug: "synth-int-p3b", "variants.id": "normal" },
      { $set: { "variants.$.available": false } },
    );

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "variant_unavailable"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-04: Category disabled after item added to cart
  // --------------------------------------------------------------------------
  test("TC-INT-04: rejects order when category becomes inactive (422 product_unavailable)", async () => {
    await seedCategory("synth-int-cat-temp", { active: true });
    await seedProduct("synth-int-p4", { categorySlug: "synth-int-cat-temp" });

    const body = makeOrderBody({
      items: [makeItem("synth-int-p4", "normal")],
      expectedTotalSek: 110,
    });

    // Admin deactivates category
    await CategoryModel.updateOne({ slug: "synth-int-cat-temp" }, { $set: { active: false } });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "product_unavailable"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-05: Category.removable becomes false while cart contains removedIngredients
  // --------------------------------------------------------------------------
  test("TC-INT-05: rejects ingredient removal when category.removable is flipped to false (422 removal_not_allowed)", async () => {
    await seedCategory("synth-int-cat-removable", { removable: true });
    await seedProduct("synth-int-p5", {
      categorySlug: "synth-int-cat-removable",
      ingredients: ["Tomatsås", "Ost", "Lök"],
    });

    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p5", "normal", {
          removedIngredients: ["Lök"],
        }),
      ],
      expectedTotalSek: 110,
    });

    // Admin flips category.removable to false
    await CategoryModel.updateOne({ slug: "synth-int-cat-removable" }, { $set: { removable: false } });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "removal_not_allowed"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-06: Admin removes/renames original ingredient while cart references it
  // --------------------------------------------------------------------------
  test("TC-INT-06: rejects order when requested removed ingredient was deleted from recipe by Admin (422 unknown_ingredient)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p6", {
      ingredients: ["Tomatsås", "Ost", "Skinka", "Lök"],
    });

    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p6", "normal", {
          removedIngredients: ["Lök"],
        }),
      ],
      expectedTotalSek: 110,
    });

    // Admin removes "Lök" from recipe
    await ProductModel.updateOne(
      { slug: "synth-int-p6" },
      { $set: { ingredients: ["Tomatsås", "Ost", "Skinka"] } },
    );

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "unknown_ingredient"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-07: Admin revokes a modifier's compatibleCategories entry
  // --------------------------------------------------------------------------
  test("TC-INT-07: rejects extra when category compatibility is revoked by Admin (422 modifier_not_allowed)", async () => {
    await seedCategory("synth-int-cat-burger");
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p7", {
      categorySlug: "synth-int-cat-burger",
      variants: [{ id: "standard", label: "Standard", priceSek: 95, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod-bacon"],
    });
    await seedModifier("synth-int-mod-bacon", {
      priceByVariantSek: { standard: 15 },
      compatibleCategories: ["synth-int-cat-burger", "synth-int-cat-main"],
    });

    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p7", "standard", {
          modifiers: [{ slug: "synth-int-mod-bacon", quantity: 1 }],
        }),
      ],
      expectedTotalSek: 110, // 95 + 15
    });

    // Admin revokes burger compatibility: compatible only with main pizza category now
    await ModifierModel.updateOne(
      { slug: "synth-int-mod-bacon" },
      { $set: { compatibleCategories: ["synth-int-cat-main"] } },
    );

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "modifier_not_allowed"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-08: Historical order snapshot immutability
  // --------------------------------------------------------------------------
  test("TC-INT-08: historical order snapshots and totals remain 100% immutable after subsequent catalog changes", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p8", {
      nameSv: "Original Pizza",
      ingredients: ["Tomatsås", "Ost", "Skinka"],
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod8"],
    });
    await seedModifier("synth-int-mod8", {
      labelSv: "Original Extra Ost",
      priceByVariantSek: { normal: 20 },
      compatibleCategories: ["synth-int-cat-main"],
    });

    // Create an order: (110 + 20) * 2 = 260 SEK
    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p8", "normal", {
          quantity: 2,
          removedIngredients: ["Skinka"],
          modifiers: [{ slug: "synth-int-mod8", quantity: 1 }],
          note: "Välgräddad tack",
        }),
      ],
      expectedTotalSek: 260,
    });

    const createResult = await createOrder(body, NOW, { tokenSecret: TEST_SECRET });
    assert.equal(createResult.replayed, false);
    assert.equal(createResult.order.totalSek, 260);
    const publicId = createResult.order.publicId;

    // Drastic Admin modifications to catalog in DB:
    // 1. Change product variant price to 180 SEK
    // 2. Change product name to "Vesuvio Extreme"
    // 3. Remove "Skinka" and add "Ananas" to recipe
    // 4. Change modifier price to 50 SEK
    // 5. Change modifier label to "Lyxost"
    // 6. Deactivate category
    await ProductModel.updateOne(
      { slug: "synth-int-p8" },
      {
        $set: {
          nameSv: "Vesuvio Extreme",
          ingredients: ["Tomatsås", "Ost", "Ananas"],
          "variants.0.priceSek": 180,
        },
      },
    );
    await ModifierModel.updateOne(
      { slug: "synth-int-mod8" },
      {
        $set: {
          labelSv: "Lyxost",
          "priceByVariantSek.normal": 50,
        },
      },
    );
    await CategoryModel.updateOne({ slug: "synth-int-cat-main" }, { $set: { active: false } });

    // Reload the historical order directly from MongoDB
    const historical = await OrderModel.findOne({ publicId }).lean();
    assert.ok(historical);

    // Verify snapshot fields are completely unchanged
    assert.equal(historical.subtotalSek, 260);
    assert.equal(historical.totalSek, 260);
    assert.equal(historical.items.length, 1);

    const item = historical.items[0];
    assert.equal(item.productSlug, "synth-int-p8");
    assert.equal(item.productNameSnapshot, "Original Pizza"); // Kept original name
    assert.equal(item.variantId, "normal");
    assert.equal(item.variantNameSnapshot, "Normal");
    assert.equal(item.basePriceSek, 110); // Kept original 110 SEK
    assert.equal(item.quantity, 2);
    assert.equal(item.lineTotalSek, 260); // Kept original line total
    assert.deepEqual(item.removedIngredients, ["Skinka"]); // Kept original removed ingredient
    assert.equal(item.note, "Välgräddad tack");

    assert.equal(item.modifiersSnapshot.length, 1);
    assert.equal(item.modifiersSnapshot[0].modifierSlug, "synth-int-mod8");
    assert.equal(item.modifiersSnapshot[0].labelSv, "Original Extra Ost"); // Kept original modifier label
    assert.equal(item.modifiersSnapshot[0].priceSek, 20); // Kept original 20 SEK
    assert.equal(item.modifiersSnapshot[0].quantity, 1);
  });

  // --------------------------------------------------------------------------
  // TC-INT-09: Order idempotency after catalog changes
  // --------------------------------------------------------------------------
  test("TC-INT-09A: identical retry with same idempotency key replays original order after catalog price changes", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p9", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    });

    const fixedIdempotencyKey = `k-int-idem-valid-${Date.now()}`;
    const body = makeOrderBody({
      idempotencyKey: fixedIdempotencyKey,
      items: [makeItem("synth-int-p9", "normal")],
      expectedTotalSek: 110,
    });

    // First attempt creates order
    const firstResult = await createOrder(body, NOW, { tokenSecret: TEST_SECRET });
    assert.equal(firstResult.replayed, false);
    assert.equal(firstResult.order.totalSek, 110);
    const orderPublicId = firstResult.order.publicId;

    // Admin updates catalog price to 160 SEK
    await ProductModel.updateOne(
      { slug: "synth-int-p9", "variants.id": "normal" },
      { $set: { "variants.$.priceSek": 160 } },
    );

    // Identical retry with same key and same body
    const retryResult = await createOrder(body, NOW, { tokenSecret: TEST_SECRET });
    assert.equal(retryResult.replayed, true);
    assert.equal(retryResult.order.publicId, orderPublicId);
    assert.equal(retryResult.order.totalSek, 110); // Still 110 SEK, not 160!

    // Verify no second order was inserted
    const count = await OrderModel.countDocuments({ idempotencyKey: fixedIdempotencyKey });
    assert.equal(count, 1);
  });

  test("TC-INT-09B: same idempotency key with modified payload is rejected with 409 idempotency_conflict", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p9b", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    });

    const fixedIdempotencyKey = `k-int-idem-conflict-${Date.now()}`;
    const initialBody = makeOrderBody({
      idempotencyKey: fixedIdempotencyKey,
      items: [makeItem("synth-int-p9b", "normal")],
      expectedTotalSek: 110,
    });

    // Create initial order
    await createOrder(initialBody, NOW, { tokenSecret: TEST_SECRET });

    // Attacker or client reuses key with different payload (quantity 2 instead of 1)
    const conflictingBody = makeOrderBody({
      idempotencyKey: fixedIdempotencyKey,
      items: [makeItem("synth-int-p9b", "normal", { quantity: 2 })],
      expectedTotalSek: 220,
    });

    await assert.rejects(
      async () => createOrder(conflictingBody, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "idempotency_conflict");
        assert.equal(err.status, 409);
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-10: Rejection of invalid or unconfirmed catalog pricing
  // --------------------------------------------------------------------------
  test("TC-INT-10A: rejects order when product variant price is 0 SEK (422 price_unconfirmed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10a", {
      variants: [{ id: "normal", label: "Normal", priceSek: 0, available: true, priceStatus: "confirmed" }],
    });

    const body = makeOrderBody({
      items: [makeItem("synth-int-p10a", "normal")],
      expectedTotalSek: 0,
    });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "price_unconfirmed"));
        return true;
      },
    );
  });

  test("TC-INT-10B: rejects order when modifier price is 0 SEK (422 modifier_price_unconfirmed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10b", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod10b"],
    });
    await seedModifier("synth-int-mod10b", {
      priceByVariantSek: { normal: 0 },
      compatibleCategories: ["synth-int-cat-main"],
    });

    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p10b", "normal", {
          modifiers: [{ slug: "synth-int-mod10b", quantity: 1 }],
        }),
      ],
      expectedTotalSek: 110,
    });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "modifier_price_unconfirmed"));
        return true;
      },
    );
  });

  test("TC-INT-10C: rejects order when product variant priceStatus is needs_review (422 price_unconfirmed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10c", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "needs_review" }],
    });

    const body = makeOrderBody({
      items: [makeItem("synth-int-p10c", "normal")],
      expectedTotalSek: 110,
    });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "price_unconfirmed"));
        return true;
      },
    );
  });

  test("TC-INT-10D: rejects order when modifier priceStatus is needs_review (422 modifier_price_unconfirmed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10d", {
      variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod10d"],
    });
    await seedModifier("synth-int-mod10d", {
      priceByVariantSek: { normal: 20 },
      priceStatus: "needs_review",
      compatibleCategories: ["synth-int-cat-main"],
    });

    const body = makeOrderBody({
      items: [
        makeItem("synth-int-p10d", "normal", {
          modifiers: [{ slug: "synth-int-mod10d", quantity: 1 }],
        }),
      ],
      expectedTotalSek: 130,
    });

    await assert.rejects(
      async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "modifier_price_unconfirmed"));
        return true;
      },
    );
  });

  test("TC-INT-10E: rejects order when onlineOrderingEnabled is false (409 ordering_closed)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10e");

    const body = makeOrderBody({
      items: [makeItem("synth-int-p10e", "normal")],
      expectedTotalSek: 110,
    });

    // Disable online ordering in restaurant settings
    await RestaurantSettingsModel.findByIdAndUpdate("restaurant", {
      onlineOrderingEnabled: false,
    });

    try {
      await assert.rejects(
        async () => createOrder(body, NOW, { tokenSecret: TEST_SECRET }),
        (err: unknown) => {
          assert.ok(err instanceof OrderError);
          assert.equal(err.code, "ordering_closed");
          assert.equal(err.status, 409);
          return true;
        },
      );
    } finally {
      // Restore online ordering for remaining tests
      await RestaurantSettingsModel.findByIdAndUpdate("restaurant", {
        onlineOrderingEnabled: true,
      });
    }
  });

  // --------------------------------------------------------------------------
  // TC-INT-10F: Product price boundaries (1 accepted, 10,000 accepted, 10,001 rejected)
  // --------------------------------------------------------------------------
  test("TC-INT-10F: product price boundaries (1 and 10,000 accepted, 10,001 rejected)", async () => {
    await seedCategory("synth-int-cat-main");

    // Boundary: 1 SEK accepted
    await seedProduct("synth-int-p10f-min", {
      variants: [{ id: "normal", label: "Normal", priceSek: 1, available: true, priceStatus: "confirmed" }],
    });
    const orderMin = await createOrder(
      makeOrderBody({
        items: [makeItem("synth-int-p10f-min", "normal")],
        expectedTotalSek: 1,
      }),
      NOW,
      { tokenSecret: TEST_SECRET },
    );
    assert.equal(orderMin.order.totalSek, 1);

    // Boundary: 10,000 SEK accepted
    await seedProduct("synth-int-p10f-max", {
      variants: [{ id: "normal", label: "Normal", priceSek: 10_000, available: true, priceStatus: "confirmed" }],
    });
    const orderMax = await createOrder(
      makeOrderBody({
        items: [makeItem("synth-int-p10f-max", "normal")],
        expectedTotalSek: 10_000,
      }),
      NOW,
      { tokenSecret: TEST_SECRET },
    );
    assert.equal(orderMax.order.totalSek, 10_000);

    // Boundary: 10,001 SEK rejected
    await seedProduct("synth-int-p10f-over", {
      variants: [{ id: "normal", label: "Normal", priceSek: 10_001, available: true, priceStatus: "confirmed" }],
    });
    await assert.rejects(
      async () =>
        createOrder(
          makeOrderBody({
            items: [makeItem("synth-int-p10f-over", "normal")],
            expectedTotalSek: 10_001,
          }),
          NOW,
          { tokenSecret: TEST_SECRET },
        ),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "price_unconfirmed"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-10G: Modifier price boundaries (1 accepted, 500 accepted, 501 rejected)
  // --------------------------------------------------------------------------
  test("TC-INT-10G: modifier price boundaries (1 and 500 accepted, 501 rejected)", async () => {
    await seedCategory("synth-int-cat-main");
    await seedProduct("synth-int-p10g", {
      variants: [{ id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod-min", "synth-int-mod-max", "synth-int-mod-over"],
    });

    // Boundary: 1 SEK modifier accepted
    await seedModifier("synth-int-mod-min", {
      priceByVariantSek: { normal: 1 },
      compatibleCategories: ["synth-int-cat-main"],
    });
    const orderModMin = await createOrder(
      makeOrderBody({
        items: [
          makeItem("synth-int-p10g", "normal", {
            modifiers: [{ slug: "synth-int-mod-min", quantity: 1 }],
          }),
        ],
        expectedTotalSek: 101,
      }),
      NOW,
      { tokenSecret: TEST_SECRET },
    );
    assert.equal(orderModMin.order.totalSek, 101);

    // Boundary: 500 SEK modifier accepted
    await seedModifier("synth-int-mod-max", {
      priceByVariantSek: { normal: 500 },
      compatibleCategories: ["synth-int-cat-main"],
    });
    const orderModMax = await createOrder(
      makeOrderBody({
        items: [
          makeItem("synth-int-p10g", "normal", {
            modifiers: [{ slug: "synth-int-mod-max", quantity: 1 }],
          }),
        ],
        expectedTotalSek: 600,
      }),
      NOW,
      { tokenSecret: TEST_SECRET },
    );
    assert.equal(orderModMax.order.totalSek, 600);

    // Boundary: 501 SEK modifier rejected
    await seedModifier("synth-int-mod-over", {
      priceByVariantSek: { normal: 501 },
      compatibleCategories: ["synth-int-cat-main"],
    });
    await assert.rejects(
      async () =>
        createOrder(
          makeOrderBody({
            items: [
              makeItem("synth-int-p10g", "normal", {
                modifiers: [{ slug: "synth-int-mod-over", quantity: 1 }],
              }),
            ],
            expectedTotalSek: 601,
          }),
          NOW,
          { tokenSecret: TEST_SECRET },
        ),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "modifier_price_unconfirmed"));
        return true;
      },
    );
  });

  // --------------------------------------------------------------------------
  // TC-INT-10H: Negative, fractional, and nonnumeric prices rejected
  // --------------------------------------------------------------------------
  test("TC-INT-10H: negative and fractional prices in database are rejected by pricing engine", async () => {
    await seedCategory("synth-int-cat-main");

    // Negative product price inserted directly via driver (bypassing Mongoose schema validator)
    await ProductModel.collection.deleteOne({ slug: "synth-int-p10h-neg" });
    await ProductModel.collection.insertOne({
      slug: "synth-int-p10h-neg",
      nameSv: "Negativ Pizza",
      descriptionSv: "Test",
      image: APPROVED_IMAGE,
      active: true,
      sortOrder: 10,
      categorySlug: "synth-int-cat-main",
      ingredients: ["Ost"],
      allergens: [],
      variants: [{ id: "normal", label: "Normal", priceSek: -50, available: true, priceStatus: "confirmed" }],
      modifierSlugs: [],
      glutenFreeOption: false,
    });

    await assert.rejects(
      async () =>
        createOrder(
          makeOrderBody({
            items: [makeItem("synth-int-p10h-neg", "normal")],
            expectedTotalSek: 100,
          }),
          NOW,
          { tokenSecret: TEST_SECRET },
        ),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "price_unconfirmed"));
        return true;
      },
    );

    // Fractional product price inserted directly
    await ProductModel.collection.deleteOne({ slug: "synth-int-p10h-frac" });
    await ProductModel.collection.insertOne({
      slug: "synth-int-p10h-frac",
      nameSv: "Bråkdel Pizza",
      descriptionSv: "Test",
      image: APPROVED_IMAGE,
      active: true,
      sortOrder: 10,
      categorySlug: "synth-int-cat-main",
      ingredients: ["Ost"],
      allergens: [],
      variants: [{ id: "normal", label: "Normal", priceSek: 110.5, available: true, priceStatus: "confirmed" }],
      modifierSlugs: [],
      glutenFreeOption: false,
    });

    await assert.rejects(
      async () =>
        createOrder(
          makeOrderBody({
            items: [makeItem("synth-int-p10h-frac", "normal")],
            expectedTotalSek: 111,
          }),
          NOW,
          { tokenSecret: TEST_SECRET },
        ),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "price_unconfirmed"));
        return true;
      },
    );

    // Fractional modifier price inserted directly
    await seedProduct("synth-int-p10h-mod", {
      variants: [{ id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" }],
      modifierSlugs: ["synth-int-mod-frac"],
    });
    await ModifierModel.collection.deleteOne({ slug: "synth-int-mod-frac" });
    await ModifierModel.collection.insertOne({
      slug: "synth-int-mod-frac",
      labelSv: "Bråkdel Extra",
      groupSlug: "extras",
      priceByVariantSek: { normal: 15.5 },
      maxQty: 3,
      compatibleCategories: ["synth-int-cat-main"],
      active: true,
      priceStatus: "confirmed",
    });

    await assert.rejects(
      async () =>
        createOrder(
          makeOrderBody({
            items: [
              makeItem("synth-int-p10h-mod", "normal", {
                modifiers: [{ slug: "synth-int-mod-frac", quantity: 1 }],
              }),
            ],
            expectedTotalSek: 116,
          }),
          NOW,
          { tokenSecret: TEST_SECRET },
        ),
      (err: unknown) => {
        assert.ok(err instanceof OrderError);
        assert.equal(err.code, "pricing");
        assert.equal(err.status, 422);
        const issues = err.details as { code: string }[];
        assert.ok(issues.some((i) => i.code === "modifier_price_unconfirmed"));
        return true;
      },
    );
  });
});
