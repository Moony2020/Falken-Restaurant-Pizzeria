import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose, { Types } from "mongoose";
import {
  updateAdminRestaurantSettings,
  type RestaurantSettingsEdit,
} from "../src/server/restaurant-settings-service.ts";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { CategoryModel, ProductModel, ModifierModel } from "../src/server/models/catalog.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import {
  type AdminPrincipal,
  createAdminSession,
  getAdminAuthConfig,
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
} from "../src/server/admin-auth.ts";
import { GET as publicGet } from "../src/app/api/restaurant/settings/route.ts";
import { PATCH as adminPatch } from "../src/app/api/admin/restaurant/settings/route.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Strictly verify that we NEVER connect to Atlas, VeloRider, or any port other
// than our dedicated 27018 test replica set container (falken-mongo-test).
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_restaurant_settings_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActorId = new Types.ObjectId().toString();

const adminActor: AdminPrincipal = {
  id: adminActorId,
  email: "admin-settings@falken-test.local",
  displayName: "Settings Integration Test Admin",
  role: "ADMIN",
};

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-settings-test-secret-min-32-chars-long";

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

  await cleanTestData();
});

beforeEach(async () => {
  await cleanTestData();
});

after(async () => {
  await cleanTestData();
  await mongoose.disconnect();
});

async function cleanTestData() {
  await RestaurantSettingsModel.deleteMany({});
  await AuditLogModel.deleteMany({
    $or: [
      { entity: "RestaurantSettings" },
      { deduplicationKey: /^restaurant-settings-edit/ },
    ],
  });
  await CategoryModel.deleteMany({ slug: /^synth-settings-/ });
  await ProductModel.deleteMany({ slug: /^synth-settings-/ });
  await ModifierModel.deleteMany({ slug: /^synth-settings-/ });
  await OrderModel.deleteMany({ publicId: /^synth-settings-/ });
  await PaymentModel.deleteMany({ providerSessionId: /^cs_synth_settings_/ });
  await StaffUserModel.deleteMany({ email: /@falken-test\.local$/ });
  await StaffSessionModel.deleteMany({});
}

async function seedSettings(overrides: Record<string, unknown> = {}) {
  await RestaurantSettingsModel.deleteMany({});
  const doc = await RestaurantSettingsModel.create({
    _id: "restaurant",
    onlineOrderingEnabled: true,
    manualOverride: null,
    season: "vinter",
    announcement: "Välkommen till Falken!",
    hours: {
      0: { open: "12:00", close: "21:00", closed: false },
      1: { open: "11:00", close: "21:00", closed: false },
    },
    name: "Falken",
    legalName: "Restaurang & Pizzeria Falken",
    tagline: "Restaurang & Pizzeria",
    phone: "019 29 48 98",
    email: "djan_ibrahim@hotmail.com",
    address: {
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
    },
    prepMinutes: 10,
    lastPickupBeforeClose: 15,
    ...overrides,
  });
  if (typeof overrides.__v === "number") {
    await RestaurantSettingsModel.updateOne({ _id: "restaurant" }, { $set: { __v: overrides.__v } });
  }
  return doc;
}

test("1. Successful settings update and atomic AuditLog creation", async () => {
  await seedSettings();

  const input: RestaurantSettingsEdit = {
    expectedRevision: 0,
    name: "Falken Pizzeria & Grill",
    legalName: "Falken Restaurang & Pizzeria AB",
    tagline: "Äkta vedugnsbakat i Vintrosa",
    phone: "019-29 48 98",
    email: "info@restaurangfalken.se",
    address: {
      street: "Skolgatan 4B",
      zip: "719 31",
      city: "Vintrosa",
    },
    prepMinutes: 12,
    lastPickupBeforeClose: 20,
    heroImage: "/images/hero/Hero-image.webp",
  };

  const result = await updateAdminRestaurantSettings(input, adminActor, "idemp-t1-test-key-12345");
  assert.equal(result.status, "ok");
  if (result.status === "ok") {
    assert.equal(result.replayed, false);
    assert.equal(result.settings.name, "Falken Pizzeria & Grill");
    assert.equal(result.settings.legalName, "Falken Restaurang & Pizzeria AB");
    assert.equal(result.settings.phone, "019-29 48 98");
    assert.equal(result.settings.phoneHref, "tel:+4619294898"); // server-derived
    assert.equal(result.settings.address.street, "Skolgatan 4B");
    assert.equal(result.settings.prepMinutes, 12);
    assert.equal(result.settings.lastPickupBeforeClose, 20);
    assert.equal(result.settings.revision, 1);
  }

  // Verify AuditLog record in DB
  const audit = await AuditLogModel.findOne({
    action: "restaurant_settings_updated",
    entity: "RestaurantSettings",
  }).lean();
  assert.ok(audit);
  assert.equal(audit?.actorId, adminActor.id);
  assert.equal((audit?.detail as Record<string, unknown>)?.previousRevision, 0);
  assert.equal((audit?.detail as Record<string, unknown>)?.newRevision, 1);
});

