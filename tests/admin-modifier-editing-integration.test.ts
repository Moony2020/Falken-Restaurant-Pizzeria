import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose, { Types } from "mongoose";
import {
  updateAdminModifier,
  type ModifierEdit,
} from "../src/server/admin-modifier-editing.ts";
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
import { PATCH } from "../src/app/api/admin/catalog/modifiers/[slug]/route.ts";
import { loadCatalogForCart } from "../src/server/catalog-repo.ts";
import { priceCart } from "../src/server/pricing-engine.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas, VeloRider, or any port other
// than our dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_modifier_editing_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActorId = new Types.ObjectId().toString();

const adminActor: AdminPrincipal = {
  id: adminActorId,
  email: "admin-mod@falken-test.local",
  displayName: "Modifier Integration Test Admin",
  role: "ADMIN",
};

const TEST_SLUG = "synth-mod-extra-ost";
const TEST_PROD_SLUG = "synth-prod-margherita";
const TEST_CAT_SLUG = "synth-cat-pizza";

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-modifier-test-secret-min-32-chars-long";

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
  await ModifierModel.deleteMany({ slug: /^synth-mod-/ });
  await ProductModel.deleteMany({ slug: /^synth-prod-/ });
  await CategoryModel.deleteMany({ slug: /^synth-cat-/ });
  await AuditLogModel.deleteMany({
    $or: [{ entityId: /^synth-mod-/ }, { deduplicationKey: /^modifier-edit:/ }],
  });
  await OrderModel.deleteMany({ publicId: /^synth-order-/ });
  await PaymentModel.deleteMany({ providerSessionId: /^cs_synth_mod_/ });
  await StaffUserModel.deleteMany({ email: /@falken-test\.local$/ });
  await StaffSessionModel.deleteMany({});
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

async function seedModifier(overrides: Partial<Parameters<typeof ModifierModel.create>[0]> = {}) {
  await ModifierModel.deleteMany({ slug: TEST_SLUG });
  return await ModifierModel.create({
    slug: TEST_SLUG,
    labelSv: "Syntetisk Extra Ost",
    groupSlug: "extra",
    priceByVariantSek: new Map([
      ["normal", 20],
      ["familj", 35],
    ]),
    maxQty: 3,
    compatibleCategories: [TEST_CAT_SLUG],
    active: true,
    priceStatus: "confirmed",
    ...overrides,
  });
}

async function seedProductAndCategory() {
  await CategoryModel.deleteMany({ slug: /^synth-cat-/ });
  await ProductModel.deleteMany({ slug: /^synth-prod-/ });

  await CategoryModel.create({
    slug: TEST_CAT_SLUG,
    nameSv: "Syntetisk Pizza Kategori",
    removable: true,
    sortOrder: 1,
    active: true,
  });

  await ProductModel.create({
    slug: TEST_PROD_SLUG,
    nameSv: "Syntetisk Margherita",
    categorySlug: TEST_CAT_SLUG,
    active: true,
    sortOrder: 1,
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 220, available: true, priceStatus: "confirmed" },
    ],
  });
}

// ------------------------------------------------------------------------------
// TEST 1: Successful Modifier Update + AuditLog Atomic Commit
// ------------------------------------------------------------------------------
test("1. Successful modifier update + AuditLog committed atomically", async () => {
  const mod = await seedModifier();
  const originalVersion = mod.__v ?? 0;

  const input: ModifierEdit = {
    expectedRevision: originalVersion,
    labelSv: "Syntetisk Extra Gouda",
    maxQty: 4,
    compatibleCategories: [TEST_CAT_SLUG, "synth-cat-kebab"],
    priceByVariantSek: { normal: 22, familj: 40 },
    priceStatus: "confirmed",
    active: true,
  };

  const idempotencyKey = "synth-key-success-0123456789";
  const result = await updateAdminModifier(TEST_SLUG, input, idempotencyKey, adminActor);

  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.replayed, false);
    assert.equal(result.modifier.labelSv, "Syntetisk Extra Gouda");
    assert.equal(result.modifier.maxQty, 4);
    assert.equal(result.modifier.priceByVariantSek.normal, 22);
    assert.equal(result.modifier.priceByVariantSek.familj, 40);
    assert.equal(result.modifier.revision, originalVersion + 1);
  }

  // Verify AuditLog record
  const audit = await AuditLogModel.findOne({ entityId: TEST_SLUG }).lean();
  assert.ok(audit, "AuditLog must be created");
  assert.equal(audit.action, "catalog_modifier_updated");
  assert.equal(audit.actorId, adminActor.id);
  assert.equal(audit.entity, "modifier");
});

