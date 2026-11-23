import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose, { Types } from "mongoose";
import {
  updateAdminCategory,
  type CategoryEdit,
} from "../src/server/admin-category-editing.ts";
import { CategoryModel, ProductModel, ModifierModel } from "../src/server/models/catalog.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import {
  type AdminPrincipal,
  createAdminSession,
  getAdminAuthConfig,
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
} from "../src/server/admin-auth.ts";
import { PATCH } from "../src/app/api/admin/catalog/categories/[slug]/route.ts";
import { getPublicMenu, loadCatalogForCart } from "../src/server/catalog-repo.ts";
import { priceCart } from "../src/server/pricing-engine.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas, VeloRider, or any port other
// than our dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_category_editing_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActorId = new Types.ObjectId().toString();

const adminActor: AdminPrincipal = {
  id: adminActorId,
  email: "admin-cat@falken-test.local",
  displayName: "Category Integration Test Admin",
  role: "ADMIN",
};

const TEST_SLUG = "synth-cat-pizza";

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-category-test-secret-min-32-chars-long";

  await mongoose.disconnect();
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });

  const port = mongoose.connection.port;
  const dbName = mongoose.connection.name;

  if (port !== TEST_MONGODB_PORT) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Expected port ${TEST_MONGODB_PORT}, but connected to port ${port}! ABORTING.`);
  }

  if (dbName !== TEST_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED: Expected dbName ${TEST_DB_NAME}, but connected to ${dbName}! ABORTING.`);
  }

  // Clean up any old synthetic test data
  await cleanTestData();
});

after(async () => {
  await cleanTestData();
  await mongoose.disconnect();
});

async function cleanTestData() {
  await CategoryModel.deleteMany({ slug: /^synth-cat-/ });
  await ProductModel.deleteMany({ slug: /^synth-prod-/ });
  await ModifierModel.deleteMany({ slug: /^synth-mod-/ });
  await AuditLogModel.deleteMany({
    $or: [{ entityId: /^synth-cat-/ }, { deduplicationKey: /^category-edit:/ }],
  });
  await OrderModel.deleteMany({ publicId: /^synth-order-/ });
  await PaymentModel.deleteMany({ providerSessionId: /^cs_synth_cat_/ });
  await StaffUserModel.deleteMany({ email: /@falken-test\.local$/ });
  await StaffSessionModel.deleteMany({});
}

async function seedCategory(overrides: Partial<Parameters<typeof CategoryModel.create>[0]> = {}) {
  await CategoryModel.deleteMany({ slug: TEST_SLUG });
  return await CategoryModel.create({
    slug: TEST_SLUG,
    nameSv: "Syntetisk Pizza",
    blurbSv: "Goda vedugnspizzor",
    removable: true,
    sortOrder: 10,
    active: true,
    ...overrides,
  });
}

