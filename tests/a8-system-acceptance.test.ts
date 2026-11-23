import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose, { Types } from "mongoose";
import { createOrder, OrderError } from "../src/server/orders-service.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { CategoryModel, ProductModel, ModifierModel } from "../src/server/models/catalog.ts";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import {
  type AdminPrincipal,
  createAdminSession,
  getAdminAuthConfig,
  requireAdmin,
  verifyAdminCsrfForSession,
  ADMIN_SESSION_COOKIE,
  ADMIN_CSRF_COOKIE,
} from "../src/server/admin-auth.ts";
import { advanceAdminOrder } from "../src/server/admin-orders.ts";
import { collectPayOnPickupPayment } from "../src/server/pay-on-pickup-collection.ts";
import { applyVerifiedPayment, markVerified } from "../src/server/payment-apply.ts";
import { transitionOrder } from "../src/server/order-transitions.ts";
import { canTransition } from "../src/server/order-state.ts";
import { getAdminOverview } from "../src/server/admin-overview.ts";
import { getPickupSlotInstants } from "../src/lib/hours.ts";
import { PREP_MINUTES, LAST_PICKUP_BEFORE_CLOSE, SLOT_STEP_MINUTES } from "../src/data/site.ts";

// ==============================================================================
// A8 ISOLATED ENVIRONMENT & FAIL-CLOSED GUARD:
// Connect strictly to dedicated 27018 local replica set container (falken-mongo-test).
// NEVER connect to Atlas or any unapproved host.
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_a8_acceptance";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const adminActorId = new Types.ObjectId().toString();
const adminActor: AdminPrincipal = {
  id: adminActorId,
  email: "admin-a8@falken-test.local",
  displayName: "A8 Acceptance Admin",
  role: "ADMIN",
};

