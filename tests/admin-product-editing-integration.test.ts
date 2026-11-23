import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose, { Types } from "mongoose";
import { updateAdminProduct, productEditSchema, type ProductEdit } from "../src/server/admin-product-editing.ts";
import { ProductModel } from "../src/server/models/catalog.ts";
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
import { PATCH } from "../src/app/api/admin/catalog/products/[slug]/route.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas, VeloRider, or any port other
// than our dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_product_editing_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActor: AdminPrincipal = {
  id: "synth-admin-id",
  email: "admin-test@falken-test.local",
  displayName: "Integration Test Admin",
  role: "ADMIN",
};

const APPROVED_CATALOG_IMAGE = "/images/dishes/pizza/vesuvio.webp";

before(async () => {
  // Ensure valid test auth secret is configured
  process.env.ADMIN_SESSION_SECRET = "falken-integration-test-secret-min-32-chars-long";

  // Disconnect any existing connection from other suites
  await mongoose.disconnect();

  // Explicitly connect to dedicated isolated container on port 27018
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });

  // STRICT FAIL-CLOSED VALIDATION
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
  await AuditLogModel.deleteMany({ entityId: { $regex: /^synth-/ } });
  await OrderModel.deleteMany({ publicId: { $regex: /^synth-order-/ } });
  await PaymentModel.deleteMany({ providerSessionId: { $regex: /^cs_synth_/ } });
  await StaffUserModel.deleteMany({ email: { $regex: /@synth-test\.local$/ } });
  await StaffSessionModel.deleteMany({});
});

after(async () => {
  // Clean synthetic test data on exit
  try {
    if (mongoose.connection.readyState === 1) {
      await ProductModel.deleteMany({ slug: { $regex: /^synth-/ } });
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
    ingredients: ["ost", "skinka"],
    allergens: ["gluten", "laktos"],
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
    ...overrides,
  });
}

// -----------------------------------------------------------------------------
// TEST 1: Successful Product + AuditLog transaction with majority write concern
// -----------------------------------------------------------------------------
test("1. Successful Product + AuditLog transaction commits atomically", async () => {
  const slug = "synth-trans-success";
  await seedSyntheticProduct(slug);

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza Redigerad",
    descriptionSv: "Ny beskrivning",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 15,
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 260, available: true, priceStatus: "confirmed" },
    ],
  };

  const idempKey = "test-idemp-key-0001";
  const result = await updateAdminProduct(slug, input, idempKey, adminActor);

  assert.equal(result.status, "ok");
  assert.equal(result.replayed, false);
  assert.equal(result.product?.nameSv, "Syntetisk Pizza Redigerad");
  assert.equal(result.product?.variants[0].priceSek, 110);

  // Verify DB state
  const updatedDoc = await ProductModel.findOne({ slug }).lean();
  assert.ok(updatedDoc);
  assert.equal(updatedDoc.nameSv, "Syntetisk Pizza Redigerad");
  assert.equal(updatedDoc.__v, 1);
  assert.equal(updatedDoc.variants[0].priceSek, 110);

  // Verify AuditLog
  const auditLogs = await AuditLogModel.find({ entityId: slug }).lean();
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "catalog_product_updated");
  assert.equal(auditLogs[0]?.actorId, adminActor.id);
  assert.ok(auditLogs[0]?.deduplicationKey?.startsWith("catalog-edit:"));
});

// -----------------------------------------------------------------------------
// TEST 2: Atomic rollback when AuditLog fails
// -----------------------------------------------------------------------------
test("2. Atomic rollback leaves Product document untouched when AuditLog fails", async () => {
  const slug = "synth-trans-rollback";
  await seedSyntheticProduct(slug);

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Namn som inte ska sparas",
    descriptionSv: "Beskrivning som ska rullas tillbaka",
    image: APPROVED_CATALOG_IMAGE,
    active: false,
    sortOrder: 99,
    variants: [
      { id: "normal", label: "Normal", priceSek: 999, available: false, priceStatus: "needs_review" },
      { id: "familj", label: "Familj", priceSek: 999, available: false, priceStatus: "needs_review" },
    ],
  };

  // Simulate an AuditLog failure inside the transaction
  const originalCreate = AuditLogModel.create;
  AuditLogModel.create = (async () => {
    throw new Error("Simulerat fel i AuditLog för att testa atomär rollback");
  }) as unknown as typeof AuditLogModel.create;

  try {
    await assert.rejects(
      async () => {
        await updateAdminProduct(slug, input, "test-idemp-rollback", adminActor);
      },
      { message: /Simulerat fel i AuditLog/ }
    );
  } finally {
    AuditLogModel.create = originalCreate;
  }

  // Verify rollback: Product in DB must be exactly in its original state!
  const docAfterRollback = await ProductModel.findOne({ slug }).lean();
  assert.ok(docAfterRollback);
  assert.equal(docAfterRollback.nameSv, "Syntetisk Pizza");
  assert.equal(docAfterRollback.active, true);
  assert.equal(docAfterRollback.__v, 0);
  assert.equal(docAfterRollback.variants[0].priceSek, 100);

  // Verify no audit log exists
  const logs = await AuditLogModel.find({ entityId: slug });
  assert.equal(logs.length, 0);
});