async function createTestStaff() {
  const user = await StaffUserModel.create({
    email: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@falken-test.local`,
    displayName: "Admin Test User",
    passwordHash: "dummy-hash",
    role: "ADMIN",
    active: true,
    authVersion: 1,
  });
  const config = getAdminAuthConfig();
  const session = await createAdminSession(
    {
      id: user._id as Types.ObjectId,
      email: user.email,
      displayName: user.displayName,
      role: "ADMIN",
      authVersion: user.authVersion,
    },
    config,
  );
  return { user, session };
}

// ------------------------------------------------------------------------------
// TEST 1: Successful Category + AuditLog atomic transaction
// ------------------------------------------------------------------------------
test("1. Successful Category + AuditLog atomic transaction", async () => {
  const cat = await seedCategory();
  const input: CategoryEdit = {
    expectedRevision: cat.__v ?? 0,
    nameSv: "Uppdaterad Pizza",
    blurbSv: "Ny och bättre beskrivning",
    sortOrder: 15,
    removable: false,
    active: true,
  };

  const idKey = "synth-key-success-1234567890";
  const result = await updateAdminCategory(TEST_SLUG, input, idKey, adminActor);

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.replayed, false);
    assert.equal(result.category.nameSv, "Uppdaterad Pizza");
    assert.equal(result.category.blurbSv, "Ny och bättre beskrivning");
    assert.equal(result.category.sortOrder, 15);
    assert.equal(result.category.removable, false);
    assert.equal(result.category.active, true);
    assert.equal(result.category.revision, 1);
  }

  // Verify AuditLog record
  const audit = await AuditLogModel.findOne({ entityId: TEST_SLUG, action: "catalog_category_updated" }).lean();
  assert.ok(audit);
  assert.equal(audit.actorId, adminActor.id);
  assert.equal(audit.actorType, "staff");
  const detail = audit.detail as { before?: { nameSv?: string }; after?: { nameSv?: string } };
  assert.equal(detail?.before?.nameSv, "Syntetisk Pizza");
  assert.equal(detail?.after?.nameSv, "Uppdaterad Pizza");
});

// ------------------------------------------------------------------------------
// TEST 2: Rollback when AuditLog fails
// ------------------------------------------------------------------------------
test("2. Atomic Rollback when AuditLog creation fails", async () => {
  const cat = await seedCategory();
  const originalVersion = cat.__v ?? 0;

  const originalCreate = AuditLogModel.create;
  // Force AuditLogModel.create to fail inside transaction
  AuditLogModel.create = (async () => {
    throw new Error("Simulated database failure during audit log insertion");
  }) as unknown as typeof AuditLogModel.create;

  const input: CategoryEdit = {
    expectedRevision: originalVersion,
    nameSv: "Ska Inte Sparas",
    blurbSv: "Detta ska rullas tillbaka",
    sortOrder: 99,
    removable: false,
    active: false,
  };

  try {
    await assert.rejects(
      async () => {
        await updateAdminCategory(TEST_SLUG, input, "synth-key-rollback-1234567890", adminActor);
      },
      { message: /Simulated database failure/ },
    );

    // Verify category remains in pristine condition
    const unchanged = await CategoryModel.findOne({ slug: TEST_SLUG }).lean();
    assert.ok(unchanged);
    assert.equal(unchanged.nameSv, "Syntetisk Pizza");
    assert.equal(unchanged.sortOrder, 10);
    assert.equal(unchanged.active, true);
    assert.equal(unchanged.__v ?? 0, originalVersion);
  } finally {
    AuditLogModel.create = originalCreate;
  }
});

// ------------------------------------------------------------------------------
// TEST 3: Duplicate idempotency-key replay
// ------------------------------------------------------------------------------
test("3. Duplicate idempotency-key replay returns existing result without new writes", async () => {
  const cat = await seedCategory();
  const input: CategoryEdit = {
    expectedRevision: cat.__v ?? 0,
    nameSv: "Replay Test",
    blurbSv: "Testar replay",
    sortOrder: 20,
    removable: true,
    active: true,
  };

  const idKey = "synth-key-replay-1234567890";
  const first = await updateAdminCategory(TEST_SLUG, input, idKey, adminActor);
  assert.equal(first.status, "ok");
  if (first.status === "ok") assert.equal(first.replayed, false);

  const auditCountBefore = await AuditLogModel.countDocuments({ entityId: TEST_SLUG });

  // Replay with exact same payload and key
  const second = await updateAdminCategory(TEST_SLUG, input, idKey, adminActor);
  assert.equal(second.status, "ok");
  if (second.status === "ok") {
    assert.equal(second.replayed, true);
    assert.equal(second.category.nameSv, "Replay Test");
  }

  const auditCountAfter = await AuditLogModel.countDocuments({ entityId: TEST_SLUG });
  assert.equal(auditCountBefore, auditCountAfter, "No new AuditLog should be written on replay");
});

// ------------------------------------------------------------------------------
// TEST 4: Same key with changed payload rejection
// ------------------------------------------------------------------------------
test("4. Same idempotency key with changed payload returns conflict", async () => {
  const cat = await seedCategory();
  const input: CategoryEdit = {
    expectedRevision: cat.__v ?? 0,
    nameSv: "Original Namn",
    blurbSv: "Beskrivning 1",
    sortOrder: 20,
    removable: true,
    active: true,
  };

  const idKey = "synth-key-conflict-1234567890";
  const first = await updateAdminCategory(TEST_SLUG, input, idKey, adminActor);
  assert.equal(first.status, "ok");

  // Attempt to use the same key with different payload
  const altered: CategoryEdit = {
    ...input,
    nameSv: "Förändrat Namn Som Ska Konflikta",
  };

  const second = await updateAdminCategory(TEST_SLUG, altered, idKey, adminActor);
  assert.equal(second.status, "idempotency_conflict");
});

// ------------------------------------------------------------------------------
// TEST 5: Concurrent updates and expectedRevision conflicts
// ------------------------------------------------------------------------------
test("5. Stale expectedRevision returns conflict with latest category state", async () => {
  const cat = await seedCategory();
  // Valid update to bump revision to 1
  const update1 = await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: cat.__v ?? 0,
      nameSv: "Första Uppdateringen",
      blurbSv: "Bumpar version",
      sortOrder: 25,
      removable: true,
      active: true,
    },
    "synth-key-concurrent-1-1234567890",
    adminActor,
  );
  assert.equal(update1.status, "ok");

  // Another client attempting to update using the stale version 0
  const staleAttempt = await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: 0, // stale!
      nameSv: "Stale Uppdatering",
      blurbSv: "Borde nekas",
      sortOrder: 30,
      removable: true,
      active: true,
    },
    "synth-key-concurrent-2-1234567890",
    adminActor,
  );

  assert.equal(staleAttempt.status, "stale");
  if (staleAttempt.status === "stale") {
    assert.equal(staleAttempt.category.nameSv, "Första Uppdateringen");
    assert.equal(staleAttempt.category.revision, 1);
  }
});

// ------------------------------------------------------------------------------
// TEST 6: ADMIN-only authorization, CSRF and Origin protection via API
// ------------------------------------------------------------------------------
test("6. ADMIN authorization, CSRF, and same-origin protections on PATCH", async () => {
  const cat = await seedCategory();

  const validPayload = {
    expectedRevision: cat.__v ?? 0,
    nameSv: "API Test Pizza",
    blurbSv: "Test via PATCH endpoint",
    sortOrder: 12,
    removable: true,
    active: true,
  };

  // Case A: Unauthenticated request -> 401
  const unauthReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-unauth-1234567890",
    },
    body: JSON.stringify(validPayload),
  });
  const unauthRes = await PATCH(unauthReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(unauthRes.status, 401);

  // Create real test session
  const { session: adminSession } = await createTestStaff();

  // Case B: Missing CSRF token header -> 403
  const noCsrfReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-nocsrf-1234567890",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(validPayload),
  });
  const noCsrfRes = await PATCH(noCsrfReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(noCsrfRes.status, 403);

  // Case C: Invalid / Mismatched CSRF token -> 403
  const invalidCsrfReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-csrf-1234567890",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": "completely-invalid-csrf-token",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(validPayload),
  });
  const invalidCsrfRes = await PATCH(invalidCsrfReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(invalidCsrfRes.status, 403);

  // Case D: Invalid / missing idempotency key -> 400
  const invalidKeyReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "short", // too short, < 16 chars
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(validPayload),
  });
  const invalidKeyRes = await PATCH(invalidKeyReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(invalidKeyRes.status, 400);

  // Case D: Valid ADMIN + Valid CSRF + Valid Origin -> 200 OK
  const validAdminReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-success-1234567890",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(validPayload),
  });
  const validAdminRes = await PATCH(validAdminReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(validAdminRes.status, 200);
  const resBody = (await validAdminRes.json()) as { category: { nameSv: string } };
  assert.equal(resBody.category.nameSv, "API Test Pizza");
});

// ------------------------------------------------------------------------------
// TEST 7: Invalid input and immutable slug rejection
// ------------------------------------------------------------------------------
test("7. Schema rejects empty names and attempt to alter immutable slug", async () => {
  const cat = await seedCategory();
  const { session: adminSession } = await createTestStaff();

  // Empty name
  const emptyNameReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-invalid-1-1234567890",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      expectedRevision: cat.__v ?? 0,
      nameSv: "   ",
      sortOrder: 1,
      removable: true,
      active: true,
    }),
  });
  const emptyRes = await PATCH(emptyNameReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(emptyRes.status, 422);

  // Attempt to pass slug in body
  const withSlugReq = new Request(`http://localhost:3000/api/admin/catalog/categories/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "synth-api-key-invalid-2-1234567890",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
    },
    body: JSON.stringify({
      expectedRevision: cat.__v ?? 0,
      nameSv: "Giltigt Namn",
      slug: "altered-slug",
      sortOrder: 1,
      removable: true,
      active: true,
    }),
  });
  const withSlugRes = await PATCH(withSlugReq, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(withSlugRes.status, 422);
});