test("2. Atomic rollback leaves RestaurantSettings untouched when AuditLog creation fails", async () => {
  await seedSettings({ name: "Original Namn", __v: 5 });

  const input: RestaurantSettingsEdit = {
    expectedRevision: 5,
    name: "Should Rollback Namn",
  };

  // Mock AuditLogModel.create to throw
  const originalCreate = AuditLogModel.create;
  AuditLogModel.create = (async () => {
    throw new Error("Simulated AuditLog database write failure!");
  }) as unknown as typeof AuditLogModel.create;

  try {
    await assert.rejects(async () => {
      await updateAdminRestaurantSettings(input, adminActor, "idemp-t2-rollback-test-key");
    }, /Simulated AuditLog database write failure!/);

    // Verify DB doc rolled back
    const doc = await RestaurantSettingsModel.findById("restaurant").lean();
    assert.equal(doc?.name, "Original Namn");
    assert.equal(doc?.__v, 5);
  } finally {
    AuditLogModel.create = originalCreate;
  }
});

test("3. Replaying identical request with same Idempotency-Key returns cached result without duplicate audit log", async () => {
  await seedSettings({ __v: 0 });

  const input: RestaurantSettingsEdit = {
    expectedRevision: 0,
    name: "Idempotent Namn",
    phone: "019 11 22 33",
  };
  const key = "idemp-t3-replay-test-key-unique";

  // First call
  const first = await updateAdminRestaurantSettings(input, adminActor, key);
  assert.equal(first.status, "ok");
  if (first.status === "ok") {
    assert.equal(first.replayed, false);
    assert.equal(first.settings.name, "Idempotent Namn");
  }

  // Second identical call
  const second = await updateAdminRestaurantSettings(input, adminActor, key);
  assert.equal(second.status, "ok");
  if (second.status === "ok") {
    assert.equal(second.replayed, true); // replayed!
    assert.equal(second.settings.name, "Idempotent Namn");
    assert.equal(second.settings.phoneHref, "tel:+4619112233");
  }

  // Exactly 1 audit record created
  const audits = await AuditLogModel.find({ entity: "RestaurantSettings" }).lean();
  assert.equal(audits.length, 1);
});

test("4. Using the same Idempotency-Key with modified payload returns 409 idempotency_conflict", async () => {
  await seedSettings({ __v: 0 });

  const input1: RestaurantSettingsEdit = {
    expectedRevision: 0,
    name: "Original Payload",
  };
  const key = "idemp-t4-conflict-key";

  const first = await updateAdminRestaurantSettings(input1, adminActor, key);
  assert.equal(first.status, "ok");

  // Call with different name but same idempotency key
  const input2: RestaurantSettingsEdit = {
    expectedRevision: 0,
    name: "Tampered Payload",
  };
  const second = await updateAdminRestaurantSettings(input2, adminActor, key);
  assert.equal(second.status, "idempotency_conflict");
});

test("5. Stale expectedRevision returns 409 stale_settings with latest server state and prevents overwrite", async () => {
  await seedSettings({ name: "Server Current", __v: 3 });

  const staleInput: RestaurantSettingsEdit = {
    expectedRevision: 1, // stale!
    name: "Stale Attempt",
  };

  const result = await updateAdminRestaurantSettings(staleInput, adminActor, "idemp-t5-stale-key");
  assert.equal(result.status, "stale");
  if (result.status === "stale") {
    assert.equal(result.settings.name, "Server Current");
    assert.equal(result.settings.revision, 3);
  }

  // Document was not overwritten
  const doc = await RestaurantSettingsModel.findById("restaurant").lean();
  assert.equal(doc?.name, "Server Current");
  assert.equal(doc?.__v, 3);
});