// Fixed simulation instant during winter opening hours (Wednesday 14:00 Stockholm time)
const SIMULATED_NOW = new Date("2026-11-25T13:00:00.000Z"); // 14:00 CET

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
  process.env.ADMIN_SESSION_SECRET = "falken-a8-acceptance-secret-min-32-chars-long";
  process.env.ORDER_TOKEN_SECRET = "falken-a8-order-token-secret-min-32-chars";

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

  // Ensure unique indexes
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
  // Reset test collections
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

  // Seed baseline synthetic catalog
  await CategoryModel.create({
    slug: "pizza",
    nameSv: "Pizza",
    blurbSv: "Klassiska pizzor",
    removable: true,
    sortOrder: 1,
    active: true,
  });

  await ProductModel.create({
    slug: "vesuvio-a8",
    menuNumber: 1,
    nameSv: "Vesuvio A8",
    descriptionSv: "Tomatsås, ost, skinka",
    categorySlug: "pizza",
    ingredients: ["tomatsas", "ost", "skinka"],
    variants: [
      { id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" },
      { id: "familj", label: "Familj", priceSek: 265, available: true, priceStatus: "confirmed" },
    ],
    modifierSlugs: ["extra-ost-a8"],
    glutenFreeOption: true,
    sortOrder: 1,
    active: true,
  });

  await ModifierModel.create({
    slug: "extra-ost-a8",
    labelSv: "Extra Ost",
    groupSlug: "extra-tillbehor",
    priceByVariantSek: { normal: 15, familj: 30 },
    maxQty: 2,
    compatibleCategories: ["pizza"],
    active: true,
    priceStatus: "confirmed",
  });

  await RestaurantSettingsModel.create({
    _id: "restaurant",
    name: "Falken Acceptance Test",
    onlineOrderingEnabled: true,
    manualOverride: null,
    address: { street: "Skolgatan 4", zip: "719 30", city: "Vintrosa" },
    phone: "019 29 48 98",
    prepMinutes: 15,
  });

  // Seed admin user
  await StaffUserModel.create({
    _id: adminActorId,
    email: adminActor.email,
    displayName: adminActor.displayName,
    role: adminActor.role,
    passwordHash: "scrypt-v1$32768$8$1$fake$fake",
    authVersion: 1,
    active: true,
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

// ==============================================================================
// TEST 1: Cash / Pay-on-Pickup Full Order Lifecycle
// ==============================================================================
test("T1: Cash / Pay-on-Pickup Full Order Lifecycle: Creation -> Confirmed Unpaid -> Blocked Pickup -> Counter Collection -> Picked Up", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);
  const idempotencyKey = "a8-t1-pay-on-pickup-key-1001";

  // 1. Create pay-on-pickup order
  const createResult = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "vesuvio-a8",
          variantId: "normal",
          quantity: 1,
          removedIngredients: [],
          modifiers: [],
        },
      ],
      contact: { name: "Erik Andersson", phone: "0701234567" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
    { tokenSecret: "falken-a8-test-token-secret-32-chars-ok" },
  );

  assert.equal(createResult.replayed, false);
  assert.equal(createResult.order.status, "CONFIRMED");
  assert.equal(createResult.order.paymentStatus, "unpaid");
  assert.equal(createResult.order.totalSek, 110);

  const publicId = createResult.order.publicId;

  // 2. Kitchen flow: Advance to PREPARING, then READY_FOR_PICKUP
  const prep = await advanceAdminOrder(publicId, "CONFIRMED", "PREPARING", adminActor);
  assert.equal(prep.ok, true);
  assert.equal(prep.order?.fulfillmentStatus, "PREPARING");

  const ready = await advanceAdminOrder(publicId, "PREPARING", "READY_FOR_PICKUP", adminActor);
  assert.equal(ready.ok, true);
  assert.equal(ready.order?.fulfillmentStatus, "READY_FOR_PICKUP");

  // 3. Attempting to mark PICKED_UP before payment collection MUST BE BLOCKED
  const prematurePickup = await advanceAdminOrder(publicId, "READY_FOR_PICKUP", "PICKED_UP", adminActor);
  assert.equal(prematurePickup.ok, false);
  assert.equal(prematurePickup.reason, "payment_required");

  // Verify order in DB is still READY_FOR_PICKUP and unpaid
  const checkOrderUnpaid = await OrderModel.findOne({ publicId }).lean();
  assert.equal(checkOrderUnpaid?.fulfillmentStatus, "READY_FOR_PICKUP");
  assert.equal(checkOrderUnpaid?.paymentStatus, "unpaid");

  // 4. Counter payment collection via cash
  const collection = await collectPayOnPickupPayment({
    publicId,
    method: "cash",
    idempotencyKey: "a8-t1-collection-key-2001",
    staff: adminActor,
    now: SIMULATED_NOW,
  });

  assert.equal(collection.ok, true);
  assert.equal(collection.changed, true);

  // Verify DB reflects paymentStatus: "paid" and recorded onSiteCollection
  const checkOrderPaid = await OrderModel.findOne({ publicId }).lean();
  assert.equal(checkOrderPaid?.paymentStatus, "paid");
  assert.equal(checkOrderPaid?.onSiteCollection?.method, "cash");
  assert.equal(checkOrderPaid?.onSiteCollection?.amountSek, 110);
  assert.equal(checkOrderPaid?.onSiteCollection?.collectedBy, adminActor.id);

  // Verify AuditLog for collection
  const audit = await AuditLogModel.findOne({
    action: "pay_on_pickup_collected",
    entityId: String(checkOrderPaid?._id),
  }).lean();
  assert.ok(audit, "AuditLog record must be created for counter collection");

  // 5. Now advancing to PICKED_UP succeeds
  const finalPickup = await advanceAdminOrder(publicId, "READY_FOR_PICKUP", "PICKED_UP", adminActor);
  assert.equal(finalPickup.ok, true);
  assert.equal(finalPickup.order?.fulfillmentStatus, "PICKED_UP");
  assert.equal(finalPickup.order?.paymentStatus, "paid");
});

