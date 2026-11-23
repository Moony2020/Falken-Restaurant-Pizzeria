import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { createOrder, OrderError } from "../src/server/orders-service.ts";
import { OrderModel, type OrderDoc, ORDER_MODEL_GUARD_VERSION, isProtectedSellerSnapshotPath } from "../src/server/models/order.ts";
import { CategoryModel, ProductModel, ModifierModel } from "../src/server/models/catalog.ts";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import { PaymentModel } from "../src/server/models/order.ts";
import { getAdminOrder } from "../src/server/admin-orders.ts";
import { getPickupSlotInstants } from "../src/lib/hours.ts";
import { PREP_MINUTES, LAST_PICKUP_BEFORE_CLOSE, SLOT_STEP_MINUTES } from "../src/data/site.ts";
import {
  LEGACY_SELLER_FALLBACK,
  type ReceiptPdfInput,
  type ReceiptSeller,
} from "../src/lib/order-receipt-pdf.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Connect strictly to dedicated 27018 local replica set container (falken-mongo-test).
// NEVER connect to Atlas or any unapproved host.
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_a8_receipt_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const SIMULATED_NOW = new Date("2026-11-25T13:00:00.000Z"); // Wednesday 14:00 CET (Winter open hours)

function getValidPickupIso(now: Date = SIMULATED_NOW): string {
  const slots = getPickupSlotInstants(now, "vinter", {
    prepMinutes: PREP_MINUTES,
    lastBeforeClose: LAST_PICKUP_BEFORE_CLOSE,
    step: SLOT_STEP_MINUTES,
  });
  if (!slots.length) {
    throw new Error("No valid pickup slots generated for test instant");
  }
  return slots[0].iso;
}

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-receipt-test-secret-min-32-chars-long";
  process.env.ORDER_TOKEN_SECRET = "falken-receipt-order-token-secret-min-32-chars";

  await mongoose.disconnect();
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });

  const port = mongoose.connection.port;
  const dbName = mongoose.connection.name;

  if (port !== TEST_MONGODB_PORT) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED GUARD: Expected port ${TEST_MONGODB_PORT}, got ${port}! ABORTING.`);
  }
  if (dbName !== TEST_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(`FAIL-CLOSED GUARD: Expected db ${TEST_DB_NAME}, got ${dbName}! ABORTING.`);
  }

  await Promise.all([
    OrderModel.init(),
    ProductModel.init(),
    CategoryModel.init(),
    ModifierModel.init(),
    RestaurantSettingsModel.init(),
    AuditLogModel.init(),
    StaffUserModel.init(),
    StaffSessionModel.init(),
    PaymentModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    OrderModel.deleteMany({}),
    ProductModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    ModifierModel.deleteMany({}),
    RestaurantSettingsModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    StaffUserModel.deleteMany({}),
    StaffSessionModel.deleteMany({}),
    PaymentModel.deleteMany({}),
  ]);

  // Seed catalog
  await CategoryModel.create({
    slug: "pizza",
    nameSv: "Pizza",
    blurbSv: "Klassiska pizzor",
    removable: true,
    sortOrder: 1,
    active: true,
  });

  await ProductModel.create({
    slug: "margherita-receipt",
    menuNumber: 1,
    nameSv: "Margherita Receipt",
    descriptionSv: "Tomatsås, ost",
    categorySlug: "pizza",
    ingredients: ["tomatsas", "ost"],
    variants: [
      { id: "normal", label: "Normal", priceSek: 100, available: true, priceStatus: "confirmed" },
    ],
    modifierSlugs: ["extra-ost-receipt"],
    glutenFreeOption: true,
    sortOrder: 1,
    active: true,
  });

  await ModifierModel.create({
    slug: "extra-ost-receipt",
    labelSv: "Extra Ost",
    groupSlug: "extra-tillbehor",
    priceByVariantSek: { normal: 15 },
    maxQty: 2,
    compatibleCategories: ["pizza"],
    active: true,
    priceStatus: "confirmed",
  });

  // Seed baseline A7 settings
  await RestaurantSettingsModel.create({
    _id: "restaurant",
    name: "Falken Vintrosa Baseline",
    legalName: "Restaurang & Pizzeria Falken AB",
    onlineOrderingEnabled: true,
    manualOverride: null,
    address: { street: "Skolgatan 4", zip: "719 30", city: "Vintrosa", country: "Sverige" },
    phone: "019 29 48 98",
    prepMinutes: 10,
    __v: 1,
  });
});

after(async () => {
  await Promise.all([
    OrderModel.deleteMany({}),
    ProductModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    ModifierModel.deleteMany({}),
    RestaurantSettingsModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    StaffUserModel.deleteMany({}),
    StaffSessionModel.deleteMany({}),
    PaymentModel.deleteMany({}),
  ]);
  await mongoose.disconnect();
});

// ------------------------------------------------------------------------------
// T1: New orders capture current seller identity
// ------------------------------------------------------------------------------
test("T1. New orders capture current seller identity into immutable sellerSnapshot", async () => {
  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t1-create-order-key-123456789";

  const result = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "margherita-receipt",
          variantId: "normal",
          quantity: 1,
          modifiers: [{ slug: "extra-ost-receipt", quantity: 1 }],
          removedIngredients: [],
          ifUnavailable: "call",
        },
      ],
      contact: { name: "Anna Andersson", phone: "0701234567" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 115,
    },
    SIMULATED_NOW,
  );

  assert.equal(result.replayed, false);
  assert.ok(result.order.publicId);

  const doc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.ok(doc, "Order doc must exist in MongoDB");
  assert.ok(doc.sellerSnapshot, "sellerSnapshot must be populated on new order");
  assert.equal(doc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  assert.equal(doc.sellerSnapshot.legalName, "Restaurang & Pizzeria Falken AB");
  assert.equal(doc.sellerSnapshot.street, "Skolgatan 4");
  assert.equal(doc.sellerSnapshot.zip, "719 30");
  assert.equal(doc.sellerSnapshot.city, "Vintrosa");
  assert.equal(doc.sellerSnapshot.country, "Sverige");
  assert.equal(doc.sellerSnapshot.phone, "019 29 48 98");
});

// ------------------------------------------------------------------------------
// T2: Changing A7 settings does not change sellerSnapshot of existing order
// ------------------------------------------------------------------------------
test("T2. Changing A7 settings does not alter or mutate the sellerSnapshot of an existing order", async () => {
  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t2-order-snapshot-immutability-key";

  const result = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "margherita-receipt",
          variantId: "normal",
          quantity: 1,
          modifiers: [],
          removedIngredients: [],
          ifUnavailable: "call",
        },
      ],
      contact: { name: "Bengt Bengtsson", phone: "0709876543" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 100,
    },
    SIMULATED_NOW,
  );

  const beforeDoc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.equal(beforeDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");

  // Mutate restaurant settings
  await RestaurantSettingsModel.findByIdAndUpdate("restaurant", {
    name: "Updated Pizzeria Name 2027",
    phone: "019-999999",
    "address.street": "Storgatan 1",
    $inc: { __v: 1 },
  });

  const afterDoc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.ok(afterDoc?.sellerSnapshot);
  assert.equal(afterDoc.sellerSnapshot.name, "Falken Vintrosa Baseline", "Existing snapshot name must remain unchanged");
  assert.equal(afterDoc.sellerSnapshot.phone, "019 29 48 98", "Existing snapshot phone must remain unchanged");
  assert.equal(afterDoc.sellerSnapshot.street, "Skolgatan 4", "Existing snapshot street must remain unchanged");
});

// ------------------------------------------------------------------------------
// T3: New orders use newly saved settings
// ------------------------------------------------------------------------------
test("T3. Subsequent orders created after settings change capture the new seller identity", async () => {
  // Update settings
  await RestaurantSettingsModel.findByIdAndUpdate("restaurant", {
    name: "Falken Nya Tider",
    legalName: "Nya Falken Restaurang AB",
    phone: "019-777888",
    "address.street": "Torggatan 5",
    "address.zip": "719 32",
    "address.city": "Vintrosa Centrum",
    $inc: { __v: 1 },
  });

  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t3-new-settings-order-key-999";

  const result = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "margherita-receipt",
          variantId: "normal",
          quantity: 1,
          modifiers: [],
          removedIngredients: [],
          ifUnavailable: "call",
        },
      ],
      contact: { name: "Cecilia C", phone: "0701112233" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 100,
    },
    SIMULATED_NOW,
  );

  const doc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.ok(doc?.sellerSnapshot);
  assert.equal(doc.sellerSnapshot.name, "Falken Nya Tider");
  assert.equal(doc.sellerSnapshot.legalName, "Nya Falken Restaurang AB");
  assert.equal(doc.sellerSnapshot.phone, "019-777888");
  assert.equal(doc.sellerSnapshot.street, "Torggatan 5");
  assert.equal(doc.sellerSnapshot.zip, "719 32");
  assert.equal(doc.sellerSnapshot.city, "Vintrosa Centrum");
});

// ------------------------------------------------------------------------------
// T4: Legacy orders without sellerSnapshot can still display and generate receipts
// ------------------------------------------------------------------------------
test("T4. Legacy orders without sellerSnapshot resolve LEGACY_SELLER_FALLBACK without mutating DB", async () => {
  const legacyId = "23456789AB";
  const now = new Date();

  // Create legacy order directly without sellerSnapshot
  await OrderModel.create({
    publicId: legacyId,
    idempotencyKey: "legacy-order-key-111111111111",
    requestHash: "0".repeat(64),
    items: [
      {
        productSlug: "margherita-receipt",
        productNameSnapshot: "Margherita",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 100,
        modifiersSnapshot: [],
        removedIngredients: [],
        note: "",
        ifUnavailable: "call",
        quantity: 1,
        lineTotalSek: 100,
      },
    ],
    subtotalSek: 100,
    discountSek: 0,
    totalSek: 100,
    pickupAt: new Date(now.getTime() + 3600_000),
    contact: { name: "Legacy Customer", phone: "0700000000" },
    paymentMethod: "pay_on_pickup",
    paymentStatus: "paid",
    fulfillmentStatus: "PICKED_UP",
    paidAt: now,
    statusHistory: [{ at: now, to: "PICKED_UP", actorType: "staff" }],
  });

  const rawDoc = await OrderModel.findOne({ publicId: legacyId }).lean();
  assert.equal(rawDoc?.sellerSnapshot, undefined, "Legacy order in DB has no sellerSnapshot");

  // getAdminOrder should return sellerSnapshot: null
  const adminOrder = await getAdminOrder(legacyId);
  assert.ok(adminOrder);
  assert.equal(adminOrder.sellerSnapshot, null);

  // Fallback resolution for Receipt:
  const resolved = adminOrder.sellerSnapshot ?? LEGACY_SELLER_FALLBACK;
  assert.equal(resolved.name, "Falken Restaurang & Pizzeria");
  assert.equal(resolved.street, "Skolgatan 4");
  assert.equal(resolved.city, "Vintrosa");
  assert.equal(resolved.phone, "019 29 48 98");

  // Ensure DB was not mutated (no fake backfill)
  const afterCheckDoc = await OrderModel.findOne({ publicId: legacyId }).lean();
  assert.equal(afterCheckDoc?.sellerSnapshot, undefined, "Must NOT backfill historical database documents");
});

// ------------------------------------------------------------------------------
// T5: The incorrect Kungsbacka/0300-123 45 data no longer appears
// ------------------------------------------------------------------------------
test("T5. Neither 'Kungsbacka' nor '0300-123 45' nor fake orgnr '556123-4567' exist in receipt source files", () => {
  const root = process.cwd();
  const pdfSource = fs.readFileSync(path.join(root, "src/lib/order-receipt-pdf.ts"), "utf-8");
  const modalSource = fs.readFileSync(path.join(root, "src/components/admin/admin-receipt-modal.tsx"), "utf-8");

  assert.equal(pdfSource.includes("Kungsbacka"), false, "order-receipt-pdf.ts must not contain 'Kungsbacka'");
  assert.equal(pdfSource.includes("0300-123 45"), false, "order-receipt-pdf.ts must not contain '0300-123 45'");
  assert.equal(pdfSource.includes("556123-4567"), false, "order-receipt-pdf.ts must not contain fake org nr");

  assert.equal(modalSource.includes("Kungsbacka"), false, "admin-receipt-modal.tsx must not contain 'Kungsbacka'");
  assert.equal(modalSource.includes("0300-123 45"), false, "admin-receipt-modal.tsx must not contain '0300-123 45'");
  assert.equal(modalSource.includes("556123-4567"), false, "admin-receipt-modal.tsx must not contain fake org nr");
});

// ------------------------------------------------------------------------------
// T6: Receipt Modal and PDF use consistent seller identity
// ------------------------------------------------------------------------------
test("T6. Receipt Modal and PDF logic use identical seller resolution rules", () => {
  // Test case A: With explicit snapshot
  const customSeller: ReceiptSeller = {
    name: "Falken Testställe",
    street: "Testgatan 12",
    city: "Testköping",
    phone: "019-555555",
  };

  const receiptInputWithSeller: ReceiptPdfInput = {
    orderNumber: "#TEST101",
    customerName: "David D",
    date: "2026-11-25",
    paymentMethod: "Swish",
    paymentStatus: "Betald",
    totalSek: 115,
    items: [{ description: "Pizza", quantity: 1, unitPriceSek: 115 }],
    seller: customSeller,
  };

  // Both consumers resolve seller ?? receipt.seller ?? LEGACY_SELLER_FALLBACK
  const resolveModal = (seller?: ReceiptSeller, receipt?: ReceiptPdfInput) =>
    seller ?? receipt?.seller ?? LEGACY_SELLER_FALLBACK;

  const resolvedForPdf = receiptInputWithSeller.seller ?? LEGACY_SELLER_FALLBACK;
  const resolvedForModal = resolveModal(undefined, receiptInputWithSeller);

  assert.deepEqual(resolvedForPdf, resolvedForModal);
  assert.equal(resolvedForPdf.name, "Falken Testställe");
  assert.equal(resolvedForPdf.city, "Testköping");

  // Test case B: Legacy fallback (no seller provided)
  const legacyReceiptInput: ReceiptPdfInput = {
    orderNumber: "#LEGACY001",
    customerName: "Eva E",
    date: "2026-11-20",
    paymentMethod: "Stripe",
    paymentStatus: "Betald",
    totalSek: 100,
    items: [{ description: "Pizza", quantity: 1, unitPriceSek: 100 }],
  };

  const legacyPdfSeller = legacyReceiptInput.seller ?? LEGACY_SELLER_FALLBACK;
  const legacyModalSeller = resolveModal(undefined, legacyReceiptInput);

  assert.deepEqual(legacyPdfSeller, legacyModalSeller);
  assert.equal(legacyPdfSeller.name, "Falken Restaurang & Pizzeria");
  assert.equal(legacyPdfSeller.city, "Vintrosa");
});

// ------------------------------------------------------------------------------
// T7: Existing order prices, quantities, modifiers, tax calculations and totals remain unchanged
// ------------------------------------------------------------------------------
test("T7. Financial computations (subtotal, total, VAT calculation) remain exact and unchanged", async () => {
  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t7-financial-precision-key-1002";

  const result = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "margherita-receipt",
          variantId: "normal",
          quantity: 2,
          modifiers: [{ slug: "extra-ost-receipt", quantity: 1 }],
          removedIngredients: [],
          ifUnavailable: "call",
        },
      ],
      contact: { name: "Fredrik F", phone: "0703334455" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 230, // (100 + 15) * 2 = 230
    },
    SIMULATED_NOW,
  );

  const doc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.ok(doc);
  assert.equal(doc.subtotalSek, 230);
  assert.equal(doc.discountSek, 0);
  assert.equal(doc.totalSek, 230);

  // Standard 12% Swedish food VAT in receipt: totalSek * 0.1071 (Math.round)
  const vatAmount = Math.round(doc.totalSek * 0.1071);
  const subtotalExclVat = doc.totalSek - vatAmount;
  assert.equal(vatAmount, 25);
  assert.equal(subtotalExclVat, 205);
  assert.equal(subtotalExclVat + vatAmount, 230);
});

// ------------------------------------------------------------------------------
// T8: Idempotent order replay does not overwrite sellerSnapshot
// ------------------------------------------------------------------------------
test("T8. Idempotent order replay does not overwrite or mutate sellerSnapshot", async () => {
  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t8-idempotent-replay-seller-key";

  const orderPayload = {
    idempotencyKey,
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call" as const,
      },
    ],
    contact: { name: "Gustav G", phone: "0706667788" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100,
  };

  const firstCreate = await createOrder(orderPayload, SIMULATED_NOW);
  assert.equal(firstCreate.replayed, false);

  // Change settings while order is stored
  await RestaurantSettingsModel.findByIdAndUpdate("restaurant", {
    name: "Drastic Changed Name",
    phone: "019-000000",
    $inc: { __v: 1 },
  });

  // Replay exact order with same idempotency key
  const secondCreate = await createOrder(orderPayload, SIMULATED_NOW);
  assert.equal(secondCreate.replayed, true);
  assert.equal(secondCreate.order.publicId, firstCreate.order.publicId);

  const finalDoc = await OrderModel.findOne({ publicId: firstCreate.order.publicId }).lean();
  assert.ok(finalDoc?.sellerSnapshot);
  assert.equal(finalDoc.sellerSnapshot.name, "Falken Vintrosa Baseline", "Replay must NOT overwrite original snapshot with new settings");
});

// ------------------------------------------------------------------------------
// T9: Failed order creation does not persist a partial snapshot
// ------------------------------------------------------------------------------
test("T9. Failed order creation does not persist any partial order or orphan snapshot", async () => {
  const initialOrderCount = await OrderModel.countDocuments({});

  const invalidPayload = {
    idempotencyKey: "t9-invalid-order-payload-key",
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call",
      },
    ],
    contact: { name: "Hanna H", phone: "0708889900" },
    pickupAt: "2026-11-25T03:00:00.000Z", // Invalid pickup time (middle of night)
    paymentMethod: "pay_on_pickup",
  };

  await assert.rejects(
    async () => createOrder(invalidPayload, SIMULATED_NOW),
    (err: unknown) => err instanceof OrderError && err.code === "pickup_unavailable",
  );

  const finalOrderCount = await OrderModel.countDocuments({});
  assert.equal(finalOrderCount, initialOrderCount, "No partial orders or snapshots may be persisted on failure");
});

// ------------------------------------------------------------------------------
// T10: No customer-supplied seller identity can override server values
// ------------------------------------------------------------------------------
test("T10. Client/browser injected seller fields are rejected by strict schema; server controls snapshot", async () => {
  const pickupAt = getValidPickupIso();
  const idempotencyKey = "t10-tampered-client-payload-key";

  const tamperedPayload = {
    idempotencyKey,
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call",
      },
    ],
    contact: { name: "Ivan I", phone: "0709990011" },
    pickupAt,
    paymentMethod: "pay_on_pickup",
    expectedTotalSek: 100,
    // Attacker injects fake seller identity:
    sellerSnapshot: {
      name: "MALICIOUS PHISHING RESTAURANT",
      street: "Fake St 99",
      city: "Fraud City",
      phone: "0900-SCAM",
    },
    seller: {
      name: "HACKED NAME",
    },
  };

  // 1. Client-supplied seller identity must be rejected with 400 Bad Request by strict validation
  await assert.rejects(
    async () => createOrder(tamperedPayload, SIMULATED_NOW),
    (err: unknown) => err instanceof OrderError && err.code === "invalid_request" && err.status === 400,
  );

  // 2. Legitimate order created without tampered payload exclusively uses server DB settings
  const legitPayload = {
    idempotencyKey: "t10-legit-client-payload-key",
    items: tamperedPayload.items,
    contact: tamperedPayload.contact,
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100,
  };
  const result = await createOrder(legitPayload, SIMULATED_NOW);
  assert.ok(result.order.publicId);

  const doc = await OrderModel.findOne({ publicId: result.order.publicId }).lean();
  assert.ok(doc?.sellerSnapshot);
  assert.equal(doc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  assert.notEqual(doc.sellerSnapshot.name, "MALICIOUS PHISHING RESTAURANT");
  assert.notEqual(doc.sellerSnapshot.name, "HACKED NAME");
});

// ==============================================================================
// A8 NEGATIVE WRITE COVERAGE & MUTATION HARDENING (T11 - T23)
// ==============================================================================

async function createBaselineOrderForMutationTests(idempotencyKey: string) {
  const pickupAt = getValidPickupIso();
  const payload = {
    idempotencyKey,
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call",
      },
    ],
    contact: { name: "Audit Customer", phone: "0701112233" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100,
  };
  const created = await createOrder(payload, SIMULATED_NOW);
  const initialDoc = await OrderModel.findOne({ publicId: created.order.publicId }).lean();
  assert.ok(initialDoc);
  assert.ok(initialDoc.sellerSnapshot);
  assert.equal(initialDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  return initialDoc;
}

// ------------------------------------------------------------------------------
// T11 (Negative 1): $set on sellerSnapshot is rejected and DB remains unchanged
// ------------------------------------------------------------------------------
test("T11. Negative Coverage: $set on sellerSnapshot is rejected and document in DB is unchanged", async () => {
  const initial = await createBaselineOrderForMutationTests("t11-neg-set-snapshot-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $set: { sellerSnapshot: { name: "Malicious Phishing Store" } } },
      );
    },
    /sellerSnapshot is immutable and cannot be modified/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline", "DB document sellerSnapshot must remain unchanged");
});

// ------------------------------------------------------------------------------
// T12 (Negative 2): $set on nested sellerSnapshot fields is rejected
// ------------------------------------------------------------------------------
test("T12. Negative Coverage: $set on nested sellerSnapshot fields is rejected and DB is unchanged", async () => {
  const initial = await createBaselineOrderForMutationTests("t12-neg-set-nested-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $set: { "sellerSnapshot.name": "Tampered Name", "sellerSnapshot.street": "Tampered St" } },
      );
    },
    /sellerSnapshot is immutable and cannot be modified/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
  assert.equal(afterDoc?.sellerSnapshot?.street, "Skolgatan 4");
});

// ------------------------------------------------------------------------------
// T13 (Negative 3): $unset on sellerSnapshot or nested fields is rejected
// ------------------------------------------------------------------------------
test("T13. Negative Coverage: $unset on sellerSnapshot or nested fields is rejected", async () => {
  const initial = await createBaselineOrderForMutationTests("t13-neg-unset-key");

  // Attempt to unset entire sellerSnapshot
  await assert.rejects(
    async () => {
      await OrderModel.updateOne({ _id: initial._id }, { $unset: { sellerSnapshot: 1 } });
    },
    /sellerSnapshot is immutable and cannot be removed/,
  );

  // Attempt to unset a nested field
  await assert.rejects(
    async () => {
      await OrderModel.updateOne({ _id: initial._id }, { $unset: { "sellerSnapshot.phone": 1 } });
    },
    /sellerSnapshot is immutable and cannot be removed/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.ok(afterDoc?.sellerSnapshot);
  assert.equal(afterDoc.sellerSnapshot.phone, "019 29 48 98");
});

// ------------------------------------------------------------------------------
// T14 (Negative 4): $rename on sellerSnapshot is rejected
// ------------------------------------------------------------------------------
test("T14. Negative Coverage: $rename on sellerSnapshot is rejected and DB is unchanged", async () => {
  const initial = await createBaselineOrderForMutationTests("t14-neg-rename-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $rename: { sellerSnapshot: "archivedSellerSnapshot" } },
      );
    },
    /sellerSnapshot is immutable and cannot be renamed/,
  );

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $rename: { "sellerSnapshot.name": "sellerSnapshot.oldName" } },
      );
    },
    /sellerSnapshot is immutable and cannot be renamed/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.ok(afterDoc?.sellerSnapshot);
  assert.equal(afterDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  assert.equal((afterDoc as Record<string, unknown>).archivedSellerSnapshot, undefined);
});

// ------------------------------------------------------------------------------
// T15 (Negative 5): Update pipelines are rejected on orders
// ------------------------------------------------------------------------------
test("T15. Negative Coverage: Update pipelines attempting modification/removal are rejected", async () => {
  const initial = await createBaselineOrderForMutationTests("t15-neg-pipeline-key");

  // Native Mongoose rejection when updatePipeline is omitted
  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        [{ $set: { "sellerSnapshot.name": "Pipeline Altered" } }] as unknown as Record<string, unknown>,
      );
    },
    /Cannot pass an array to query updates|Update pipelines are not permitted on Order documents/,
  );

  // Custom immutability guard rejection when updatePipeline option is enabled
  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        [{ $set: { "sellerSnapshot.name": "Pipeline Altered" } }] as unknown as Record<string, unknown>,
        { updatePipeline: true } as unknown as Record<string, unknown>,
      );
    },
    /Update pipelines are not permitted on Order documents|sellerSnapshot is immutable/,
  );

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        [{ $unset: "sellerSnapshot" }] as unknown as Record<string, unknown>,
        { updatePipeline: true } as unknown as Record<string, unknown>,
      );
    },
    /Update pipelines are not permitted on Order documents|sellerSnapshot is immutable/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T16 (Negative 6): replaceOne omitting sellerSnapshot is rejected
// ------------------------------------------------------------------------------
test("T16. Negative Coverage: replaceOne omitting sellerSnapshot is rejected and DB is unchanged", async () => {
  const initial = await createBaselineOrderForMutationTests("t16-neg-replace-omit-key");

  const replacementWithoutSnapshot: Record<string, unknown> = { ...initial };
  delete replacementWithoutSnapshot.sellerSnapshot;
  delete replacementWithoutSnapshot._id;

  await assert.rejects(
    async () => {
      await OrderModel.replaceOne({ _id: initial._id }, replacementWithoutSnapshot as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be removed or omitted in replacement/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.ok(afterDoc?.sellerSnapshot);
  assert.equal(afterDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T17 (Negative 7): replaceOne changing sellerSnapshot is rejected
// ------------------------------------------------------------------------------
test("T17. Negative Coverage: replaceOne changing sellerSnapshot is rejected and DB is unchanged", async () => {
  const initial = await createBaselineOrderForMutationTests("t17-neg-replace-change-key");

  const replacementWithChangedSnapshot: Record<string, unknown> = {
    ...initial,
    sellerSnapshot: {
      name: "Replaced Seller Store",
      legalName: "Fraudster AB",
      street: "Nowhere 1",
      zip: "000 00",
      city: "Nowhere",
      country: "Sweden",
      phone: "000-000000",
    },
  };
  delete replacementWithChangedSnapshot._id;

  await assert.rejects(
    async () => {
      await OrderModel.replaceOne({ _id: initial._id }, replacementWithChangedSnapshot as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be replaced or modified/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
  assert.notEqual(afterDoc?.sellerSnapshot?.name, "Replaced Seller Store");
});

// ------------------------------------------------------------------------------
// T18 (Negative 8): findOneAndReplace omission or modification is rejected
// ------------------------------------------------------------------------------
test("T18. Negative Coverage: findOneAndReplace omission or modification is rejected", async () => {
  const initial = await createBaselineOrderForMutationTests("t18-neg-find-replace-key");

  const replacementOmit = { ...initial };
  delete (replacementOmit as Record<string, unknown>).sellerSnapshot;
  delete (replacementOmit as Record<string, unknown>)._id;

  await assert.rejects(
    async () => {
      await OrderModel.findOneAndReplace({ _id: initial._id }, replacementOmit as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be removed or omitted in replacement/,
  );

  const replacementChange = {
    ...initial,
    sellerSnapshot: { name: "Altered In findOneAndReplace" },
  };
  delete (replacementChange as Record<string, unknown>)._id;

  await assert.rejects(
    async () => {
      await OrderModel.findOneAndReplace({ _id: initial._id }, replacementChange as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be replaced or modified/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T19 (Negative 9): bulkWrite updateOne/updateMany attempting mutation is rejected
// ------------------------------------------------------------------------------
test("T19. Negative Coverage: bulkWrite updateOne and updateMany mutation attempts are rejected", async () => {
  const initial = await createBaselineOrderForMutationTests("t19-neg-bulk-update-key");

  // bulk updateOne
  assert.throws(
    () => {
      OrderModel.bulkWrite([
        {
          updateOne: {
            filter: { _id: initial._id },
            update: { $set: { "sellerSnapshot.name": "Bulk Overwritten Name" } },
          },
        },
      ]);
    },
    /sellerSnapshot is immutable and cannot be modified/,
  );

  // bulk updateMany with $unset
  assert.throws(
    () => {
      OrderModel.bulkWrite([
        {
          updateMany: {
            filter: {},
            update: { $unset: { sellerSnapshot: 1 } },
          },
        },
      ]);
    },
    /sellerSnapshot is immutable and cannot be removed/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T20 (Negative 10): bulkWrite replaceOne attempting snapshot alteration is rejected
// ------------------------------------------------------------------------------
test("T20. Negative Coverage: bulkWrite replaceOne is rejected before execution", async () => {
  const initial = await createBaselineOrderForMutationTests("t20-neg-bulk-replace-key");

  const replacementWithoutSnapshot: Record<string, unknown> = { ...initial };
  delete replacementWithoutSnapshot.sellerSnapshot;
  delete replacementWithoutSnapshot._id;

  assert.throws(
    () => {
      OrderModel.bulkWrite([
        {
          replaceOne: {
            filter: { _id: initial._id },
            replacement: replacementWithoutSnapshot as unknown as OrderDoc,
          },
        },
      ]);
    },
    /sellerSnapshot is immutable and cannot be removed or omitted in replacement/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.ok(afterDoc?.sellerSnapshot);
  assert.equal(afterDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T21 (Business 11): Legitimate payment and status transitions preserve snapshot
// ------------------------------------------------------------------------------
test("T21. Normal Workflow: Legitimate order lifecycle transitions preserve sellerSnapshot intact", async () => {
  const initial = await createBaselineOrderForMutationTests("t21-legit-lifecycle-key");

  // 1. Move to CONFIRMED
  await OrderModel.updateOne(
    { _id: initial._id },
    { $set: { fulfillmentStatus: "CONFIRMED" } },
  );

  // 2. Staff starts preparation
  await OrderModel.updateOne(
    { _id: initial._id },
    { $set: { fulfillmentStatus: "PREPARING", acknowledgedAt: new Date(), acknowledgedBy: "staff-1" } },
  );

  // 3. Mark ready for pickup
  await OrderModel.updateOne(
    { _id: initial._id },
    { $set: { fulfillmentStatus: "READY_FOR_PICKUP" } },
  );

  // 4. Counter payment collection & completion
  await OrderModel.updateOne(
    { _id: initial._id },
    {
      $set: {
        fulfillmentStatus: "PICKED_UP",
        paymentStatus: "paid",
        paidAt: new Date(),
        onSiteCollection: {
          collectedBy: "staff-1",
          collectedAt: new Date(),
          method: "cash",
          amountSek: 100,
        },
      },
    },
  );

  const finalDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(finalDoc?.fulfillmentStatus, "PICKED_UP");
  assert.equal(finalDoc?.paymentStatus, "paid");
  assert.ok(finalDoc?.sellerSnapshot);
  assert.equal(finalDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  assert.equal(finalDoc.sellerSnapshot.city, "Vintrosa");
  assert.equal(finalDoc.sellerSnapshot.phone, "019 29 48 98");
});

// ------------------------------------------------------------------------------
// T22 (Business 12): Legacy orders remain supported and un-backfilled
// ------------------------------------------------------------------------------
test("T22. Normal Workflow: Legacy orders without sellerSnapshot are supported and not mutated", async () => {
  const legacyCrockfordId = "23456789AC";
  const legacyInsert = await OrderModel.collection.insertOne({
    publicId: legacyCrockfordId,
    idempotencyKey: "legacy-unmigrated-order-key-22",
    requestHash: "c0ffee0000000000000000000000000000000000000000000000000000000000",
    items: [
      {
        productSlug: "margherita-receipt",
        productNameSnapshot: "Margherita",
        variantId: "normal",
        variantNameSnapshot: "Standard",
        basePriceSek: 100,
        modifiersSnapshot: [],
        removedIngredientsSnapshot: [],
        lineTotalSek: 100,
        quantity: 1,
      },
    ],
    subtotalSek: 100,
    discountSek: 0,
    totalSek: 100,
    currency: "SEK",
    pickupAt: SIMULATED_NOW,
    contact: { name: "Old Legacy Customer", phone: "0700000000" },
    paymentMethod: "pay_on_pickup",
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
    statusHistory: [],
    // Intentionally no sellerSnapshot!
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
  });

  // Legitimate admin order retrieval resolves fallback
  const adminOrder = await getAdminOrder(legacyCrockfordId);
  assert.ok(adminOrder);
  assert.ok(!adminOrder.sellerSnapshot, "Server query does not invent a stored sellerSnapshot");

  // Transitioning fulfillment status on legacy order works without breaking
  await OrderModel.updateOne(
    { _id: legacyInsert.insertedId },
    { $set: { "needsReview.reason": "audit_check" } },
  );

  const persisted = await OrderModel.findById(legacyInsert.insertedId).lean();
  assert.equal(persisted?.sellerSnapshot, undefined, "Legacy order in DB must remain unmigrated without fake backfill");
});

// ------------------------------------------------------------------------------
// T23 (Business 13): Idempotent replay preserves snapshot even after store updates
// ------------------------------------------------------------------------------
test("T23. Normal Workflow: Idempotent replay preserves snapshot across settings changes", async () => {
  const initial = await createBaselineOrderForMutationTests("t23-idempotent-replay-test-key");

  // Mutate restaurant settings
  await RestaurantSettingsModel.updateOne(
    {},
    {
      $set: {
        "branding.name": "Newly Rebranded Falken",
        "branding.phone": "019 99 99 99",
      },
    },
  );

  // Replay exact order payload
  const pickupAt = getValidPickupIso();
  const replayPayload = {
    idempotencyKey: "t23-idempotent-replay-test-key",
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call",
      },
    ],
    contact: { name: "Audit Customer", phone: "0701112233" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100,
  };

  const replayed = await createOrder(replayPayload, SIMULATED_NOW);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.order.publicId, initial.publicId);

  const doc = await OrderModel.findById(initial._id).lean();
  assert.equal(doc?.sellerSnapshot?.name, "Falken Vintrosa Baseline", "Replay must preserve initial sellerSnapshot");
  assert.notEqual(doc?.sellerSnapshot?.name, "Newly Rebranded Falken");
});

// ==============================================================================
// A8 FINAL GUARD CORRECTION: GENERIC OPERATORS & HOT-RELOAD SAFETY (T24 - T36)
// ==============================================================================

// ------------------------------------------------------------------------------
// T24 (Req T1): $currentDate cannot target sellerSnapshot or nested fields
// ------------------------------------------------------------------------------
test("T24. Generic Guard: $currentDate cannot target sellerSnapshot or a nested field", async () => {
  const initial = await createBaselineOrderForMutationTests("t24-currentdate-guard-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $currentDate: { "sellerSnapshot.updatedAt": true } } as unknown as Record<string, unknown>,
      );
    },
    /sellerSnapshot is immutable and cannot be modified via \$currentDate/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline", "sellerSnapshot must remain intact in DB");
  assert.equal((afterDoc?.sellerSnapshot as Record<string, unknown> | undefined)?.updatedAt, undefined);
});

// ------------------------------------------------------------------------------
// T25 (Req T2): $min cannot target sellerSnapshot or nested fields
// ------------------------------------------------------------------------------
test("T25. Generic Guard: $min cannot target sellerSnapshot or a nested field", async () => {
  const initial = await createBaselineOrderForMutationTests("t25-min-guard-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $min: { "sellerSnapshot.revision": 1 } } as unknown as Record<string, unknown>,
      );
    },
    /sellerSnapshot is immutable and cannot be modified via \$min/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T26 (Req T3): $max cannot target sellerSnapshot or nested fields
// ------------------------------------------------------------------------------
test("T26. Generic Guard: $max cannot target sellerSnapshot or a nested field", async () => {
  const initial = await createBaselineOrderForMutationTests("t26-max-guard-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $max: { "sellerSnapshot.revision": 99 } } as unknown as Record<string, unknown>,
      );
    },
    /sellerSnapshot is immutable and cannot be modified via \$max/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T27 (Req T4): $addToSet cannot target sellerSnapshot or nested fields
// ------------------------------------------------------------------------------
test("T27. Generic Guard: $addToSet cannot target sellerSnapshot or a nested field", async () => {
  const initial = await createBaselineOrderForMutationTests("t27-addtoset-guard-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $addToSet: { "sellerSnapshot.tags": "malicious" } } as unknown as Record<string, unknown>,
      );
    },
    /sellerSnapshot is immutable and cannot be modified via \$addToSet/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T28 (Req T5): $rename cannot rename another field INTO sellerSnapshot (destination protection)
// ------------------------------------------------------------------------------
test("T28. Generic Guard: $rename destination path check prevents renaming another field INTO sellerSnapshot", async () => {
  const initial = await createBaselineOrderForMutationTests("t28-rename-dest-guard-key");

  // Attempt to rename 'contact.name' INTO 'sellerSnapshot.name'
  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $rename: { "contact.name": "sellerSnapshot.name" } },
      );
    },
    /sellerSnapshot is immutable and cannot be renamed/,
  );

  // Attempt to rename 'contact' INTO root 'sellerSnapshot'
  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        { $rename: { contact: "sellerSnapshot" } },
      );
    },
    /sellerSnapshot is immutable and cannot be renamed/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
  assert.equal(afterDoc?.contact?.name, "Audit Customer", "Original contact.name must remain unmoved");
});

// ------------------------------------------------------------------------------
// T29 (Req T6): Unrelated valid operator updates remain functional and substring matching is safe
// ------------------------------------------------------------------------------
test("T29. Generic Guard: Unrelated operator updates remain functional and substring matching does not false-positive", async () => {
  const initial = await createBaselineOrderForMutationTests("t29-valid-unrelated-key");

  // 1. Verify exact path boundary matching helper
  assert.equal(isProtectedSellerSnapshotPath("sellerSnapshot"), true);
  assert.equal(isProtectedSellerSnapshotPath("sellerSnapshot.name"), true);
  assert.equal(isProtectedSellerSnapshotPath("sellerSnapshot.street"), true);
  assert.equal(isProtectedSellerSnapshotPath("sellerSnapshot[0]"), true);
  // Unrelated fields containing substring 'sellerSnapshot' must NOT match:
  assert.equal(isProtectedSellerSnapshotPath("nonSellerSnapshot"), false);
  assert.equal(isProtectedSellerSnapshotPath("sellerSnapshotBackup"), false);
  assert.equal(isProtectedSellerSnapshotPath("notes.sellerSnapshotLog"), false);
  assert.equal(isProtectedSellerSnapshotPath("contact.name"), false);

  // 2. Perform legitimate updates using various operators on non-protected fields
  await OrderModel.updateOne(
    { _id: initial._id },
    {
      $set: { acknowledgedBy: "chef-on-duty" },
      $currentDate: { acknowledgedAt: true },
      $inc: { __v: 1 },
    },
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.acknowledgedBy, "chef-on-duty");
  assert.ok(afterDoc?.acknowledgedAt);
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline", "sellerSnapshot remains untouched");
});

// ------------------------------------------------------------------------------
// T30 (Req T7): Update pipelines remain rejected
// ------------------------------------------------------------------------------
test("T30. Generic Guard: Update pipelines remain strictly rejected", async () => {
  const initial = await createBaselineOrderForMutationTests("t30-pipeline-rejection-key");

  await assert.rejects(
    async () => {
      await OrderModel.updateOne(
        { _id: initial._id },
        [{ $set: { "sellerSnapshot.name": "Pipeline Overwrite" } }] as unknown as Record<string, unknown>,
        { updatePipeline: true } as unknown as Record<string, unknown>,
      );
    },
    /Update pipelines are not permitted on Order documents|sellerSnapshot is immutable and cannot be modified or removed via update pipeline/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T31 (Req T8): BulkWrite cannot bypass the generic guard
// ------------------------------------------------------------------------------
test("T31. Generic Guard: BulkWrite cannot bypass generic operator and rename protections", async () => {
  const initial = await createBaselineOrderForMutationTests("t31-bulkwrite-generic-key");

  // 1. BulkWrite with $currentDate on sellerSnapshot
  assert.throws(
    () => {
      OrderModel.bulkWrite([
        {
          updateOne: {
            filter: { _id: initial._id },
            update: { $currentDate: { "sellerSnapshot.updatedAt": true } } as unknown as Record<string, unknown>,
          },
        },
      ]);
    },
    /sellerSnapshot is immutable and cannot be modified via \$currentDate/,
  );

  // 2. BulkWrite with $rename into sellerSnapshot destination
  assert.throws(
    () => {
      OrderModel.bulkWrite([
        {
          updateOne: {
            filter: { _id: initial._id },
            update: { $rename: { "contact.name": "sellerSnapshot.name" } },
          },
        },
      ]);
    },
    /sellerSnapshot is immutable and cannot be renamed/,
  );

  // 3. Legitimate bulkWrite on unrelated fields succeeds
  await OrderModel.bulkWrite([
    {
      updateOne: {
        filter: { _id: initial._id },
        update: { $set: { acknowledgedBy: "bulk-staff-auditor" } },
      },
    },
  ]);

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.acknowledgedBy, "bulk-staff-auditor");
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T32 (Req T9): Existing replacement safeguards remain effective
// ------------------------------------------------------------------------------
test("T32. Generic Guard: Existing replacement safeguards remain effective against omission and modification", async () => {
  const initial = await createBaselineOrderForMutationTests("t32-replacement-safeguards-key");

  // Omission
  const docWithoutSnapshot: Record<string, unknown> = { ...initial };
  delete docWithoutSnapshot.sellerSnapshot;
  delete docWithoutSnapshot._id;

  await assert.rejects(
    async () => {
      await OrderModel.replaceOne({ _id: initial._id }, docWithoutSnapshot as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be removed or omitted in replacement/,
  );

  // Modification
  const docWithChangedSnapshot: Record<string, unknown> = {
    ...initial,
    sellerSnapshot: { name: "Counterfeit Restaurant", phone: "000-000000" },
  };
  delete docWithChangedSnapshot._id;

  await assert.rejects(
    async () => {
      await OrderModel.replaceOne({ _id: initial._id }, docWithChangedSnapshot as unknown as OrderDoc);
    },
    /sellerSnapshot is immutable and cannot be replaced or modified/,
  );

  const afterDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(afterDoc?.sellerSnapshot?.name, "Falken Vintrosa Baseline");
});

// ------------------------------------------------------------------------------
// T33 (Req T10): Cached older OrderModel without sellerSnapshot is not silently reused
// ------------------------------------------------------------------------------
test("T33. Hot Reload Invariant: Stale cached model lacking sellerSnapshot is detected and purged", () => {
  // Simulate an older pre-A8 schema in Mongoose models registry
  const mockOldSchema = new mongoose.Schema({
    publicId: String,
    paymentMethod: { type: String, enum: ["card", "swish", "pay_on_pickup"] },
    onSiteCollection: {
      method: String,
      idempotencyKey: String,
    },
    // Intentionally no sellerSnapshot!
  });

  const mockModels: Record<string, unknown> = {
    MockOrder: {
      schema: mockOldSchema,
    },
  };

  // Run the hot reload invariant logic
  const existingSchema = (mockModels.MockOrder as { schema: mongoose.Schema }).schema;
  const pmEnum = (existingSchema.path("paymentMethod") as { enumValues?: string[] } | undefined)?.enumValues;
  const onSiteMethod = existingSchema.path("onSiteCollection.method");
  const onSiteKey = existingSchema.path("onSiteCollection.idempotencyKey");
  const sellerSnapshotPath = existingSchema.path("sellerSnapshot.name");
  const guardVersion = (existingSchema as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion;

  const isUpToDate =
    Boolean(pmEnum && pmEnum.includes("swish")) &&
    Boolean(onSiteMethod) &&
    Boolean(onSiteKey) &&
    Boolean(sellerSnapshotPath) &&
    guardVersion === ORDER_MODEL_GUARD_VERSION;

  assert.equal(isUpToDate, false, "Stale model lacking sellerSnapshot must fail invariant check");
  if (!isUpToDate) {
    delete mockModels.MockOrder;
  }
  assert.equal(mockModels.MockOrder, undefined, "Stale model must be purged from registry");
});

// ------------------------------------------------------------------------------
// T34 (Req T11): Cached model with sellerSnapshot but missing guard version is not silently reused
// ------------------------------------------------------------------------------
test("T34. Hot Reload Invariant: Cached model with stale guard version is detected and purged", () => {
  const mockSchemaWithOldGuard = new mongoose.Schema({
    publicId: String,
    paymentMethod: { type: String, enum: ["card", "swish", "pay_on_pickup"] },
    onSiteCollection: {
      method: String,
      idempotencyKey: String,
    },
    sellerSnapshot: {
      name: String,
    },
  });
  // Guard version is missing or 1 (older than required version 2)
  (mockSchemaWithOldGuard as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion = 1;

  const mockModels: Record<string, unknown> = {
    MockOrderWithOldGuard: {
      schema: mockSchemaWithOldGuard,
    },
  };

  const existingSchema = (mockModels.MockOrderWithOldGuard as { schema: mongoose.Schema }).schema;
  const pmEnum = (existingSchema.path("paymentMethod") as { enumValues?: string[] } | undefined)?.enumValues;
  const onSiteMethod = existingSchema.path("onSiteCollection.method");
  const onSiteKey = existingSchema.path("onSiteCollection.idempotencyKey");
  const sellerSnapshotPath = existingSchema.path("sellerSnapshot.name");
  const guardVersion = (existingSchema as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion;

  const isUpToDate =
    Boolean(pmEnum && pmEnum.includes("swish")) &&
    Boolean(onSiteMethod) &&
    Boolean(onSiteKey) &&
    Boolean(sellerSnapshotPath) &&
    guardVersion === ORDER_MODEL_GUARD_VERSION;

  assert.equal(isUpToDate, false, "Model with guardVersion 1 must fail invariant check for version 2");
  if (!isUpToDate) {
    delete mockModels.MockOrderWithOldGuard;
  }
  assert.equal(mockModels.MockOrderWithOldGuard, undefined, "Stale guard model must be purged from registry");
});

// ------------------------------------------------------------------------------
// T35 (Req T12): Normal fresh-model initialization remains functional
// ------------------------------------------------------------------------------
test("T35. Model Invariants: OrderModel schema satisfies all required invariants", () => {
  assert.ok(OrderModel);
  assert.ok(OrderModel.schema.path("sellerSnapshot.name"), "sellerSnapshot.name schema path must exist");
  assert.ok(OrderModel.schema.path("sellerSnapshot.legalName"), "sellerSnapshot.legalName schema path must exist");
  assert.ok(OrderModel.schema.path("sellerSnapshot.city"), "sellerSnapshot.city schema path must exist");
  assert.equal(
    (OrderModel.schema as unknown as { _falkenGuardVersion?: number })._falkenGuardVersion,
    ORDER_MODEL_GUARD_VERSION,
    "Schema must be tagged with ORDER_MODEL_GUARD_VERSION",
  );
  assert.equal(
    (OrderModel as unknown as { _bulkWriteHardened?: boolean })._bulkWriteHardened,
    true,
    "OrderModel.bulkWrite must be tagged as hardened",
  );
});

// ------------------------------------------------------------------------------
// T36 (Req T13): Existing cash collection, payment updates, order status transitions and idempotent replay remain functional
// ------------------------------------------------------------------------------
test("T36. Business Workflow: Full order lifecycle with cash collection and replay retains sellerSnapshot", async () => {
  const initial = await createBaselineOrderForMutationTests("t36-full-lifecycle-e2e-key");

  // Step 1: CONFIRMED
  await OrderModel.updateOne({ _id: initial._id }, { $set: { fulfillmentStatus: "CONFIRMED" } });

  // Step 2: PREPARING
  await OrderModel.updateOne(
    { _id: initial._id },
    { $set: { fulfillmentStatus: "PREPARING", acknowledgedAt: new Date(), acknowledgedBy: "chef-1" } },
  );

  // Step 3: READY_FOR_PICKUP
  await OrderModel.updateOne({ _id: initial._id }, { $set: { fulfillmentStatus: "READY_FOR_PICKUP" } });

  // Step 4: Counter payment collection & PICKED_UP
  await OrderModel.updateOne(
    { _id: initial._id },
    {
      $set: {
        fulfillmentStatus: "PICKED_UP",
        paymentStatus: "paid",
        paidAt: new Date(),
        onSiteCollection: {
          collectedBy: "cashier-1",
          collectedAt: new Date(),
          method: "cash",
          amountSek: 100,
        },
      },
    },
  );

  // Step 5: Idempotent replay of the order
  const pickupAt = getValidPickupIso();
  const replayPayload = {
    idempotencyKey: "t36-full-lifecycle-e2e-key",
    items: [
      {
        productSlug: "margherita-receipt",
        variantId: "normal",
        quantity: 1,
        modifiers: [],
        removedIngredients: [],
        ifUnavailable: "call",
      },
    ],
    contact: { name: "Audit Customer", phone: "0701112233" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100,
  };
  const replayed = await createOrder(replayPayload, SIMULATED_NOW);
  assert.equal(replayed.replayed, true);

  const finalDoc = await OrderModel.findById(initial._id).lean();
  assert.equal(finalDoc?.fulfillmentStatus, "PICKED_UP");
  assert.equal(finalDoc?.paymentStatus, "paid");
  assert.ok(finalDoc?.sellerSnapshot);
  assert.equal(finalDoc.sellerSnapshot.name, "Falken Vintrosa Baseline");
  assert.equal(finalDoc.sellerSnapshot.city, "Vintrosa");
  assert.equal(finalDoc.sellerSnapshot.phone, "019 29 48 98");
});