// ------------------------------------------------------------------------------
// TEST 8: Category activation and deactivation
// ------------------------------------------------------------------------------
test("8. Category deactivation and re-activation persists correctly", async () => {
  const cat = await seedCategory({ active: true });

  // Deactivate
  const deactResult = await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: cat.__v ?? 0,
      nameSv: cat.nameSv,
      blurbSv: cat.blurbSv,
      sortOrder: cat.sortOrder,
      removable: cat.removable,
      active: false,
    },
    "synth-key-deact-1234567890",
    adminActor,
  );
  assert.equal(deactResult.status, "ok");
  if (deactResult.status === "ok") assert.equal(deactResult.category.active, false);

  const inDbDeact = await CategoryModel.findOne({ slug: TEST_SLUG }).lean();
  assert.equal(inDbDeact?.active, false);

  // Re-activate
  const reactResult = await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: 1,
      nameSv: cat.nameSv,
      blurbSv: cat.blurbSv,
      sortOrder: cat.sortOrder,
      removable: cat.removable,
      active: true,
    },
    "synth-key-react-1234567890",
    adminActor,
  );
  assert.equal(reactResult.status, "ok");
  if (reactResult.status === "ok") assert.equal(reactResult.category.active, true);

  const inDbReact = await CategoryModel.findOne({ slug: TEST_SLUG }).lean();
  assert.equal(inDbReact?.active, true);
});