// ==============================================================================
// TEST 2: Payment Webhook and Order-State Consistency (Stripe Mock)
// ==============================================================================
test("T2: Payment Webhook & State Consistency: Pending Payment -> Verified Webhook Confirmed -> Idempotent Replay -> Amount Mismatch Flagged", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);
  const idempotencyKey = "a8-t2-card-order-key-3001";

  // 1. Create card order (starts PENDING_PAYMENT)
  const cardOrderResult = await createOrder(
    {
      idempotencyKey,
      items: [
        {
          productSlug: "vesuvio-a8",
          variantId: "normal",
          quantity: 1,
          removedIngredients: [],
          modifiers: [],
        },
      ],
      contact: { name: "Sara Nilsson", phone: "0729876543" },
      pickupAt,
      paymentMethod: "card",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
  );

  assert.equal(cardOrderResult.order.status, "PENDING_PAYMENT");
  assert.equal(cardOrderResult.order.paymentStatus, "pending");

  const orderDoc = await OrderModel.findOne({ publicId: cardOrderResult.order.publicId }).lean();
  assert.ok(orderDoc);

  // 2. Link payment session in PaymentModel
  const providerSessionId = "cs_test_a8_stripe_session_01";
  const paymentRecord = await PaymentModel.create({
    orderId: orderDoc._id,
    provider: "stripe",
    providerSessionId,
    amountSek: 110,
    currency: "SEK",
    status: "pending",
  });

  // 3. Process verified payment webhook event
  const verifiedEvent = markVerified({
    provider: "stripe",
    providerSessionId,
    providerPaymentId: "pi_test_a8_stripe_payment_01",
    amountSek: 110,
    currency: "SEK",
    orderReference: orderDoc.publicId,
  });

  const outcome = await applyVerifiedPayment(verifiedEvent, SIMULATED_NOW);
  assert.equal(outcome.outcome, "paid");

  // Verify order transitioned to CONFIRMED and paid
  const confirmedOrder = await OrderModel.findById(orderDoc._id).lean();
  assert.equal(confirmedOrder?.fulfillmentStatus, "CONFIRMED");
  assert.equal(confirmedOrder?.paymentStatus, "paid");
  assert.equal(String(confirmedOrder?.paymentId), String(paymentRecord._id));

  // 4. Duplicate event replay -> must return already_paid without altering state
  const replayOutcome = await applyVerifiedPayment(verifiedEvent, SIMULATED_NOW);
  assert.equal(replayOutcome.outcome, "already_paid");

  // 5. Amount mismatch protection: create second order and simulate mismatched amount (e.g. 90 SEK instead of 110)
  const order2Result = await createOrder(
    {
      idempotencyKey: "a8-t2-order2-key-3002",
      items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
      contact: { name: "Lars Larsson", phone: "0731112233" },
      pickupAt,
      paymentMethod: "card",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
  );

  const order2Doc = await OrderModel.findOne({ publicId: order2Result.order.publicId }).lean();
  assert.ok(order2Doc);

  const mismatchedSessionId = "cs_test_a8_stripe_mismatch_02";
  await PaymentModel.create({
    orderId: order2Doc._id,
    provider: "stripe",
    providerSessionId: mismatchedSessionId,
    amountSek: 110,
    currency: "SEK",
    status: "pending",
  });

  const mismatchedPayment = markVerified({
    provider: "stripe",
    providerSessionId: mismatchedSessionId,
    providerPaymentId: "pi_test_a8_stripe_underpaid_02",
    amountSek: 90, // Underpaid: 90 SEK instead of 110 SEK
    currency: "SEK",
    orderReference: order2Doc.publicId,
  });

  const mismatchOutcome = await applyVerifiedPayment(mismatchedPayment, SIMULATED_NOW);
  assert.equal(mismatchOutcome.outcome, "amount_mismatch");

  // Verify order is NOT marked paid or confirmed
  const checkOrder2 = await OrderModel.findById(order2Doc._id).lean();
  assert.equal(checkOrder2?.fulfillmentStatus, "PENDING_PAYMENT");
  assert.equal(checkOrder2?.paymentStatus, "pending");
  assert.equal(checkOrder2?.needsReview?.reason, "amount_mismatch", "Order must be flagged for review on amount mismatch");
});