test("6. Admin authorization, CSRF, and same-origin protections on PATCH /api/admin/restaurant/settings", async () => {
  await seedSettings({ __v: 0 });

  // Create real test admin session
  const adminUser = await StaffUserModel.create({
    email: "auth-test@falken-test.local",
    displayName: "Auth Test Admin",
    passwordHash: "hash",
    role: "ADMIN",
    active: true,
  });
  const authConfig = getAdminAuthConfig();
  const session = await createAdminSession(
    {
      id: adminUser._id,
      email: adminUser.email,
      displayName: adminUser.displayName,
      role: "ADMIN",
      authVersion: adminUser.authVersion,
    },
    authConfig,
  );

  const validPayload = {
    expectedRevision: 0,
    name: "API Updated Name",
  };

  // Subtest A: Missing auth
  const reqNoAuth = new Request("http://localhost:3000/api/admin/restaurant/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "idemp-t6-noauth-key",
      origin: "http://localhost:3000",
    },
    body: JSON.stringify(validPayload),
  });
  const resNoAuth = await adminPatch(reqNoAuth);
  assert.equal(resNoAuth.status, 401);

  // Subtest B: Missing CSRF
  const reqNoCsrf = new Request("http://localhost:3000/api/admin/restaurant/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "idemp-t6-nocsrf-key",
      origin: "http://localhost:3000",
      cookie: `${ADMIN_SESSION_COOKIE}=${session.token}`,
    },
    body: JSON.stringify(validPayload),
  });
  const resNoCsrf = await adminPatch(reqNoCsrf);
  assert.equal(resNoCsrf.status, 403);

  // Subtest C: Valid auth + valid CSRF + same origin
  const reqValid = new Request("http://localhost:3000/api/admin/restaurant/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "idemp-t6-valid-key",
      origin: "http://localhost:3000",
      cookie: `${ADMIN_SESSION_COOKIE}=${session.token}; ${ADMIN_CSRF_COOKIE}=${session.csrfToken}`,
      "x-csrf-token": session.csrfToken,
    },
    body: JSON.stringify(validPayload),
  });
  const resValid = await adminPatch(reqValid);
  assert.equal(resValid.status, 200);
  const dataValid = await resValid.json();
  assert.equal(dataValid.ok, true);
  assert.equal(dataValid.settings.name, "API Updated Name");
});

test("7. Public GET /api/restaurant/settings exposes updated branding and derived phoneHref with safe fallbacks", async () => {
  await seedSettings({
    name: "Falken Officiell",
    phone: "019 99 88 77",
    email: "kontakt@falken.se",
    address: { street: "Storgatan 1", zip: "719 32", city: "Vintrosa", country: "Sverige" },
    __v: 2,
  });

  const res = await publicGet();
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.name, "Falken Officiell");
  assert.equal(data.phone, "019 99 88 77");
  assert.equal(data.phoneHref, "tel:+4619998877"); // verified server-derived
  assert.equal(data.address.street, "Storgatan 1");
  assert.equal(data.address.city, "Vintrosa");
  assert.equal(data.heroImage, "/images/hero/Hero-image.webp"); // default fallback preserved
  assert.equal(data.contactHeroImage, "/images/gallery/restaurant1.webp"); // default protected asset preserved
  assert.equal(data.prepMinutes, 10);
  assert.equal(data.revision, 2);
});

test("8. Updating branding settings leaves operational fields (onlineOrderingEnabled, manualOverride, hours, season) completely intact", async () => {
  await seedSettings({
    onlineOrderingEnabled: false,
    manualOverride: "closed",
    season: "sommar",
    announcement: "Stängt för renovering vecka 40",
    __v: 1,
  });

  const input: RestaurantSettingsEdit = {
    expectedRevision: 1,
    name: "Brand Updated",
    tagline: "Ny slogan",
  };

  const res = await updateAdminRestaurantSettings(input, adminActor, "idemp-t8-op-preserve-key");
  assert.equal(res.status, "ok");

  // Verify operational fields remained 100% untouched
  const doc = await RestaurantSettingsModel.findById("restaurant").lean();
  assert.equal(doc?.onlineOrderingEnabled, false);
  assert.equal(doc?.manualOverride, "closed");
  assert.equal(doc?.season, "sommar");
  assert.equal(doc?.announcement, "Stängt för renovering vecka 40");
  assert.equal(doc?.name, "Brand Updated");
  assert.equal(doc?.tagline, "Ny slogan");
});