// ------------------------------------------------------------------------------
// TEST 9: Public menu & server pricing behavior for inactive categories & removable flag
// ------------------------------------------------------------------------------
test("9. Inactive category is filtered from getPublicMenu and priceCart rejects orders", async () => {
  const cat = await seedCategory({ active: true, removable: true });
  const prodSlug = "synth-prod-test-pizza";

  await ProductModel.deleteMany({ slug: prodSlug });
  await ProductModel.create({
    slug: prodSlug,
    nameSv: "Syntetisk Vesuvio",
    categorySlug: TEST_SLUG,
    ingredients: ["skinka", "ost"],
    variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" }],
    active: true,
    sortOrder: 1,
  });

  // Verify it appears in public menu when category is active
  const activeMenu = await getPublicMenu();
  assert.ok(activeMenu.categories.some((c) => c.slug === TEST_SLUG));
  assert.ok(activeMenu.products.some((p) => p.slug === prodSlug));

  // Now deactivate category
  await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: cat.__v ?? 0,
      nameSv: cat.nameSv,
      blurbSv: cat.blurbSv,
      sortOrder: cat.sortOrder,
      removable: true,
      active: false,
    },
    "synth-key-menu-test-1234567890",
    adminActor,
  );

  // Verify it is filtered out of public menu
  const inactiveMenu = await getPublicMenu();
  assert.equal(inactiveMenu.categories.some((c) => c.slug === TEST_SLUG), false);
  assert.equal(inactiveMenu.products.some((p) => p.slug === prodSlug), false);

  // Verify priceCart rejects ordering product from inactive category
  const catalog = await loadCatalogForCart([prodSlug], []);
  const cartOrder = {
    items: [
      {
        productSlug: prodSlug,
        variantId: "normal",
        quantity: 1,
        removedIngredients: [],
        modifiers: [],
        note: "",
        ifUnavailable: "remove_item" as const,
      },
    ],
    customer: { name: "Testare", phone: "0701234567" },
    orderType: "pickup" as const,
  };
  const priceResult = priceCart(cartOrder, catalog);
  assert.equal(priceResult.ok, false);
  if (!priceResult.ok) {
    assert.equal(priceResult.issues[0]?.code, "product_unavailable");
  }

  // Now test removable: false
  await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: 1,
      nameSv: cat.nameSv,
      blurbSv: cat.blurbSv,
      sortOrder: cat.sortOrder,
      removable: false, // Disallow removal
      active: true, // Re-activate
    },
    "synth-key-removable-test-1234567890",
    adminActor,
  );

  const updatedCatalog = await loadCatalogForCart([prodSlug], []);
  const cartWithRemoval = {
    items: [
      {
        productSlug: prodSlug,
        variantId: "normal",
        quantity: 1,
        removedIngredients: ["skinka"],
        modifiers: [],
        note: "",
        ifUnavailable: "remove_item" as const,
      },
    ],
    customer: { name: "Testare", phone: "0701234567" },
    orderType: "pickup" as const,
  };
  const removalPriceResult = priceCart(cartWithRemoval, updatedCatalog);
  assert.equal(removalPriceResult.ok, false);
  if (!removalPriceResult.ok) {
    assert.equal(removalPriceResult.issues[0]?.code, "removal_not_allowed");
  }
});