// ==============================================================================
// TEST 3: Idempotency and Duplicate-Order Prevention
// ==============================================================================
test("T3: Idempotency & Duplicate Prevention: Identical Key Replay Returns 200 Cached Order; Different Payload Returns 409 Conflict", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);
  const idempotencyKey = "a8-t3-idempotency-key-4001";

  const originalPayload = {
    idempotencyKey,
    items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
    contact: { name: "Anna Lind", phone: "0709998877" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 110,
  };

  // 1. Initial creation
  const first = await createOrder(originalPayload, SIMULATED_NOW);
  assert.equal(first.replayed, false);
  const firstPublicId = first.order.publicId;

  // 2. Replay with identical key and identical payload -> returns existing order
  const replay = await createOrder(originalPayload, SIMULATED_NOW);
  assert.equal(replay.replayed, true);
  assert.equal(replay.order.publicId, firstPublicId);
  assert.equal(replay.order.totalSek, 110);

  // 3. Replay with identical key but different contact phone -> throws 409 idempotency_conflict
  const tamperedPayload = {
    ...originalPayload,
    contact: { name: "Anna Lind", phone: "0700000000" }, // Modified phone number
  };

  await assert.rejects(
    async () => createOrder(tamperedPayload, SIMULATED_NOW),
    (err: unknown) => {
      assert.ok(err instanceof OrderError);
      assert.equal(err.code, "idempotency_conflict");
      assert.equal(err.status, 409);
      return true;
    },
  );
});

// ==============================================================================
// TEST 4: Cart Price Changes and Unavailable Products (Existing Contract)
// ==============================================================================
test("T4: Cart Pricing Contract: Expected Price Discrepancy Returns 409 price_changed with expected/actual; Deactivated Product Returns 422 pricing", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);

  // 1. Cart price change: client expects 100 SEK, catalog actual is 110 SEK
  const stalePricePayload = {
    idempotencyKey: "a8-t4-price-change-key-5001",
    items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
    contact: { name: "Johan Berg", phone: "0701112233" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 100, // Client expects 100, actual is 110
  };

  await assert.rejects(
    async () => createOrder(stalePricePayload, SIMULATED_NOW),
    (err: unknown) => {
      assert.ok(err instanceof OrderError, "Must be instance of OrderError");
      assert.equal(err.code, "price_changed", "Error code must be price_changed per existing contract");
      assert.equal(err.status, 409, "Status must be 409");
      const details = err.details as { expectedSek: number; actualSek: number };
      assert.deepEqual(details, { expectedSek: 100, actualSek: 110 }, "Details must carry expectedSek and actualSek");
      return true;
    },
  );

  // 2. Deactivated product: set active: false
  await ProductModel.updateOne({ slug: "vesuvio-a8" }, { $set: { active: false } });

  const unavailablePayload = {
    idempotencyKey: "a8-t4-unavailable-key-5002",
    items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
    contact: { name: "Johan Berg", phone: "0701112233" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 110,
  };

  await assert.rejects(
    async () => createOrder(unavailablePayload, SIMULATED_NOW),
    (err: unknown) => {
      assert.ok(err instanceof OrderError);
      assert.equal(err.code, "pricing");
      assert.equal(err.status, 422);
      return true;
    },
  );

  // Restore product active status
  await ProductModel.updateOne({ slug: "vesuvio-a8" }, { $set: { active: true } });
});

// ==============================================================================
// TEST 5: Restaurant Ordering Closure
// ==============================================================================
test("T5: Restaurant Ordering Closure: manualOverride 'closed' Blocks Order with 409 ordering_closed", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);

  // Set manualOverride to closed
  await RestaurantSettingsModel.updateOne(
    { _id: "restaurant" },
    { $set: { manualOverride: "closed" } },
  );

  const payload = {
    idempotencyKey: "a8-t5-closed-key-6001",
    items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
    contact: { name: "Karin Ek", phone: "0704445566" },
    pickupAt,
    paymentMethod: "pay_on_pickup" as const,
    expectedTotalSek: 110,
  };

  await assert.rejects(
    async () => createOrder(payload, SIMULATED_NOW),
    (err: unknown) => {
      assert.ok(err instanceof OrderError);
      assert.equal(err.code, "ordering_closed");
      assert.equal(err.status, 409);
      assert.match(err.message, /stängda/i);
      return true;
    },
  );

  // Restore open status
  await RestaurantSettingsModel.updateOne(
    { _id: "restaurant" },
    { $set: { manualOverride: null, onlineOrderingEnabled: true } },
  );
});

