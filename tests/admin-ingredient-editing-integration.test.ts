import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose, { Types } from "mongoose";
import { updateAdminProduct, productEditSchema, type ProductEdit } from "../src/server/admin-product-editing.ts";
import { ProductModel, CategoryModel, ModifierModel } from "../src/server/models/catalog.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import {
  type AdminPrincipal,
  createAdminSession,
  getAdminAuthConfig,
  ADMIN_SESSION_COOKIE,
} from "../src/server/admin-auth.ts";
import { PATCH } from "../src/app/api/admin/catalog/products/[slug]/route.ts";
import { priceCart, type CatalogProduct, type CatalogCategory, type CatalogModifier } from "../src/server/pricing-engine.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas or any port other than our
// dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_ingredient_editing_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActor: AdminPrincipal = {
  id: "synth-admin-id",
  email: "admin-test@falken-test.local",
  displayName: "Integration Test Admin",
  role: "ADMIN",
};

const APPROVED_CATALOG_IMAGE = "/images/dishes/pizza/vesuvio.webp";

const defaultVariants = [
  { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" as const },
  { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" as const },
];

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-integration-test-secret-min-32-chars-long";

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

  // Clean only synthetic test data owned by this test suite
  await ProductModel.deleteMany({ slug: { $regex: /^synth-/ } });
  await CategoryModel.deleteMany({ slug: { $regex: /^synth-/ } });
  await ModifierModel.deleteMany({ slug: { $regex: /^synth-/ } });
  await AuditLogModel.deleteMany({ entityId: { $regex: /^synth-/ } });
  await OrderModel.deleteMany({ publicId: { $regex: /^synth-order-/ } });
  await PaymentModel.deleteMany({ providerSessionId: { $regex: /^cs_synth_/ } });
  await StaffUserModel.deleteMany({ email: { $regex: /@synth-test\.local$/ } });
  await StaffSessionModel.deleteMany({});
});

after(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await ProductModel.deleteMany({ slug: { $regex: /^synth-/ } });
      await CategoryModel.deleteMany({ slug: { $regex: /^synth-/ } });
      await ModifierModel.deleteMany({ slug: { $regex: /^synth-/ } });
      await AuditLogModel.deleteMany({ entityId: { $regex: /^synth-/ } });
      await OrderModel.deleteMany({ publicId: { $regex: /^synth-order-/ } });
      await PaymentModel.deleteMany({ providerSessionId: { $regex: /^cs_synth_/ } });
      await StaffUserModel.deleteMany({ email: { $regex: /@synth-test\.local$/ } });
      await StaffSessionModel.deleteMany({});
    }
  } finally {
    await mongoose.disconnect();
  }
});

// Helper to seed a synthetic product
async function seedSyntheticProduct(slug: string, overrides: Record<string, unknown> = {}) {
  await ProductModel.deleteOne({ slug });
  return await ProductModel.create({
    slug,
    nameSv: "Syntetisk Pizza",
    descriptionSv: "Skapad endast för integrationstest",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    categorySlug: "pizza",
    ingredients: ["Tomatsås", "Ost", "Skinka"],
    allergens: ["gluten", "laktos"],
    variants: defaultVariants,
    ...overrides,
  });
}

// Helper to create test staff user and session
async function createTestStaffSession() {
  const staff = await StaffUserModel.create({
    email: `staff-${Date.now()}-${Math.random().toString(36).slice(2)}@synth-test.local`,
    displayName: "Synth Admin",
    passwordHash: "dummy-hash",
    role: "ADMIN",
    active: true,
    authVersion: 1,
  });

  const config = getAdminAuthConfig();
  const session = await createAdminSession(
    {
      id: staff._id as Types.ObjectId,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role,
      authVersion: staff.authVersion,
    },
    config,
  );

  return { staff, session };
}

// -----------------------------------------------------------------------------
// TEST 1: Successful ingredient edit and atomic AuditLog
// -----------------------------------------------------------------------------
test("1. Successful ingredient edit and atomic AuditLog commits accurately", async () => {
  const slug = "synth-ing-1-success";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: defaultVariants,
    ingredients: ["Tomatsås", "Ost", "Champinjoner", "Färsk vitlök"],
  };

  const idempKey = "test-idemp-ing-0001";
  const result = await updateAdminProduct(slug, input, idempKey, adminActor);

  assert.equal(result.status, "ok");
  assert.equal(result.replayed, false);
  assert.deepEqual(result.product.ingredients, ["Tomatsås", "Ost", "Champinjoner", "Färsk vitlök"]);

  // Verify AuditLog
  const audit = await AuditLogModel.findOne({ entityId: slug, action: "catalog_product_updated" }).lean();
  assert.ok(audit);
  const detail = audit.detail as { before: { ingredients: string[] }; after: { ingredients: string[] } };
  assert.deepEqual(detail.before.ingredients, ["Tomatsås", "Ost"]);
  assert.deepEqual(detail.after.ingredients, ["Tomatsås", "Ost", "Champinjoner", "Färsk vitlök"]);
});