// ------------------------------------------------------------------------------
// TEST 2: Atomic Rollback when AuditLog creation fails
// ------------------------------------------------------------------------------
test("2. Atomic rollback leaves Modifier untouched when AuditLog fails", async () => {
  const mod = await seedModifier();
  const originalVersion = mod.__v ?? 0;

  const originalCreate = AuditLogModel.create;
  // Force AuditLogModel.create to throw inside transaction
  AuditLogModel.create = (async () => {
    throw new Error("Simulated database failure during audit log creation");
  }) as unknown as typeof AuditLogModel.create;

  try {
    const input: ModifierEdit = {
      expectedRevision: originalVersion,
      labelSv: "Borde Aldrig Spara Denna Ändring",
      maxQty: 5,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: 50, familj: 90 },
      priceStatus: "confirmed",
      active: true,
    };

    await assert.rejects(
      async () => {
        await updateAdminModifier(TEST_SLUG, input, "synth-key-rollback-1234567890", adminActor);
      },
      { message: /Simulated database failure/ },
    );

    // Verify modifier remains unchanged
    const pristine = await ModifierModel.findOne({ slug: TEST_SLUG }).lean();
    assert.ok(pristine);
    assert.equal(pristine.labelSv, "Syntetisk Extra Ost");
    assert.equal(pristine.__v, originalVersion);
  } finally {
    AuditLogModel.create = originalCreate;
  }
});

// ------------------------------------------------------------------------------
// TEST 3: Idempotent replay: same key + identical payload
// ------------------------------------------------------------------------------
test("3. Idempotent replay returns previous result with replayed: true and no duplicate audit log", async () => {
  const mod = await seedModifier();
  const input: ModifierEdit = {
    expectedRevision: mod.__v ?? 0,
    labelSv: "Idempotent Modifier",
    maxQty: 2,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 25, familj: 45 },
    priceStatus: "confirmed",
    active: true,
  };

  const idempotencyKey = "synth-key-idemp-0123456789";
  const first = await updateAdminModifier(TEST_SLUG, input, idempotencyKey, adminActor);
  assert.equal(first.status, "ok");
  if (first.status === "ok") assert.equal(first.replayed, false);

  const auditCountBefore = await AuditLogModel.countDocuments({ entityId: TEST_SLUG });

  // Replay exactly identical call
  const second = await updateAdminModifier(TEST_SLUG, input, idempotencyKey, adminActor);
  assert.equal(second.status, "ok");
  if (second.status === "ok") {
    assert.equal(second.replayed, true);
    assert.equal(second.modifier.labelSv, "Idempotent Modifier");
  }

  const auditCountAfter = await AuditLogModel.countDocuments({ entityId: TEST_SLUG });
  assert.equal(auditCountBefore, auditCountAfter, "No new audit log should be recorded on replay");
});

// ------------------------------------------------------------------------------
// TEST 4: Same key with changed payload rejection (returns 409 idempotency_conflict)
// ------------------------------------------------------------------------------
test("4. Same key with changed payload returns idempotency_conflict", async () => {
  const mod = await seedModifier();
  const input1: ModifierEdit = {
    expectedRevision: mod.__v ?? 0,
    labelSv: "Modifier Payload A",
    maxQty: 2,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 20 },
    priceStatus: "confirmed",
    active: true,
  };

  const idempotencyKey = "synth-key-conflict-0123456789";
  const first = await updateAdminModifier(TEST_SLUG, input1, idempotencyKey, adminActor);
  assert.equal(first.status, "ok");

  // Changed payload with the same idempotency key
  const input2: ModifierEdit = {
    ...input1,
    labelSv: "Modifier Payload B with changed text",
  };

  const conflict = await updateAdminModifier(TEST_SLUG, input2, idempotencyKey, adminActor);
  assert.equal(conflict.status, "idempotency_conflict");
});