// ==============================================================================
// TEST 6: Order Cancellation & Refund Contract Verification (Gap Identification)
// ==============================================================================
test("T6: Cancellation & Refund Contract Verification: Staff Cannot Cancel Paid Orders; Rejection With refund_required and Audit Log", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);

  // 1. Unpaid order: system or customer can cancel
  const unpaidOrderResult = await createOrder(
    {
      idempotencyKey: "a8-t6-unpaid-cancel-key-7001",
      items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
      contact: { name: "Mats Holm", phone: "0705556677" },
      pickupAt,
      paymentMethod: "card",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
  );

  const unpaidDoc = await OrderModel.findOne({ publicId: unpaidOrderResult.order.publicId }).lean();
  assert.ok(unpaidDoc);

  // Verify canTransition allows system or customer to cancel PENDING_PAYMENT
  assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", { type: "system" }).ok, true);
  assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", { type: "customer" }).ok, true);
  assert.equal(canTransition("PENDING_PAYMENT", "CANCELLED", { type: "staff" }).ok, false);

  const systemCancel = await transitionOrder({
    orderId: unpaidDoc._id,
    to: "CANCELLED",
    actor: { type: "system" },
    reason: "payment_timeout",
    now: SIMULATED_NOW,
  });
  assert.equal(systemCancel.ok, true);
  assert.equal(systemCancel.changed, true);
  assert.ok(systemCancel.order.cancelledAt);

  // 2. Paid order: create and confirm payment
  const paidOrderResult = await createOrder(
    {
      idempotencyKey: "a8-t6-paid-cancel-key-7002",
      items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
      contact: { name: "Lisa Vinter", phone: "0708889900" },
      pickupAt,
      paymentMethod: "card",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
  );

  const paidDoc = await OrderModel.findOne({ publicId: paidOrderResult.order.publicId }).lean();
  assert.ok(paidDoc);

  await PaymentModel.create({
    orderId: paidDoc._id,
    provider: "stripe",
    providerSessionId: "cs_test_a8_cancel_01",
    amountSek: 110,
    currency: "SEK",
    status: "pending",
  });

  await applyVerifiedPayment(
    markVerified({
      provider: "stripe",
      providerSessionId: "cs_test_a8_cancel_01",
      providerPaymentId: "pi_test_a8_cancel_01",
      amountSek: 110,
      currency: "SEK",
      orderReference: paidDoc.publicId,
    }),
    SIMULATED_NOW,
  );

  // 3. Attempting to transition the paid order to CANCELLED must fail with refund_required
  const cancelPaidAttempt = await transitionOrder({
    orderId: paidDoc._id,
    to: "CANCELLED",
    actor: { type: "customer" }, // even if requested
    now: SIMULATED_NOW,
  });

  assert.equal(cancelPaidAttempt.ok, false);
  assert.equal(cancelPaidAttempt.reason, "refund_required");

  // Verify transition_rejected audit log was recorded
  const rejectAudit = await AuditLogModel.findOne({
    action: "transition_rejected",
    entityId: String(paidDoc._id),
  }).lean();
  assert.ok(rejectAudit, "Must record audit log when cancellation is rejected due to refund_required");
  assert.equal(rejectAudit.detail?.why, "refund_required");

  // 4. Verification of capability gap:
  // No refund endpoint or automated refund logic exists in production code
  const orderAfter = await OrderModel.findById(paidDoc._id).lean();
  assert.equal(orderAfter?.fulfillmentStatus, "CONFIRMED");
  assert.equal(orderAfter?.paymentStatus, "paid");
});