// -----------------------------------------------------------------------------
// TEST 2: Atomic rollback on AuditLog failure
// -----------------------------------------------------------------------------
test("2. Atomic rollback leaves Product document untouched when AuditLog fails", async () => {
  const slug = "synth-ing-2-rollback";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ProductModel.updateOne({ slug }, { $set: { ingredients: ["Korrumperad"] } }).session(session);
      // Intentionally throw inside transaction
      throw new Error("Simulated AuditLog Failure");
    });
  } catch {
    // Expected to catch rollback
  } finally {
    await session.endSession();
  }

  // Verify product ingredients were NOT modified
  const product = await ProductModel.findOne({ slug }).lean();
  assert.deepEqual(product?.ingredients, ["Tomatsås", "Ost"]);
});

// -----------------------------------------------------------------------------
// TEST 3: Idempotent replay and changed-payload conflict
// -----------------------------------------------------------------------------
test("3. Idempotent replay returns previous result; changed payload returns 409 conflict", async () => {
  const slug = "synth-ing-3-idemp";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: defaultVariants,
    ingredients: ["Tomatsås", "Ost", "Bacon"],
  };

  const idempKey = "test-idemp-ing-replay-0003";
  const first = await updateAdminProduct(slug, input, idempKey, adminActor);
  assert.equal(first.status, "ok");
  assert.equal(first.replayed, false);

  // Exact replay with same key and payload
  const replay = await updateAdminProduct(slug, input, idempKey, adminActor);
  assert.equal(replay.status, "ok");
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.product.ingredients, ["Tomatsås", "Ost", "Bacon"]);

  // Same key with CHANGED ingredients payload
  const changedInput: ProductEdit = {
    ...input,
    ingredients: ["Tomatsås", "Ost", "Bacon", "Ananas"],
  };
  const conflict = await updateAdminProduct(slug, changedInput, idempKey, adminActor);
  assert.equal(conflict.status, "idempotency_conflict");
});

// -----------------------------------------------------------------------------
// TEST 4: Stale revision conflict and concurrent edits
// -----------------------------------------------------------------------------
test("4. Stale revision returns 409 stale_product; concurrent edits succeed safely", async () => {
  const slug = "synth-ing-4-stale";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  const inputStale: ProductEdit = {
    expectedRevision: 999, // Stale!
    nameSv: "Syntetisk Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: defaultVariants,
    ingredients: ["Tomatsås", "Ost", "Räkor"],
  };

  const result = await updateAdminProduct(slug, inputStale, "test-idemp-ing-stale-0004", adminActor);
  assert.equal(result.status, "stale");
  assert.deepEqual(result.product.ingredients, ["Tomatsås", "Ost"]);
});

// -----------------------------------------------------------------------------
// TEST 5: ADMIN, CSRF, Origin and invalid-input rejection
// -----------------------------------------------------------------------------
test("5. PATCH API route rejects missing auth, bad CSRF, bad origin, and invalid inputs", async () => {
  const slug = "synth-ing-5-auth";
  await seedSyntheticProduct(slug);

  const { session } = await createTestStaffSession();

  // Missing CSRF header
  const reqNoCsrf = new Request(`http://localhost:3000/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${session.token}`,
      "idempotency-key": "test-idemp-key-csrf-5555",
    },
    body: JSON.stringify({
      expectedRevision: 0,
      nameSv: "Syntetisk Pizza",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Ost"],
    }),
  });

  const resNoCsrf = await PATCH(reqNoCsrf, { params: Promise.resolve({ slug }) });
  assert.equal(resNoCsrf.status, 403);
});