test("9. Updating restaurant settings leaves existing catalog products, categories, modifiers, historical orders, and payments completely untouched", async () => {
  await seedSettings({ __v: 0 });

  // Seed baseline records in other collections
  const cat = await CategoryModel.create({
    slug: "synth-settings-pizza",
    nameSv: "Syntetisk Kategori",
    removable: true,
    sortOrder: 1,
    active: true,
  });
  const prod = await ProductModel.create({
    slug: "synth-settings-vesuvio",
    nameSv: "Syntetisk Vesuvio",
    descriptionSv: "Skinka och ost",
    categorySlug: "synth-settings-pizza",
    variants: [{ id: "normal", label: "Normal", priceSek: 110, priceStatus: "confirmed", available: true }],
    active: true,
    sortOrder: 1,
  });
  const mod = await ModifierModel.create({
    slug: "synth-settings-extra-ost",
    labelSv: "Extra Ost",
    groupSlug: "extra",
    priceByVariantSek: { normal: 15 },
    priceStatus: "confirmed",
    compatibleCategories: ["synth-settings-pizza"],
    active: true,
  });
  const order = await OrderModel.create({
    publicId: "synth-settings-order-01",
    idempotencyKey: "synth-settings-idemp-01",
    requestHash: "0".repeat(64),
    currency: "SEK",
    items: [
      {
        productSlug: prod.slug,
        productNameSnapshot: "Syntetisk Vesuvio Snapshot",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 110,
        modifiersSnapshot: [{ modifierSlug: mod.slug, labelSv: "Extra Ost", priceSek: 15, quantity: 1 }],
        removedIngredients: [],
        note: "",
        lineTotalSek: 125,
        quantity: 1,
        ifUnavailable: "call",
      },
    ],
    subtotalSek: 125,
    discountSek: 0,
    totalSek: 125,
    paymentProvider: "stripe",
    paymentMethod: "card",
    paymentStatus: "paid",
    fulfillmentStatus: "PICKED_UP",
    contact: { name: "Test Kund", phone: "0701234567" },
    pickupAt: new Date(Date.now() + 3600000),
  });
  const payment = await PaymentModel.create({
    orderId: order._id,
    provider: "stripe",
    providerSessionId: "cs_synth_settings_pay_01",
    amountSek: 125,
    currency: "SEK",
    status: "paid",
    processedEventIds: [],
    refundedSek: 0,
  });

  // Now execute settings update
  const settingsInput: RestaurantSettingsEdit = {
    expectedRevision: 0,
    name: "Falken Brand Update",
    phone: "019 55 44 33",
  };
  const updateRes = await updateAdminRestaurantSettings(settingsInput, adminActor, "idemp-t9-cross-collection-key");
  assert.equal(updateRes.status, "ok");

  // Verify all other collections are 100% intact
  const verifiedCat = await CategoryModel.findOne({ slug: cat.slug }).lean();
  assert.equal(verifiedCat?.nameSv, "Syntetisk Kategori");

  const verifiedProd = await ProductModel.findOne({ slug: prod.slug }).lean();
  assert.equal(verifiedProd?.nameSv, "Syntetisk Vesuvio");
  assert.equal(verifiedProd?.variants[0].priceSek, 110);

  const verifiedMod = await ModifierModel.findOne({ slug: mod.slug }).lean();
  const normalPrice = (verifiedMod?.priceByVariantSek as unknown as Record<string, number> | Map<string, number>);
  const priceVal = normalPrice instanceof Map ? normalPrice.get("normal") : (normalPrice as Record<string, number>)?.["normal"];
  assert.equal(priceVal, 15);

  const verifiedOrder = await OrderModel.findOne({ publicId: order.publicId }).lean();
  assert.equal(verifiedOrder?.totalSek, 125);
  assert.equal(verifiedOrder?.items[0].productNameSnapshot, "Syntetisk Vesuvio Snapshot");

  const verifiedPayment = await PaymentModel.findOne({ providerSessionId: payment.providerSessionId }).lean();
  assert.equal(verifiedPayment?.amountSek, 125);
  assert.equal(verifiedPayment?.status, "paid");
});

test("10. Fail-closed behavior returns transactions_required when replica set is missing", async () => {
  const dbInstance = mongoose.connection.db;
  if (!dbInstance) throw new Error("No database connected");
  const origAdmin = dbInstance.admin;

  (dbInstance as unknown as { admin: () => unknown }).admin = () => ({
    command: async (cmd: Record<string, unknown>) => {
      if (cmd && cmd.hello) {
        return { isWritablePrimary: true, ok: 1 }; // Notice: NO setName or isdbgrid (standalone)
      }
      return {};
    },
  });

  try {
    const input: RestaurantSettingsEdit = {
      expectedRevision: 0,
      name: "Fail Closed Attempt",
    };
    const result = await updateAdminRestaurantSettings(input, adminActor, "idemp-t10-fail-closed-key");
    assert.equal(result.status, "transactions_required");
  } finally {
    if (origAdmin) {
      dbInstance.admin = origAdmin;
    }
  }
});