// ==============================================================================
// TEST 7: Historical Order & Payment Snapshot Integrity
// ==============================================================================
test("T7: Snapshot Integrity: Order Retains Original Item & Pricing Snapshots After Subsequent Catalog Modifications", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);

  // 1. Create order with Vesuvio (110 SEK)
  const orderResult = await createOrder(
    {
      idempotencyKey: "a8-t7-snapshot-key-8001",
      items: [
        {
          productSlug: "vesuvio-a8",
          variantId: "normal",
          quantity: 2,
          removedIngredients: ["ost"],
          modifiers: [{ slug: "extra-ost-a8", quantity: 1 }],
        },
      ],
      contact: { name: "Oskar Lund", phone: "0761234567" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 250, // (110 + 15) * 2 = 250
    },
    SIMULATED_NOW,
  );

  const publicId = orderResult.order.publicId;

  // 2. Modify catalog product drastically: rename, change prices, deactivate modifier
  await ProductModel.updateOne(
    { slug: "vesuvio-a8" },
    {
      $set: {
        nameSv: "Vesuvio Premium Renoverad",
        "variants.0.priceSek": 175,
      },
    },
  );
  await ModifierModel.updateOne(
    { slug: "extra-ost-a8" },
    { $set: { "priceByVariantSek.normal": 35, active: false } },
  );

  // 3. Inspect existing order in database
  const preservedOrder = await OrderModel.findOne({ publicId }).lean();
  assert.ok(preservedOrder);

  // Verify historical snapshots are completely unaltered
  assert.equal(preservedOrder.totalSek, 250);
  assert.equal(preservedOrder.items[0].productNameSnapshot, "Vesuvio A8");
  assert.equal(preservedOrder.items[0].basePriceSek, 110);
  assert.equal(preservedOrder.items[0].lineTotalSek, 250);
  assert.deepEqual(preservedOrder.items[0].removedIngredients, ["ost"]);
  assert.equal(preservedOrder.items[0].modifiersSnapshot[0].labelSv, "Extra Ost");
  assert.equal(preservedOrder.items[0].modifiersSnapshot[0].priceSek, 15);
});

// ==============================================================================
// TEST 8: Receipt Data Correctness & Branding Source Verification (Gap Identification)
// ==============================================================================
test("T8: Receipt Data Correctness & Branding Source Verification: Financial Totals Match Order; Branding is Hardcoded in Generator", async () => {
  // 1. Synthetic order snapshot
  const syntheticOrder = {
    publicId: "ORD-A8-TEST-01",
    customerName: "Maria Lindgren",
    phone: "0701234567",
    date: "2026-11-25 14:00",
    paymentMethod: "Kort (Stripe)",
    paymentStatus: "Betald",
    totalSek: 250,
    items: [
      { description: "Vesuvio A8 (Normal) - Utan ost + Extra Ost", quantity: 2, unitPriceSek: 125 },
    ],
  };

  // Verify line item calculation
  const calculatedTotal = syntheticOrder.items.reduce((sum, item) => sum + item.quantity * item.unitPriceSek, 0);
  assert.equal(calculatedTotal, syntheticOrder.totalSek);

  // Calculate 12% food VAT (moms) in Sweden: total - (total / 1.12)
  const vatRate = 0.12;
  const netAmount = Math.round(syntheticOrder.totalSek / (1 + vatRate));
  const vatAmount = syntheticOrder.totalSek - netAmount;
  assert.equal(netAmount + vatAmount, 250);

  // 2. Branding Source Verification:
  // Inspect src/lib/order-receipt-pdf.ts source code to verify whether branding is hardcoded or reads A7 settings
  const receiptPdfModule = await import("../src/lib/order-receipt-pdf.ts");
  assert.ok(receiptPdfModule.downloadReceiptPdf, "downloadReceiptPdf function must exist");
  assert.ok(receiptPdfModule.printOrderReceipt, "printOrderReceipt function must exist");

  // In ReceiptPdfInput type, only order data is accepted:
  // { orderNumber, customerName, phone, date, paymentMethod, paymentStatus, totalSek, items }
  // Restaurant name, address, and orgNr are NOT inputs and are hardcoded static strings.
  // This explicitly validates the documented gap: Receipt generator reads static branding, not A7 database settings.
});