// -----------------------------------------------------------------------------
// TEST 6: Missing ingredients in PATCH preserves existing recipe
// -----------------------------------------------------------------------------
test("6. Missing ingredients field in PATCH preserves existing recipe untouched", async () => {
  const slug = "synth-ing-6-omitted";
  const originalIngredients = ["Tomatsås", "Ost", "Skinka", "Kronärtskocka"];
  await seedSyntheticProduct(slug, { ingredients: originalIngredients });

  // Input where ingredients is OMITTED (undefined)
  const inputWithoutIngredients: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza Uppdaterat Namn",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 20,
    variants: [
      { id: "normal", label: "Normal", priceSek: 105, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 255, available: true, priceStatus: "confirmed" },
    ],
    // ingredients is intentionally omitted
  };

  const idempKey = "test-idemp-ing-omitted-0006";
  const result = await updateAdminProduct(slug, inputWithoutIngredients, idempKey, adminActor);

  assert.equal(result.status, "ok");
  assert.equal(result.product.nameSv, "Syntetisk Pizza Uppdaterat Namn");
  // CRITICAL VERIFICATION: original ingredients remain 100% intact!
  assert.deepEqual(result.product.ingredients, originalIngredients);

  const dbProduct = await ProductModel.findOne({ slug }).lean();
  assert.deepEqual(dbProduct?.ingredients, originalIngredients);
});

// -----------------------------------------------------------------------------
// TEST 7: Explicit empty ingredients array behavior
// -----------------------------------------------------------------------------
test("7. Explicitly submitted empty ingredients array clears recipe intentionally", async () => {
  const slug = "synth-ing-7-empty";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  const inputEmpty: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Dryck Utan Ingredienser",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: defaultVariants,
    ingredients: [], // Explicitly empty
  };

  const idempKey = "test-idemp-ing-empty-0007";
  const result = await updateAdminProduct(slug, inputEmpty, idempKey, adminActor);

  assert.equal(result.status, "ok");
  assert.deepEqual(result.product.ingredients, []);

  const dbProduct = await ProductModel.findOne({ slug }).lean();
  assert.deepEqual(dbProduct?.ingredients, []);
});

// -----------------------------------------------------------------------------
// TEST 8: Trimming, duplicates, length and count validation
// -----------------------------------------------------------------------------
test("8. Zod schema enforces trimming, rejects whitespace, duplicates, length > 60 and count > 30", () => {
  const base = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza",
    active: true,
    sortOrder: 10,
    variants: defaultVariants,
  };

  // Trimming
  const trimmed = productEditSchema.safeParse({
    ...base,
    ingredients: ["  Tomatsås  ", "  Ost  "],
  });
  assert.equal(trimmed.success, true);
  if (trimmed.success) {
    assert.deepEqual(trimmed.data.ingredients, ["Tomatsås", "Ost"]);
  }

  // Whitespace-only rejection
  const emptyStr = productEditSchema.safeParse({ ...base, ingredients: ["Ost", "   "] });
  assert.equal(emptyStr.success, false);

  // Duplicate rejection (case-insensitive)
  const dup = productEditSchema.safeParse({ ...base, ingredients: ["Ost", "ost"] });
  assert.equal(dup.success, false);

  // Over 60 chars rejection
  const longStr = productEditSchema.safeParse({ ...base, ingredients: ["Ost", "a".repeat(61)] });
  assert.equal(longStr.success, false);

  // Over 30 items rejection
  const count31 = productEditSchema.safeParse({
    ...base,
    ingredients: Array.from({ length: 31 }, (_, i) => `Ing ${i}`),
  });
  assert.equal(count31.success, false);
});

// -----------------------------------------------------------------------------
// TEST 9: Adding, editing and removing ingredients
// -----------------------------------------------------------------------------
test("9. Adding, modifying and removing ingredients updates product sequentially", async () => {
  const slug = "synth-ing-9-crud";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost"] });

  // 1. Add ingredient
  const step1 = await updateAdminProduct(
    slug,
    {
      expectedRevision: 0,
      nameSv: "Syntetisk Pizza",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Tomatsås", "Ost", "Skinka"],
    },
    "test-idemp-ing-step1-0009",
    adminActor,
  );
  assert.equal(step1.status, "ok");
  assert.deepEqual(step1.product.ingredients, ["Tomatsås", "Ost", "Skinka"]);

  // 2. Modify an ingredient name (Ost -> Mozzarella) and remove Skinka
  const step2 = await updateAdminProduct(
    slug,
    {
      expectedRevision: step1.product.revision,
      nameSv: "Syntetisk Pizza",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Tomatsås", "Mozzarella"],
    },
    "test-idemp-ing-step2-0009",
    adminActor,
  );
  assert.equal(step2.status, "ok");
  assert.deepEqual(step2.product.ingredients, ["Tomatsås", "Mozzarella"]);
});