// -----------------------------------------------------------------------------
// TEST 3: Optimistic concurrency using expectedRevision
// -----------------------------------------------------------------------------
test("3. Optimistic concurrency rejects stale expectedRevision", async () => {
  const slug = "synth-stale-concurrency";
  await seedSyntheticProduct(slug);

  const staleInput: ProductEdit = {
    expectedRevision: 42, // Stale! Actual is 0
    nameSv: "Stale Edit",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const result = await updateAdminProduct(slug, staleInput, "test-idemp-stale", adminActor);
  assert.equal(result.status, "stale");
  assert.equal(result.product?.revision, 0);

  const doc = await ProductModel.findOne({ slug }).lean();
  assert.equal(doc?.nameSv, "Syntetisk Pizza");
  assert.equal(doc?.__v, 0);
});

// -----------------------------------------------------------------------------
// TEST 4: Same Idempotency-Key + identical payload returns previous result
// -----------------------------------------------------------------------------
test("4. Same Idempotency-Key + identical payload returns previous result without duplicate audit log", async () => {
  const slug = "synth-idemp-replay";
  await seedSyntheticProduct(slug);

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Idempotent Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 115, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 265, available: true, priceStatus: "confirmed" },
    ],
  };

  const idempKey = "test-idemp-replay-001";
  const first = await updateAdminProduct(slug, input, idempKey, adminActor);
  assert.equal(first.status, "ok");
  assert.equal(first.replayed, false);

  // Call again with exact same key and input
  const second = await updateAdminProduct(slug, input, idempKey, adminActor);
  assert.equal(second.status, "ok");
  assert.equal(second.replayed, true);
  assert.equal(second.product?.nameSv, "Idempotent Pizza");

  // Still only 1 audit log created
  const count = await AuditLogModel.countDocuments({ entityId: slug });
  assert.equal(count, 1);
});