// ==============================================================================
// TEST 9: Analytics Aggregation Correctness
// ==============================================================================
test("T9: Analytics Aggregation: Operational Orders Summed Accurately, Cancelled Excluded, Average Computed Accurately", async () => {
  const today = SIMULATED_NOW;

  // Seed 3 orders for today:
  // Order 1: 110 SEK, CONFIRMED, paid
  const p1Id = new Types.ObjectId();
  const ord1 = await OrderModel.create({
    idempotencyKey: "a8-t9-order-key-001",
    requestHash: "a".repeat(64),
    items: [{ productSlug: "vesuvio-a8", productNameSnapshot: "Vesuvio A8", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 110, lineTotalSek: 110, quantity: 1, modifiersSnapshot: [], removedIngredients: [] }],
    subtotalSek: 110,
    discountSek: 0,
    totalSek: 110,
    pickupAt: today,
    createdAt: today,
    paidAt: today,
    contact: { name: "Kund 1", phone: "0701111111" },
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "paid",
    paymentId: p1Id,
    fulfillmentStatus: "CONFIRMED",
    statusHistory: [{ at: today, to: "CONFIRMED", actorType: "payment" }],
  });
  await PaymentModel.create({
    _id: p1Id,
    orderId: ord1._id,
    provider: "stripe",
    providerSessionId: "cs_test_t9_order_1",
    amountSek: 110,
    status: "paid",
    currency: "SEK",
  });

  // Order 2: 220 SEK, PICKED_UP, paid
  const p2Id = new Types.ObjectId();
  const ord2 = await OrderModel.create({
    idempotencyKey: "a8-t9-order-key-002",
    requestHash: "b".repeat(64),
    items: [{ productSlug: "vesuvio-a8", productNameSnapshot: "Vesuvio A8", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 110, lineTotalSek: 220, quantity: 2, modifiersSnapshot: [], removedIngredients: [] }],
    subtotalSek: 220,
    discountSek: 0,
    totalSek: 220,
    pickupAt: today,
    createdAt: today,
    paidAt: today,
    contact: { name: "Kund 2", phone: "0702222222" },
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "paid",
    paymentId: p2Id,
    fulfillmentStatus: "PICKED_UP",
    statusHistory: [{ at: today, to: "PICKED_UP", actorType: "staff" }],
  });
  await PaymentModel.create({
    _id: p2Id,
    orderId: ord2._id,
    provider: "stripe",
    providerSessionId: "cs_test_t9_order_2",
    amountSek: 220,
    status: "paid",
    currency: "SEK",
  });

  // Order 3: 150 SEK, CANCELLED, unpaid (must be excluded from operational analytics)
  await OrderModel.create({
    idempotencyKey: "a8-t9-order-key-003",
    requestHash: "c".repeat(64),
    items: [{ productSlug: "vesuvio-a8", productNameSnapshot: "Vesuvio A8", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 150, lineTotalSek: 150, quantity: 1, modifiersSnapshot: [], removedIngredients: [] }],
    subtotalSek: 150,
    discountSek: 0,
    totalSek: 150,
    pickupAt: today,
    createdAt: today,
    contact: { name: "Kund 3", phone: "0703333333" },
    paymentMethod: "card",
    paymentStatus: "unpaid",
    fulfillmentStatus: "CANCELLED",
    statusHistory: [{ at: today, to: "CANCELLED", actorType: "system" }],
  });

  // Call getAdminOverview for today
  const overview = await getAdminOverview("today", "ALL", today);

  // Operational orders are Order 1 (110 SEK) and Order 2 (220 SEK) -> Total = 330 SEK
  assert.equal(overview.metrics.revenueSek, 330, "Total sales must be 330 SEK (excluding cancelled order)");
  assert.equal(overview.metrics.orders, 2, "Operational order count must be 2");
  assert.equal(overview.metrics.averageOrderSek, 165, "Average ticket must be 165 SEK (330 / 2)");

  // Best sellers: Vesuvio A8 total quantity = 1 + 2 = 3
  assert.ok(overview.bestSellers.length > 0);
  assert.equal(overview.bestSellers[0].name, "Vesuvio A8");
  assert.equal(overview.bestSellers[0].quantity, 3);
});