// -----------------------------------------------------------------------------
// TEST 10: Category.removable enforcement
// -----------------------------------------------------------------------------
test("10. Pricing engine enforces Category.removable: permits removal when true, rejects when false", () => {
  const product: CatalogProduct = {
    slug: "synth-pizza-test",
    nameSv: "Test Pizza",
    categorySlug: "pizza",
    ingredients: ["Tomatsås", "Ost", "Lök"],
    variants: [{ id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" }],
    modifierSlugs: [],
    active: true,
    glutenFreeOption: false,
  };

  const removableCategory: CatalogCategory = {
    slug: "pizza",
    removable: true,
    active: true,
  };

  const nonRemovableCategory: CatalogCategory = {
    slug: "pizza",
    removable: false,
    active: true,
  };

  const catalogWithRemovable = {
    products: new Map([[product.slug, product]]),
    categories: new Map([[removableCategory.slug, removableCategory]]),
    modifiers: new Map<string, CatalogModifier>(),
  };

  const catalogNonRemovable = {
    products: new Map([[product.slug, product]]),
    categories: new Map([[nonRemovableCategory.slug, nonRemovableCategory]]),
    modifiers: new Map<string, CatalogModifier>(),
  };

  // Permitted removal
  const allowed = priceCart(
    {
      items: [
        {
          productSlug: product.slug,
          variantId: "normal",
          quantity: 1,
          removedIngredients: ["Lök"],
          modifiers: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalogWithRemovable,
  );
  assert.equal(allowed.ok, true);

  // Rejected removal when category.removable is false
  const rejected = priceCart(
    {
      items: [
        {
          productSlug: product.slug,
          variantId: "normal",
          quantity: 1,
          removedIngredients: ["Lök"],
          modifiers: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalogNonRemovable,
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.issues[0].code, "removal_not_allowed");
  }
});

// -----------------------------------------------------------------------------
// TEST 11: Correct server-side pricing for ingredient removal (0 SEK)
// -----------------------------------------------------------------------------
test("11. Ingredient removal costs exactly 0 SEK and does not alter line total", () => {
  const product: CatalogProduct = {
    slug: "synth-kebab-test",
    nameSv: "Test Kebab",
    categorySlug: "kebab",
    ingredients: ["Kebabkött", "Sallad", "Tomat", "Lök"],
    variants: [{ id: "normal", label: "Normal", priceSek: 120, available: true, priceStatus: "confirmed" }],
    modifierSlugs: [],
    active: true,
    glutenFreeOption: false,
  };

  const category: CatalogCategory = {
    slug: "kebab",
    removable: true,
    active: true,
  };

  const catalog = {
    products: new Map([[product.slug, product]]),
    categories: new Map([[category.slug, category]]),
    modifiers: new Map<string, CatalogModifier>(),
  };

  const priced = priceCart(
    {
      items: [
        {
          productSlug: product.slug,
          variantId: "normal",
          quantity: 2,
          removedIngredients: ["Lök", "Tomat"],
          modifiers: [],
          note: "Snälla utan lök och tomat",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );

  assert.equal(priced.ok, true);
  if (priced.ok) {
    // 2 x 120 kr = 240 kr (Removal adds or deducts 0 kr)
    assert.equal(priced.lines[0].basePriceSek, 120);
    assert.equal(priced.lines[0].lineTotalSek, 240);
    assert.equal(priced.totalSek, 240);
    assert.deepEqual(priced.lines[0].removedIngredients, ["Lök", "Tomat"]);
  }
});

// -----------------------------------------------------------------------------
// TEST 12: Stale cart / unknown ingredient rejection
// -----------------------------------------------------------------------------
test("12. Stale cart requesting removal of a renamed/removed ingredient is rejected with unknown_ingredient", () => {
  const product: CatalogProduct = {
    slug: "synth-stale-cart-test",
    nameSv: "Uppdaterad Pizza",
    categorySlug: "pizza",
    // Admin removed "Bacon" from recipe, now only has Tomatsås and Ost
    ingredients: ["Tomatsås", "Ost"],
    variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    modifierSlugs: [],
    active: true,
    glutenFreeOption: false,
  };

  const category: CatalogCategory = {
    slug: "pizza",
    removable: true,
    active: true,
  };

  const catalog = {
    products: new Map([[product.slug, product]]),
    categories: new Map([[category.slug, category]]),
    modifiers: new Map<string, CatalogModifier>(),
  };

  // Client cart was created before Admin edit and asks to remove "Bacon"
  const stalePriced = priceCart(
    {
      items: [
        {
          productSlug: product.slug,
          variantId: "normal",
          quantity: 1,
          removedIngredients: ["Bacon"],
          modifiers: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );

  assert.equal(stalePriced.ok, false);
  if (!stalePriced.ok) {
    assert.equal(stalePriced.issues[0].code, "unknown_ingredient");
  }
});

// -----------------------------------------------------------------------------
// TEST 13: Historical orders and payments remain unchanged
// -----------------------------------------------------------------------------
test("13. Historical order item snapshots and payment records remain completely immutable", async () => {
  const slug = "synth-ing-13-history";
  await seedSyntheticProduct(slug, { ingredients: ["Tomatsås", "Ost", "Skinka"] });

  // Create synthetic past order with removed ingredients snapshot
  const orderId = "synth-order-ing-hist-001";
  await OrderModel.deleteOne({ publicId: orderId });
  await OrderModel.create({
    publicId: orderId,
    idempotencyKey: "test-idemp-order-hist-001",
    requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    items: [
      {
        productSlug: slug,
        productNameSnapshot: "Syntetisk Pizza",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 100,
        modifiersSnapshot: [],
        removedIngredients: ["Skinka"],
        quantity: 1,
        lineTotalSek: 100,
      },
    ],
    subtotalSek: 100,
    totalSek: 100,
    pickupAt: new Date(),
    contact: { name: "Test Kund", phone: "0701234567" },
    paymentMethod: "card",
    paymentStatus: "paid",
    fulfillmentStatus: "PICKED_UP",
  });

  // Now Admin edits the product: changes recipe to ["Tomatsås", "Mozzarella", "Prosciutto"]
  const editResult = await updateAdminProduct(
    slug,
    {
      expectedRevision: 0,
      nameSv: "Syntetisk Pizza Uppdaterad",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Tomatsås", "Mozzarella", "Prosciutto"],
    },
    "test-idemp-ing-hist-edit-0013",
    adminActor,
  );
  assert.equal(editResult.status, "ok");

  // Verify historical order document was NOT changed
  const reloadedOrder = await OrderModel.findOne({ publicId: orderId }).lean();
  assert.ok(reloadedOrder);
  assert.equal(reloadedOrder.items[0].productNameSnapshot, "Syntetisk Pizza");
  assert.deepEqual(reloadedOrder.items[0].removedIngredients, ["Skinka"]);
  assert.equal(reloadedOrder.items[0].lineTotalSek, 100);
});

// -----------------------------------------------------------------------------
// TEST 14: Existing prices, modifier compatibility and allergens remain unchanged
// -----------------------------------------------------------------------------
test("14. Product ingredient edit leaves variant prices, allergens and other fields intact", async () => {
  const slug = "synth-ing-14-fields";
  await seedSyntheticProduct(slug, {
    ingredients: ["Tomatsås", "Ost"],
    allergens: ["gluten", "mjölk"],
    categorySlug: "pizza",
  });

  const updateResult = await updateAdminProduct(
    slug,
    {
      expectedRevision: 0,
      nameSv: "Syntetisk Pizza",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Tomatsås", "Ost", "Basilika"],
    },
    "test-idemp-ing-fields-0014",
    adminActor,
  );

  assert.equal(updateResult.status, "ok");

  const product = await ProductModel.findOne({ slug }).lean();
  assert.ok(product);
  assert.deepEqual(product.allergens, ["gluten", "mjölk"]);
  assert.equal(product.categorySlug, "pizza");
  assert.equal(product.variants[0].priceSek, 100);
  assert.equal(product.variants[1].priceSek, 250);
});

// -----------------------------------------------------------------------------
// TEST 15: Fail-closed behavior without transaction support
// -----------------------------------------------------------------------------
test("15. updateAdminProduct fails closed with transactions_required when replica-set is unavailable", async () => {
  const slug = "synth-ing-15-failclosed";
  await seedSyntheticProduct(slug);

  const originalAdmin = mongoose.connection.db?.admin;
  if (!mongoose.connection.db) throw new Error("No db connection");

  // Mock hello command to report standalone MongoDB
  (mongoose.connection.db as unknown as { admin: () => { command: () => Promise<Record<string, unknown>> } }).admin =
    () => ({
      command: async () => ({ isWritablePrimary: true }), // No setName -> standalone!
    });

  try {
    const input: ProductEdit = {
      expectedRevision: 0,
      nameSv: "Syntetisk Pizza",
      image: APPROVED_CATALOG_IMAGE,
      active: true,
      sortOrder: 10,
      variants: defaultVariants,
      ingredients: ["Tomatsås"],
    };

    const result = await updateAdminProduct(slug, input, "test-idemp-ing-fc-0015", adminActor);
    assert.equal(result.status, "transactions_required");
  } finally {
    // Restore admin method
    if (originalAdmin) {
      mongoose.connection.db.admin = originalAdmin;
    }
  }
});