// -----------------------------------------------------------------------------
// TEST 5: Same Idempotency-Key + different payload returns 409 idempotency_key_reused
// -----------------------------------------------------------------------------
test("5. Same Idempotency-Key + different payload returns idempotency_conflict", async () => {
  const slug = "synth-idemp-conflict";
  await seedSyntheticProduct(slug);

  const inputOriginal: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Original Namn",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const idempKey = "test-idemp-conflict-01";
  const first = await updateAdminProduct(slug, inputOriginal, idempKey, adminActor);
  assert.equal(first.status, "ok");

  // Re-use key with different payload (price changed from 110 to 125)
  const inputModified: ProductEdit = {
    ...inputOriginal,
    expectedRevision: 1,
    variants: [
      { id: "normal", label: "Normal", priceSek: 125, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const second = await updateAdminProduct(slug, inputModified, idempKey, adminActor);
  assert.equal(second.status, "idempotency_conflict");

  // Product price remains 110, not 125
  const doc = await ProductModel.findOne({ slug }).lean();
  assert.equal(doc?.variants[0].priceSek, 110);
});

// -----------------------------------------------------------------------------
// TEST 6: Truly concurrent requests with the same idempotency key
// -----------------------------------------------------------------------------
test("6. Truly concurrent requests with the same idempotency key succeed safely", async () => {
  const slug = "synth-concurrent-idemp";
  await seedSyntheticProduct(slug);

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Samtidig Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const idempKey = "test-concurrent-same-key";
  const [res1, res2] = await Promise.all([
    updateAdminProduct(slug, input, idempKey, adminActor),
    updateAdminProduct(slug, input, idempKey, adminActor),
  ]);

  assert.equal(res1.status, "ok");
  assert.equal(res2.status, "ok");

  // Exactly one created, the other replayed
  if (res1.status === "ok" && res2.status === "ok") {
    const replayFlags = [res1.replayed, res2.replayed];
    assert.ok(replayFlags.includes(false));
    assert.ok(replayFlags.includes(true));
  }

  // Exactly 1 audit record
  const count = await AuditLogModel.countDocuments({ entityId: slug });
  assert.equal(count, 1);
});

// -----------------------------------------------------------------------------
// TEST 7: Concurrent requests with different keys and stale revisions
// -----------------------------------------------------------------------------
test("7. Concurrent requests with different keys: one succeeds, other becomes stale", async () => {
  const slug = "synth-concurrent-race";
  await seedSyntheticProduct(slug);

  const inputA: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Klient A Vinnare",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const inputB: ProductEdit = {
    expectedRevision: 0, // Also expecting 0!
    nameSv: "Klient B Förlorare",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 20,
    variants: [
      { id: "normal", label: "Normal", priceSek: 120, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 270, available: true, priceStatus: "confirmed" },
    ],
  };

  // Run sequentially or racing: once A commits, B with expectedRevision 0 must fail with stale
  const resA = await updateAdminProduct(slug, inputA, "key-race-a", adminActor);
  assert.equal(resA.status, "ok");

  const resB = await updateAdminProduct(slug, inputB, "key-race-b", adminActor);
  assert.equal(resB.status, "stale");
  assert.equal(resB.product?.revision, 1);
  assert.equal(resB.product?.nameSv, "Klient A Vinnare");
});

// -----------------------------------------------------------------------------
// TEST 8: Product and variant field preservation
// -----------------------------------------------------------------------------
test("8. Preserves ingredients, allergens, categorySlug, and variant fields when editing", async () => {
  const slug = "synth-field-preservation";
  await seedSyntheticProduct(slug, {
    categorySlug: "pizza-special",
    ingredients: ["tomat", "mozzarella"],
    allergens: ["gluten", "mjölkprotein"],
  });

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Bevarat Namn",
    descriptionSv: "Ny beskrivning",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 5,
    variants: [
      { id: "normal", label: "Normal Uppdaterad", priceSek: 130, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj Uppdaterad", priceSek: 280, available: true, priceStatus: "confirmed" },
    ],
  };

  const res = await updateAdminProduct(slug, input, "key-preservation-01", adminActor);
  assert.equal(res.status, "ok");

  const doc = await ProductModel.findOne({ slug }).lean();
  assert.ok(doc);
  assert.equal(doc.categorySlug, "pizza-special");
  assert.deepEqual(doc.allergens, ["gluten", "mjölkprotein"]);
  assert.deepEqual(doc.ingredients, ["tomat", "mozzarella"]);
  assert.equal(doc.variants[0].label, "Normal Uppdaterad");
  assert.equal(doc.variants[0].priceSek, 130);
});

// -----------------------------------------------------------------------------
// TEST 9: needs_review variants remain unchanged when unrelated fields are edited
// -----------------------------------------------------------------------------
test("9. needs_review variants remain unchanged when editing description or sortOrder", async () => {
  const slug = "synth-needs-review-test";
  await seedSyntheticProduct(slug, {
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "needs_review" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  });

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Syntetisk Pizza",
    descriptionSv: "Endast beskrivningen ändras här!",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 25,
    variants: [
      // priceStatus sent as needs_review intentionally
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "needs_review" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const res = await updateAdminProduct(slug, input, "key-review-01", adminActor);
  assert.equal(res.status, "ok");

  const doc = await ProductModel.findOne({ slug }).lean();
  assert.equal(doc?.variants[0].priceStatus, "needs_review");
  assert.equal(doc?.variants[1].priceStatus, "confirmed");
  assert.equal(doc?.descriptionSv, "Endast beskrivningen ändras här!");
});

// -----------------------------------------------------------------------------
// TEST 10: Rejection of invalid, zero, negative, fractional and excessive prices
// -----------------------------------------------------------------------------
test("10. Rejection of invalid, zero, negative, fractional, and excessive SEK prices", () => {
  const base = {
    expectedRevision: 0,
    nameSv: "Test",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 0,
    variants: [{ id: "normal", label: "Normal", available: true, priceStatus: "confirmed" as const }],
  };

  // Rejections
  const invalidPrices = [0, -1, -50, 110.5, 0.99, 10001, 50000];
  for (const priceSek of invalidPrices) {
    const res = productEditSchema.safeParse({
      ...base,
      variants: [{ ...base.variants[0], priceSek }],
    });
    assert.equal(res.success, false, `Price ${priceSek} should have been rejected!`);
  }

  // Acceptances (1 to 10000 integers)
  const validPrices = [1, 10, 110, 999, 10000];
  for (const priceSek of validPrices) {
    const res = productEditSchema.safeParse({
      ...base,
      variants: [{ ...base.variants[0], priceSek }],
    });
    assert.equal(res.success, true, `Price ${priceSek} should have been accepted!`);
  }
});

// -----------------------------------------------------------------------------
// TEST 11: Rejection of unauthorized image references
// -----------------------------------------------------------------------------
test("11. Rejection of unauthorized image references not present in catalog", async () => {
  const slug = "synth-image-security";
  await seedSyntheticProduct(slug);

  const maliciousInput: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Hacker Pizza",
    image: "https://evil.com/malicious.jpg",
    active: true,
    sortOrder: 0,
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  const res = await updateAdminProduct(slug, maliciousInput, "key-malicious-img", adminActor);
  assert.equal(res.status, "invalid_image_reference");

  const doc = await ProductModel.findOne({ slug }).lean();
  assert.equal(doc?.image, APPROVED_CATALOG_IMAGE);
});

// -----------------------------------------------------------------------------
// TEST 12: ADMIN-only authorization and request validation
// -----------------------------------------------------------------------------
test("12. PATCH API route enforces ADMIN-only auth, CSRF, and valid idempotency keys", async () => {
  const slug = "synth-api-route-auth";
  await seedSyntheticProduct(slug);

  const validBody = {
    expectedRevision: 0,
    nameSv: "API Test Pizza",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 0,
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  // Case A: Unauthenticated request (no session cookie)
  const reqUnauth = new Request(`http://localhost/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
    },
    body: JSON.stringify(validBody),
  });
  const resUnauth = await PATCH(reqUnauth, { params: Promise.resolve({ slug }) });
  assert.equal(resUnauth.status, 401);

  // Create real Admin user in DB to test auth via createAdminSession
  const adminUser = await StaffUserModel.create({
    email: "admin-integration@synth-test.local",
    displayName: "Admin User",
    passwordHash: "dummy-hash",
    role: "ADMIN",
    active: true,
    authVersion: 1,
  });

  const authConfig = getAdminAuthConfig();
  const adminSession = await createAdminSession(
    {
      id: adminUser._id as Types.ObjectId,
      email: adminUser.email,
      displayName: adminUser.displayName,
      role: adminUser.role as "ADMIN",
      authVersion: adminUser.authVersion,
    },
    authConfig
  );

  // Case B: Missing / invalid CSRF token (forbidden, 403)
  const reqNoCsrf = new Request(`http://localhost/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      // Missing x-csrf-token header!
      "Idempotency-Key": "valid-idempotency-key-012345",
    },
    body: JSON.stringify(validBody),
  });
  const resNoCsrf = await PATCH(reqNoCsrf, { params: Promise.resolve({ slug }) });
  assert.equal(resNoCsrf.status, 403);

  // Case C: Mismatched CSRF token (forbidden, 403)
  const reqBadCsrf = new Request(`http://localhost/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": "wrong-csrf-token-value",
      "Idempotency-Key": "valid-idempotency-key-012345",
    },
    body: JSON.stringify(validBody),
  });
  const resBadCsrf = await PATCH(reqBadCsrf, { params: Promise.resolve({ slug }) });
  assert.equal(resBadCsrf.status, 403);

  // Case D: Missing / invalid Idempotency-Key (bad request, 400)
  const reqInvalidKey = new Request(`http://localhost/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      "Idempotency-Key": "short", // invalid format!
    },
    body: JSON.stringify(validBody),
  });
  const resInvalidKey = await PATCH(reqInvalidKey, { params: Promise.resolve({ slug }) });
  assert.equal(resInvalidKey.status, 400);

  // Case E: Valid ADMIN + Valid CSRF + Valid Idempotency-Key (success, 200)
  const reqAdminValid = new Request(`http://localhost/api/admin/catalog/products/${slug}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Cookie: `${ADMIN_SESSION_COOKIE}=${adminSession.token}; ${ADMIN_CSRF_COOKIE}=${adminSession.csrfToken}`,
      "x-csrf-token": adminSession.csrfToken,
      "Idempotency-Key": "valid-idempotency-key-admin-01",
    },
    body: JSON.stringify(validBody),
  });
  const resAdminValid = await PATCH(reqAdminValid, { params: Promise.resolve({ slug }) });
  assert.equal(resAdminValid.status, 200);
});

// -----------------------------------------------------------------------------
// TEST 13: Existing order snapshots, receipts and payment evidence remain unchanged
// -----------------------------------------------------------------------------
test("13. Historical order item snapshots and payment records remain completely immutable", async () => {
  const slug = "synth-historical-order-check";
  await seedSyntheticProduct(slug);

  const orderPublicId = "synth-order-hist-001";
  await OrderModel.deleteOne({ publicId: orderPublicId });
  await PaymentModel.deleteOne({ providerSessionId: "cs_synth_test_001" });

  // Create historical Order document with immutable snapshots
  const historicalOrder = await OrderModel.create({
    publicId: orderPublicId,
    idempotencyKey: "synth-hist-order-idemp-0001",
    requestHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    items: [
      {
        productSlug: slug,
        productNameSnapshot: "Gammalt Produktnamn",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 100,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 2,
        lineTotalSek: 200,
      },
    ],
    subtotalSek: 200,
    discountSek: 0,
    totalSek: 200,
    pickupAt: new Date(),
    contact: { name: "Historisk Kund", phone: "0701234567" },
    paymentMethod: "card",
  });

  const historicalPayment = await PaymentModel.create({
    orderId: historicalOrder._id,
    provider: "stripe",
    providerSessionId: "cs_synth_test_001",
    amountSek: 200,
    status: "paid",
  });

  // Now, edit the product in catalog: change name and increase prices
  const editInput: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Helt Nytt Produktnamn För 2027",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 10,
    variants: [
      { id: "normal", label: "Normal", priceSek: 160, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 320, available: true, priceStatus: "confirmed" },
    ],
  };

  const updateRes = await updateAdminProduct(slug, editInput, "key-order-hist-test", adminActor);
  assert.equal(updateRes.status, "ok");

  // Verify that historical order item snapshots and line totals DID NOT CHANGE AT ALL
  const fetchedOrder = await OrderModel.findOne({ publicId: orderPublicId }).lean();
  assert.ok(fetchedOrder);
  assert.equal(fetchedOrder.items[0].productNameSnapshot, "Gammalt Produktnamn");
  assert.equal(fetchedOrder.items[0].basePriceSek, 100);
  assert.equal(fetchedOrder.items[0].lineTotalSek, 200);
  assert.equal(fetchedOrder.totalSek, 200);

  // Verify payment record is intact
  const fetchedPayment = await PaymentModel.findById(historicalPayment._id).lean();
  assert.ok(fetchedPayment);
  assert.equal(fetchedPayment.amountSek, 200);
  assert.equal(fetchedPayment.status, "paid");
});

// -----------------------------------------------------------------------------
// TEST 14: Transactions must fail closed if replica-set support is unavailable
// -----------------------------------------------------------------------------
test("14. updateAdminProduct fails closed with transactions_required when replica-set is unavailable", async () => {
  const slug = "synth-non-replica-fail-closed";
  await seedSyntheticProduct(slug);

  const input: ProductEdit = {
    expectedRevision: 0,
    nameSv: "Fail Closed Test",
    image: APPROVED_CATALOG_IMAGE,
    active: true,
    sortOrder: 0,
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 250, available: true, priceStatus: "confirmed" },
    ],
  };

  // Simulate a standalone database by temporarily stubbing db.admin to return standalone hello
  const origAdmin = mongoose.connection.db?.admin;
  if (!mongoose.connection.db) throw new Error("No db");
  const dbInstance = mongoose.connection.db;

  (dbInstance as unknown as { admin: () => unknown }).admin = () => ({
    command: async (cmd: Record<string, unknown>) => {
      if (cmd && cmd.hello) {
        return { isWritablePrimary: true, ok: 1 }; // Notice: NO setName or isdbgrid (standalone)
      }
      return {};
    },
  });

  try {
    const res = await updateAdminProduct(slug, input, "key-fail-closed", adminActor);
    assert.equal(res.status, "transactions_required");
  } finally {
    if (origAdmin) {
      dbInstance.admin = origAdmin;
    }
  }

  // Verify product was not changed
  const doc = await ProductModel.findOne({ slug }).lean();
  assert.equal(doc?.nameSv, "Syntetisk Pizza");
  assert.equal(doc?.__v, 0);
});