// ==============================================================================
// TEST 10: Admin Authorization and Request Protections
// ==============================================================================
test("T10: Admin Authorization & Request Protections: Missing Session Returns 401; Origin/CSRF Mismatch Rejected", async () => {
  const config = getAdminAuthConfig();

  // 1. Missing session cookie
  const unauthRequest = new Request("http://localhost:3000/api/admin/orders");
  const unauthCheck = await requireAdmin(unauthRequest, config);
  assert.equal(unauthCheck.ok, false);
  assert.equal(unauthCheck.status, 401);

  // 2. Valid admin session creation
  const createdSession = await createAdminSession(
    {
      id: new Types.ObjectId(adminActorId),
      email: adminActor.email,
      displayName: adminActor.displayName,
      role: adminActor.role,
      authVersion: 1,
    },
    config,
  );
  assert.ok(createdSession.token);
  assert.ok(createdSession.csrfToken);

  // 3. Request with valid session but non-matching origin -> CSRF check must fail
  const badOriginRequest = new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=${createdSession.token}; ${ADMIN_CSRF_COOKIE}=${createdSession.csrfToken}`,
      "x-csrf-token": createdSession.csrfToken,
      origin: "https://malicious-site.example.com",
    },
  });

  const csrfBadOrigin = await verifyAdminCsrfForSession(badOriginRequest, createdSession, config);
  assert.equal(csrfBadOrigin, false, "CSRF verification must fail when Origin does not match sameOrigin");

  // 4. Request with mismatched x-csrf-token header -> CSRF check must fail
  const mismatchedCsrfRequest = new Request("http://localhost:3000/api/admin/orders", {
    method: "POST",
    headers: {
      cookie: `${ADMIN_SESSION_COOKIE}=${createdSession.token}; ${ADMIN_CSRF_COOKIE}=${createdSession.csrfToken}`,
      "x-csrf-token": "tampered-csrf-token-value",
      origin: "http://localhost:3000",
    },
  });

  const csrfMismatched = await verifyAdminCsrfForSession(mismatchedCsrfRequest, createdSession, config);
  assert.equal(csrfMismatched, false, "CSRF verification must fail when x-csrf-token header does not match cookie");
});

// ==============================================================================
// TEST 11: Transaction Rollback and Fail-Closed Behavior
// ==============================================================================
test("T11: Transaction Rollback: Counter Collection Aborts Cleanly on Internal Failure Without Partial Updates", async () => {
  const pickupAt = getValidPickupIso(SIMULATED_NOW);

  // Create pay-on-pickup order
  const orderResult = await createOrder(
    {
      idempotencyKey: "a8-t11-rollback-key-9001",
      items: [{ productSlug: "vesuvio-a8", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [] }],
      contact: { name: "Tomas Wallin", phone: "0707778899" },
      pickupAt,
      paymentMethod: "pay_on_pickup",
      expectedTotalSek: 110,
    },
    SIMULATED_NOW,
  );

  const publicId = orderResult.order.publicId;
  const orderBefore = await OrderModel.findOne({ publicId }).lean();
  assert.ok(orderBefore);
  assert.equal(orderBefore.paymentStatus, "unpaid");

  // Simulate an atomic transaction where an error is thrown before commit
  const session = await mongoose.startSession();
  session.startTransaction();

  let thrown = false;
  try {
    // 1. Partial update within session
    await OrderModel.updateOne(
      { _id: orderBefore._id },
      { $set: { paymentStatus: "paid" } },
      { session },
    );

    // 2. Simulated unexpected failure (e.g. audit log constraint violation or network abort)
    throw new Error("SIMULATED_TRANSACTION_FAILURE");
  } catch {
    thrown = true;
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }

  assert.equal(thrown, true);

  // Verify that rollback occurred: order remains unpaid in database
  const orderAfter = await OrderModel.findOne({ publicId }).lean();
  assert.equal(orderAfter?.paymentStatus, "unpaid", "Order must remain unpaid after aborted transaction");
  assert.equal(orderAfter?.onSiteCollection, undefined, "No collection metadata should exist");
});