// ------------------------------------------------------------------------------
// TEST 5: Stale revision conflict (optimistic concurrency rejects stale expectedRevision)
// ------------------------------------------------------------------------------
test("5. Stale revision conflict returns status stale with latest modifier state", async () => {
  const mod = await seedModifier();

  const staleInput: ModifierEdit = {
    expectedRevision: (mod.__v ?? 0) + 999, // Out of sync revision
    labelSv: "Stale Modifier Attempt",
    maxQty: 3,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 30 },
    priceStatus: "confirmed",
    active: true,
  };

  const result = await updateAdminModifier(
    TEST_SLUG,
    staleInput,
    "synth-key-stale-0123456789",
    adminActor,
  );

  assert.equal(result.status, "stale");
  if (result.status === "stale") {
    assert.equal(result.modifier.slug, TEST_SLUG);
    assert.equal(result.modifier.labelSv, "Syntetisk Extra Ost");
  }
});

// ------------------------------------------------------------------------------
// TEST 6: Concurrent requests (racing requests with different keys)
// ------------------------------------------------------------------------------
test("6. Concurrent requests: exactly one commits, the other receives stale conflict", async () => {
  const mod = await seedModifier();
  const initialRevision = mod.__v ?? 0;

  const reqA: ModifierEdit = {
    expectedRevision: initialRevision,
    labelSv: "Concurrent Winner A",
    maxQty: 2,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 25 },
    priceStatus: "confirmed",
    active: true,
  };

  const reqB: ModifierEdit = {
    expectedRevision: initialRevision,
    labelSv: "Concurrent Winner B",
    maxQty: 3,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 28 },
    priceStatus: "confirmed",
    active: true,
  };

  const [resA, resB] = await Promise.all([
    updateAdminModifier(TEST_SLUG, reqA, "synth-key-race-A-0123456789", adminActor),
    updateAdminModifier(TEST_SLUG, reqB, "synth-key-race-B-0123456789", adminActor),
  ]);

  const statuses = [resA.status, resB.status];
  assert.ok(statuses.includes("ok"), "One request must succeed");
  assert.ok(statuses.includes("stale"), "One request must receive stale conflict");
});

// ------------------------------------------------------------------------------
// TEST 7: ADMIN authorization, CSRF, and Origin checks via PATCH endpoint
// ------------------------------------------------------------------------------
test("7. PATCH API route enforces ADMIN auth, CSRF, and valid idempotency keys", async () => {
  const mod = await seedModifier();

  const validPayload = {
    expectedRevision: mod.__v ?? 0,
    labelSv: "API Patch Tested Modifier",
    maxQty: 2,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 24 },
    priceStatus: "confirmed",
    active: true,
  };

  // Case A: Unauthenticated request -> 401
  const reqUnauth = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const resUnauth = await PATCH(reqUnauth, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resUnauth.status, 401);

  const { session: adminSession } = await createTestStaff();

  // Case B: Missing CSRF token header -> 403
  const reqNoCsrf = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      origin: "http://localhost:3000",
      "idempotency-key": "synth-key-nocsrf-0123456789",
    },
    body: JSON.stringify(validPayload),
  });
  const resNoCsrf = await PATCH(reqNoCsrf, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resNoCsrf.status, 403);

  // Case C: Invalid / Mismatched CSRF token -> 403
  const reqBadCsrf = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": "wrong-csrf-token",
      origin: "http://localhost:3000",
      "idempotency-key": "synth-key-badcsrf-0123456789",
    },
    body: JSON.stringify(validPayload),
  });
  const resBadCsrf = await PATCH(reqBadCsrf, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resBadCsrf.status, 403);

  // Case D: Cross-Origin request (bad origin) -> 403
  const reqBadOrigin = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "https://malicious-attacker.com",
      "idempotency-key": "synth-key-badorigin-0123456789",
    },
    body: JSON.stringify(validPayload),
  });
  const resBadOrigin = await PATCH(reqBadOrigin, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resBadOrigin.status, 403);

  // Case E: Authenticated ADMIN with valid CSRF but missing/invalid idempotency key -> 400
  const reqBadIdemp = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
      "idempotency-key": "short", // Too short (min 16 chars)
    },
    body: JSON.stringify(validPayload),
  });
  const resBadIdemp = await PATCH(reqBadIdemp, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resBadIdemp.status, 400);

  // Case F: Authenticated ADMIN with valid headers -> 200 OK
  const reqValid = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      origin: "http://localhost:3000",
      "idempotency-key": "synth-key-api-ok-0123456789",
    },
    body: JSON.stringify(validPayload),
  });
  const resValid = await PATCH(reqValid, { params: Promise.resolve({ slug: TEST_SLUG }) });
  assert.equal(resValid.status, 200);
});