// ------------------------------------------------------------------------------
// TEST 10: Preservation of linked Product and Modifier records
// ------------------------------------------------------------------------------
test("10. Updating category preserves linked Product and Modifier records intact", async () => {
  const cat = await seedCategory();
  const prodSlug = "synth-prod-preserved";
  const modSlug = "synth-mod-preserved";

  await ProductModel.deleteMany({ slug: prodSlug });
  await ModifierModel.deleteMany({ slug: modSlug });

  await ProductModel.create({
    slug: prodSlug,
    nameSv: "Bevarad Produkt",
    categorySlug: TEST_SLUG,
    ingredients: ["tomat", "ost"],
    variants: [{ id: "normal", label: "Normal", priceSek: 95, available: true, priceStatus: "confirmed" }],
    active: true,
  });

  await ModifierModel.create({
    slug: modSlug,
    labelSv: "Extra ost",
    compatibleCategories: [TEST_SLUG, "dryck"],
    priceByVariantSek: new Map([["normal", 15]]),
    maxQty: 2,
    active: true,
    priceStatus: "confirmed",
  });

  // Perform category update
  await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: cat.__v ?? 0,
      nameSv: "Ändrat Kategorinamn",
      blurbSv: "Ny text",
      sortOrder: 44,
      removable: true,
      active: true,
    },
    "synth-key-preservation-1234567890",
    adminActor,
  );

  // Check product is completely unchanged
  const productAfter = await ProductModel.findOne({ slug: prodSlug }).lean();
  assert.ok(productAfter);
  assert.equal(productAfter.categorySlug, TEST_SLUG);
  assert.equal(productAfter.nameSv, "Bevarad Produkt");

  // Check modifier is completely unchanged
  const modifierAfter = await ModifierModel.findOne({ slug: modSlug }).lean();
  assert.ok(modifierAfter);
  assert.deepEqual(modifierAfter.compatibleCategories, [TEST_SLUG, "dryck"]);
});