// ------------------------------------------------------------------------------
// TEST 8: Valid positive integer prices at boundaries 1 and 500 SEK
// ------------------------------------------------------------------------------
test("8. Valid positive integer prices at boundaries 1 and 500 SEK commit cleanly", async () => {
  const mod = await seedModifier();

  // Boundary 1 SEK
  const res1 = await updateAdminModifier(
    TEST_SLUG,
    {
      expectedRevision: mod.__v ?? 0,
      labelSv: "Boundary 1 SEK",
      maxQty: 1,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: 1 },
      priceStatus: "confirmed",
      active: true,
    },
    "synth-key-boundary-1-0123456789",
    adminActor,
  );
  assert.equal(res1.status, "ok");
  if (res1.status === "ok") assert.equal(res1.modifier.priceByVariantSek.normal, 1);

  // Boundary 500 SEK
  const res500 = await updateAdminModifier(
    TEST_SLUG,
    {
      expectedRevision: res1.status === "ok" ? res1.modifier.revision : 1,
      labelSv: "Boundary 500 SEK",
      maxQty: 1,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: 500 },
      priceStatus: "confirmed",
      active: true,
    },
    "synth-key-boundary-500-0123456789",
    adminActor,
  );
  assert.equal(res500.status, "ok");
  if (res500.status === "ok") assert.equal(res500.modifier.priceByVariantSek.normal, 500);
});