// ------------------------------------------------------------------------------
// TEST 11: Preservation of historical orders, receipts and payments
// ------------------------------------------------------------------------------
test("11. Updating category preserves historical orders, receipts and payments untouched", async () => {
  const cat = await seedCategory();
  const orderPublicId = "synth-order-cat-hist-12345";

  await OrderModel.deleteOne({ publicId: orderPublicId });
  await PaymentModel.deleteOne({ providerSessionId: "cs_synth_cat_test_001" });

  // Create historical order
  const order = await OrderModel.create({
    publicId: orderPublicId,
    idempotencyKey: "synth-hist-cat-order-0001",
    requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    contact: { name: "Historisk Kund", phone: "0700000000" },
    paymentMethod: "card",
    pickupAt: new Date(),
    items: [
      {
        productSlug: "synth-prod-test-pizza",
        productNameSnapshot: "Historisk Pizza",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        quantity: 2,
        basePriceSek: 110,
        lineTotalSek: 220,
        removedIngredients: [],
        modifiersSnapshot: [],
      },
    ],
    subtotalSek: 220,
    discountSek: 0,
    totalSek: 220,
  });

  // Create payment record
  await PaymentModel.create({
    orderId: order._id as Types.ObjectId,
    provider: "stripe",
    providerSessionId: "cs_synth_cat_test_001",
    status: "paid",
    amountSek: 220,
    currency: "SEK",
  });

  // Perform category update
  await updateAdminCategory(
    TEST_SLUG,
    {
      expectedRevision: cat.__v ?? 0,
      nameSv: "Ändrad kategori efter order",
      blurbSv: "Ny text",
      sortOrder: 50,
      removable: true,
      active: true,
    },
    "synth-key-hist-order-1234567890",
    adminActor,
  );

  // Check historical order items, snapshots, and prices remain 100% identical
  const orderAfter = await OrderModel.findOne({ publicId: orderPublicId }).lean();
  assert.ok(orderAfter);
  assert.equal(orderAfter.totalSek, 220);
  assert.equal(orderAfter.items[0]?.productNameSnapshot, "Historisk Pizza");
  assert.equal(orderAfter.items[0]?.basePriceSek, 110);
  assert.equal(orderAfter.items[0]?.lineTotalSek, 220);

  const paymentAfter = await PaymentModel.findOne({ orderId: order._id as Types.ObjectId }).lean();
  assert.ok(paymentAfter);
  assert.equal(paymentAfter.amountSek, 220);
  assert.equal(paymentAfter.status, "paid");
});

// ------------------------------------------------------------------------------
// TEST 12: Fail-closed behavior without transaction support
// ------------------------------------------------------------------------------
test("12. Fail-closed behavior returns transactions_required when replica set is missing", async () => {
  const cat = await seedCategory();

  // Mock admin command to simulate a standalone MongoDB server without replica set
  const originalAdmin = mongoose.connection.db?.admin;
  if (!mongoose.connection.db) throw new Error("No db connection");

  mongoose.connection.db.admin = () => ({
    command: async () => ({ hello: 1, ok: 1 }), // No setName or isdbgrid
  }) as unknown as ReturnType<NonNullable<typeof originalAdmin>>;

  try {
    const result = await updateAdminCategory(
      TEST_SLUG,
      {
        expectedRevision: cat.__v ?? 0,
        nameSv: "Ska Neka Utan Replica Set",
        blurbSv: "Ska inte sparas",
        sortOrder: 1,
        removable: true,
        active: true,
      },
      "synth-key-standalone-1234567890",
      adminActor,
    );

    assert.equal(result.status, "transactions_required");
  } finally {
    if (originalAdmin) {
      mongoose.connection.db.admin = originalAdmin;
    }
  }
});