// ------------------------------------------------------------------------------
// TEST 9: Rejection of 0, negative, fractional, nonnumeric, and above-500 prices via PATCH API
// ------------------------------------------------------------------------------
test("9. PATCH API rejects 0, negative, fractional, nonnumeric, and above-500 prices with 422", async () => {
  const mod = await seedModifier();
  const { session: adminSession } = await createTestStaff();

  const testCases = [
    { name: "zero price (free)", price: 0 },
    { name: "negative price", price: -10 },
    { name: "fractional price (ören)", price: 19.5 },
    { name: "above limit price", price: 501 },
    { name: "nonnumeric price", price: "thirty" },
  ];

  for (const tc of testCases) {
    const payload = {
      expectedRevision: mod.__v ?? 0,
      labelSv: "Invalid Price Test",
      maxQty: 2,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: tc.price },
      priceStatus: "confirmed",
      active: true,
    };

    const req = new Request(`http://localhost:3000/api/admin/catalog/modifiers/${TEST_SLUG}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
        "x-csrf-token": adminSession.csrfToken,
        origin: "http://localhost:3000",
        "idempotency-key": `synth-invalid-price-${Math.random().toString(36).slice(2, 10)}12345`,
      },
      body: JSON.stringify(payload),
    });

    const res = await PATCH(req, { params: Promise.resolve({ slug: TEST_SLUG }) });
    assert.equal(res.status, 422, `Expected 422 for ${tc.name}`);
  }
});

// ------------------------------------------------------------------------------
// TEST 10: Category compatibility enforcement
// ------------------------------------------------------------------------------
test("10. Pricing engine enforces modifier compatibleCategories", async () => {
  await seedProductAndCategory();

  // Modifier compatible ONLY with pizza
  await seedModifier({
    compatibleCategories: [TEST_CAT_SLUG],
  });

  const catalog = await loadCatalogForCart([TEST_PROD_SLUG], [TEST_SLUG]);

  // Item with compatible category -> pricing succeeds
  const validCart = priceCart(
    {
      items: [
        {
          productSlug: TEST_PROD_SLUG,
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 1 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );
  assert.equal(validCart.ok, true);
  if (validCart.ok) {
    assert.equal(validCart.totalSek, 120); // 100 (pizza) + 20 (extra ost)
  }

  // Dish in incompatible category (e.g. kebab) -> rejected by pricing engine
  const kebabCatSlug = "synth-cat-kebab";
  const kebabProdSlug = "synth-prod-kebabrulle";
  await CategoryModel.create({
    slug: kebabCatSlug,
    nameSv: "Syntetisk Kebab",
    active: true,
    sortOrder: 2,
  });
  await ProductModel.create({
    slug: kebabProdSlug,
    nameSv: "Syntetisk Kebabrulle",
    categorySlug: kebabCatSlug,
    active: true,
    sortOrder: 2,
    variants: [{ id: "normal", label: "Normal", priceSek: 95, available: true, priceStatus: "confirmed" }],
  });

  const catalogWithKebab = await loadCatalogForCart([kebabProdSlug], [TEST_SLUG]);
  const incompatibleCart = priceCart(
    {
      items: [
        {
          productSlug: kebabProdSlug,
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 1 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalogWithKebab,
  );
  assert.equal(incompatibleCart.ok, false);
  if (!incompatibleCart.ok) {
    assert.equal(incompatibleCart.issues[0].code, "modifier_not_allowed");
  }
});

// ------------------------------------------------------------------------------
// TEST 11: Existing variant pricing and maxQty preservation
// ------------------------------------------------------------------------------
test("11. Pricing engine preserves existing variant pricing and enforces maxQty", async () => {
  await seedProductAndCategory();
  await seedModifier({
    maxQty: 2,
    priceByVariantSek: new Map([
      ["normal", 20],
      ["familj", 35],
    ]),
  });

  const catalog = await loadCatalogForCart([TEST_PROD_SLUG], [TEST_SLUG]);

  // Exceeding maxQty (ordering 3 when maxQty is 2) -> rejected
  const exceedCart = priceCart(
    {
      items: [
        {
          productSlug: TEST_PROD_SLUG,
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 3 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );
  assert.equal(exceedCart.ok, false);
  if (!exceedCart.ok) {
    assert.equal(exceedCart.issues[0].code, "modifier_quantity");
  }

  // Ordering on familj variant gets familj price (35 SEK)
  const familjCart = priceCart(
    {
      items: [
        {
          productSlug: TEST_PROD_SLUG,
          variantId: "familj",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 1 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );
  assert.equal(familjCart.ok, true);
  if (familjCart.ok) {
    assert.equal(familjCart.totalSek, 255); // 220 + 35
  }
});

// ------------------------------------------------------------------------------
// TEST 12: Inactive and needs_review modifiers handling
// ------------------------------------------------------------------------------
test("12. Inactive and needs_review modifiers cannot be ordered in pricing engine", async () => {
  await seedProductAndCategory();

  // Case A: Inactive modifier
  await seedModifier({
    active: false,
    priceStatus: "confirmed",
  });
  let catalog = await loadCatalogForCart([TEST_PROD_SLUG], [TEST_SLUG]);
  let cart = priceCart(
    {
      items: [
        {
          productSlug: TEST_PROD_SLUG,
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 1 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );
  assert.equal(cart.ok, false);
  if (!cart.ok) {
    assert.equal(cart.issues[0].code, "modifier_unavailable");
  }

  // Case B: needs_review modifier
  await seedModifier({
    active: true,
    priceStatus: "needs_review",
  });
  catalog = await loadCatalogForCart([TEST_PROD_SLUG], [TEST_SLUG]);
  cart = priceCart(
    {
      items: [
        {
          productSlug: TEST_PROD_SLUG,
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: TEST_SLUG, quantity: 1 }],
          removedIngredients: [],
          note: "",
          ifUnavailable: "remove_item",
        },
      ],
    },
    catalog,
  );
  assert.equal(cart.ok, false);
  if (!cart.ok) {
    assert.equal(cart.issues[0].code, "modifier_price_unconfirmed");
  }
});

// ------------------------------------------------------------------------------
// TEST 13: Preservation of stable identifiers (slug, groupSlug) and unrelated fields
// ------------------------------------------------------------------------------
test("13. Preserves stable slug and groupSlug without modification", async () => {
  const mod = await seedModifier({ groupSlug: "gronsaker" });

  const input: ModifierEdit = {
    expectedRevision: mod.__v ?? 0,
    labelSv: "Nytt Namn Med Bevarad Grupp",
    maxQty: 3,
    compatibleCategories: [TEST_CAT_SLUG],
    priceByVariantSek: { normal: 15 },
    priceStatus: "confirmed",
    active: true,
  };

  const result = await updateAdminModifier(
    TEST_SLUG,
    input,
    "synth-key-preserve-0123456789",
    adminActor,
  );
  assert.equal(result.status, "ok");

  const doc = await ModifierModel.findOne({ slug: TEST_SLUG }).lean();
  assert.ok(doc);
  assert.equal(doc.slug, TEST_SLUG, "Slug must remain strictly immutable");
  assert.equal(doc.groupSlug, "gronsaker", "groupSlug must remain untouched");
});

// ------------------------------------------------------------------------------
// TEST 14: Historical order snapshot and payment preservation
// ------------------------------------------------------------------------------
test("14. Historical order item modifier snapshots and payments remain completely immutable", async () => {
  const mod = await seedModifier();

  // Create historical order containing the modifier snapshot at 20 SEK
  const orderId = new Types.ObjectId();
  await OrderModel.create({
    _id: orderId,
    publicId: "synth-order-mod-history-1",
    idempotencyKey: "synth-hist-mod-idemp-0001",
    requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    items: [
      {
        productSlug: TEST_PROD_SLUG,
        productNameSnapshot: "Syntetisk Margherita",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 100,
        modifiersSnapshot: [
          {
            modifierSlug: TEST_SLUG,
            labelSv: "Syntetisk Extra Ost",
            priceSek: 20,
            quantity: 1,
          },
        ],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 120,
      },
    ],
    subtotalSek: 120,
    discountSek: 0,
    totalSek: 120,
    pickupAt: new Date(),
    contact: { name: "Historisk Kund", phone: "0701234567" },
    paymentMethod: "card",
  });

  const payment = await PaymentModel.create({
    orderId,
    provider: "stripe",
    providerSessionId: "cs_synth_mod_history_1",
    amountSek: 120,
    status: "paid",
  });

  // Now update the modifier price to 45 SEK
  const updateResult = await updateAdminModifier(
    TEST_SLUG,
    {
      expectedRevision: mod.__v ?? 0,
      labelSv: "Dyr Extra Ost",
      maxQty: 3,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: 45 },
      priceStatus: "confirmed",
      active: true,
    },
    "synth-key-hist-order-0123456789",
    adminActor,
  );
  assert.equal(updateResult.status, "ok");

  // Verify historical order item snapshot was NOT changed
  const historicalOrder = await OrderModel.findById(orderId).lean();
  assert.ok(historicalOrder);
  assert.equal(historicalOrder.items[0].modifiersSnapshot[0].priceSek, 20);
  assert.equal(historicalOrder.items[0].modifiersSnapshot[0].labelSv, "Syntetisk Extra Ost");
  assert.equal(historicalOrder.totalSek, 120);

  // Verify payment record was NOT changed
  const historicalPayment = await PaymentModel.findById(payment._id).lean();
  assert.ok(historicalPayment);
  assert.equal(historicalPayment.amountSek, 120);
});

// ------------------------------------------------------------------------------
// TEST 15: Fail-closed behavior without transactions (when replica set is absent)
// ------------------------------------------------------------------------------
test("15. Fail-closed behavior returns transactions_required when replica set is missing", async () => {
  const mod = await seedModifier();

  // Mock admin command to simulate a standalone MongoDB server without replica set
  const originalAdmin = mongoose.connection.db?.admin;
  if (!mongoose.connection.db) throw new Error("No db connection");

  // @ts-expect-error Mocking admin command
  mongoose.connection.db.admin = () => ({
    command: async () => ({ ok: 1 }), // No setName -> standalone
  });

  try {
    const input: ModifierEdit = {
      expectedRevision: mod.__v ?? 0,
      labelSv: "No Replica Set Mod",
      maxQty: 2,
      compatibleCategories: [TEST_CAT_SLUG],
      priceByVariantSek: { normal: 20 },
      priceStatus: "confirmed",
      active: true,
    };

    const result = await updateAdminModifier(
      TEST_SLUG,
      input,
      "synth-key-norepl-0123456789",
      adminActor,
    );

    assert.equal(result.status, "transactions_required");
  } finally {
    if (originalAdmin) {
      mongoose.connection.db.admin = originalAdmin;
    }
  }
});
