/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test, { before, after, beforeEach } from "node:test";
import mongoose, { type Types } from "mongoose";
import { OrderModel, PaymentModel, type OrderDoc, type PaymentDoc, generatePublicId } from "../src/server/models/order.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import {
  recordFullRefund,
  cancelUnpaidOrder,
} from "../src/server/refund-service.ts";
import { POST as refundRoutePost } from "../src/app/api/admin/orders/[publicId]/refund/route.ts";
import { POST as cancelRoutePost } from "../src/app/api/admin/orders/[publicId]/cancel/route.ts";

// ==============================================================================
// FAIL-CLOSED ISOLATION GUARD:
// Connect strictly to dedicated 27018 local replica set container (falken-mongo-test).
// NEVER connect to Atlas or any unapproved host.
// ==============================================================================
const TEST_MONGODB_PORT = 27018;
const TEST_DB_NAME = "falken_r1_refund_test";
const TEST_REPLICA_SET = "rs0";
const TEST_MONGODB_URI = `mongodb://127.0.0.1:${TEST_MONGODB_PORT}/${TEST_DB_NAME}?replicaSet=${TEST_REPLICA_SET}&directConnection=true`;

const STAFF_ADMIN = {
  id: "staff_admin_001",
  email: "admin@falken.se",
  displayName: "Falken Admin",
  role: "ADMIN" as const,
};

const SELLER_SNAPSHOT_FIXTURE = {
  name: "Falken Restaurang & Pizzeria",
  legalName: "Falken Pizzeria AB",
  street: "Skolgatan 4",
  zip: "719 30",
  city: "Vintrosa",
  country: "Sverige",
  phone: "019-29 48 98",
};

const ITEMS_FIXTURE = [
  {
    productSlug: "margherita",
    productNameSnapshot: "Margherita",
    variantId: "standard",
    variantNameSnapshot: "Standard",
    basePriceSek: 120,
    modifiersSnapshot: [],
    removedIngredients: [],
    note: "",
    ifUnavailable: "call" as const,
    quantity: 1,
    lineTotalSek: 120,
  },
];

let globalStaffSessionToken = "";
let globalCsrfToken = "";

before(async () => {
  process.env.ADMIN_SESSION_SECRET = "falken-r1-refund-secret-min-32-chars-long";
  process.env.ORDER_TOKEN_SECRET = "falken-r1-order-token-secret-min-32-chars";

  await mongoose.disconnect();
  await mongoose.connect(TEST_MONGODB_URI, {
    dbName: TEST_DB_NAME,
    serverSelectionTimeoutMS: 5000,
  });

  if (mongoose.connection.port !== TEST_MONGODB_PORT) {
    await mongoose.disconnect();
    throw new Error(`Isolation guard failed: connected to port ${mongoose.connection.port}, expected ${TEST_MONGODB_PORT}`);
  }
  if (mongoose.connection.name !== TEST_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(`Isolation guard failed: connected to db ${mongoose.connection.name}, expected ${TEST_DB_NAME}`);
  }

  // Create admin staff & session for API tests
  await StaffUserModel.deleteMany({});
  await StaffSessionModel.deleteMany({});

  const { createAdminSession, getAdminAuthConfig } = await import("../src/server/admin-auth.ts");

  const adminUser = await StaffUserModel.create({
    email: "admin@falken.se",
    displayName: "Falken Admin",
    role: "ADMIN",
    passwordHash: "dummy-hash",
    active: true,
    authVersion: 1,
  });

  const session = await createAdminSession(
    {
      id: adminUser._id as Types.ObjectId,
      email: adminUser.email,
      displayName: adminUser.displayName,
      role: adminUser.role,
      authVersion: adminUser.authVersion,
    },
    getAdminAuthConfig(),
  );

  globalStaffSessionToken = session.token;
  globalCsrfToken = session.csrfToken;
});

after(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await OrderModel.deleteMany({});
  await PaymentModel.deleteMany({});
  await AuditLogModel.deleteMany({});
});

// Helper to create test orders
async function createTestOrder(overrides: Partial<OrderDoc> = {}): Promise<OrderDoc & { _id: Types.ObjectId }> {
  const publicId = generatePublicId();
  const idempotencyKey = "key_" + Math.random().toString(36).substring(2, 12) + "_123456";
  const requestHash = "a".repeat(64);

  const doc = await OrderModel.create({
    publicId,
    idempotencyKey,
    requestHash,
    items: ITEMS_FIXTURE,
    subtotalSek: 120,
    discountSek: 0,
    totalSek: 120,
    currency: "SEK",
    pickupAt: new Date(Date.now() + 3600000),
    contact: { name: "Test Kund", phone: "0701234567" },
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "paid",
    fulfillmentStatus: "CONFIRMED",
    sellerSnapshot: SELLER_SNAPSHOT_FIXTURE,
    totalRefundedSek: 0,
    ...overrides,
  });
  return doc.toObject() as OrderDoc & { _id: Types.ObjectId };
}

// Helper to create test payment record
async function createTestPayment(orderId: Types.ObjectId, overrides: Partial<PaymentDoc> = {}): Promise<PaymentDoc & { _id: Types.ObjectId }> {
  const doc = await PaymentModel.create({
    orderId,
    provider: "stripe",
    providerSessionId: "cs_test_" + Math.random().toString(36).substring(2, 10),
    providerPaymentId: "pi_test_" + Math.random().toString(36).substring(2, 10),
    amountSek: 120,
    currency: "SEK",
    status: "paid",
    refundedSek: 0,
    processedEventIds: [],
    ...overrides,
  });
  return doc.toObject() as PaymentDoc & { _id: Types.ObjectId };
}

// ==============================================================================
// R1 ACCEPTANCE TESTS (R1-01 to R1-21)
// ==============================================================================

test("R1-01: Unpaid pay-on-pickup cancellation and AuditLog", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
  });

  const res = await cancelUnpaidOrder({
    publicId: order.publicId,
    reasonCategory: "customer_cancellation",
    reasonNote: "Kunden ångrade köpet",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const persisted = await OrderModel.findById(order._id).lean();
  assert.equal(persisted?.fulfillmentStatus, "CANCELLED");
  assert.equal(persisted?.paymentStatus, "unpaid");
  assert.equal(persisted?.refundRecord, undefined, "No refund record should be created for unpaid order");
  assert.equal(persisted?.totalRefundedSek, 0);

  const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "order_cancelled_unpaid" }).lean();
  assert.ok(audit, "AuditLog for unpaid cancellation must exist");
  assert.equal(audit?.actorId, STAFF_ADMIN.id);
  assert.equal(audit?.detail?.reasonCategory, "customer_cancellation");
});

test("R1-02: Paid cancellation without refund rejected", async () => {
  const order = await createTestOrder({
    paymentMethod: "card",
    paymentStatus: "paid",
    fulfillmentStatus: "CONFIRMED",
  });

  const res = await cancelUnpaidOrder({
    publicId: order.publicId,
    reasonCategory: "customer_cancellation",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "refund_required");

  const persisted = await OrderModel.findById(order._id).lean();
  assert.equal(persisted?.fulfillmentStatus, "CONFIRMED", "Order fulfillmentStatus must not change");
  assert.equal(persisted?.paymentStatus, "paid");
});

test("R1-03: Electronic full refund before pickup", async () => {
  const order = await createTestOrder({
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "paid",
    fulfillmentStatus: "PREPARING",
  });
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "quality_issue",
    reasonNote: "Fel ingrediens",
    externalReference: "re_1234567890abcdef12345678",
    idempotencyKey: "idemp_test_full_refund_01",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updatedOrder = await OrderModel.findById(order._id).lean();
  assert.equal(updatedOrder?.paymentStatus, "refunded");
  assert.equal(updatedOrder?.fulfillmentStatus, "CANCELLED");
  assert.equal(updatedOrder?.totalRefundedSek, 120);
  assert.equal(updatedOrder?.refundRecord?.canonicalProvider, "stripe");
  assert.equal(updatedOrder?.refundRecord?.verificationTier, "admin_attested");

  const updatedPayment = await PaymentModel.findById(payment._id).lean();
  assert.equal(updatedPayment?.status, "refunded");
  assert.equal(updatedPayment?.refundedSek, 120);

  const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "electronic_refund_recorded" }).lean();
  assert.ok(audit);
  assert.equal(audit?.deduplicationKey, "refund_ref:stripe:re_1234567890abcdef12345678");
});

test("R1-04: Electronic full refund after pickup preserves PICKED_UP", async () => {
  const order = await createTestOrder({
    paymentMethod: "swish",
    paymentProvider: "swish",
    paymentStatus: "paid",
    fulfillmentStatus: "PICKED_UP",
  });
  const payment = await createTestPayment(order._id, { provider: "swish" });
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "quality_issue",
    reasonNote: "Kall mat",
    externalReference: "123456789012",
    idempotencyKey: "idemp_test_post_pickup_01",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updatedOrder = await OrderModel.findById(order._id).lean();
  assert.equal(updatedOrder?.paymentStatus, "refunded");
  assert.equal(updatedOrder?.fulfillmentStatus, "PICKED_UP", "Fulfillment status must remain PICKED_UP");
  assert.equal(updatedOrder?.totalRefundedSek, 120);

  const updatedPayment = await PaymentModel.findById(payment._id).lean();
  assert.equal(updatedPayment?.status, "refunded");
  assert.equal(updatedPayment?.refundedSek, 120);
});

test("R1-05: Original Payment.refundedSek = 0 accepted", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id, { refundedSek: 0 });
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_000000000000000000000001",
    idempotencyKey: "idemp_test_ref_zero",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
});

test("R1-06: Original Payment.refundedSek > 0 rejected (MANDATORY CORRECTION 1)", async () => {
  const order = await createTestOrder();
  // Payment record already has positive refundedSek
  const payment = await createTestPayment(order._id, { refundedSek: 60 });
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_000000000000000000000002",
    idempotencyKey: "idemp_test_ref_positive",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "payment_already_refunded");

  const orderCheck = await OrderModel.findById(order._id).lean();
  assert.equal(orderCheck?.paymentStatus, "paid", "Order paymentStatus must remain paid");
  assert.equal(orderCheck?.totalRefundedSek, 0);
});

test("R1-07: Invalid/missing refundedSek handled safely", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  // Bypass mongoose schema validator using direct collection update to simulate corrupted data
  await PaymentModel.collection.updateOne({ _id: payment._id }, { $set: { refundedSek: -1 } });
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_000000000000000000000003",
    idempotencyKey: "idemp_test_ref_invalid",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "inconsistent_payment_refund");
});

test("R1-08: Missing or mismatched Payment record rejected (Fail-Closed)", async () => {
  // Case A: Missing paymentId
  const orderNoPaymentId = await createTestOrder({ paymentId: undefined });
  const resA = await recordFullRefund({
    publicId: orderNoPaymentId.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_000000000000000000000004",
    idempotencyKey: "idemp_missing_payment_id",
    staff: STAFF_ADMIN,
  });
  assert.equal(resA.ok, false);
  assert.equal((resA as { reason: string }).reason, "payment_record_missing");

  // Case B: Payment record points to a different order
  const orderB = await createTestOrder();
  const differentOrder = await createTestOrder();
  const mismatchedPayment = await createTestPayment(differentOrder._id);
  await OrderModel.updateOne({ _id: orderB._id }, { $set: { paymentId: mismatchedPayment._id } });

  const resB = await recordFullRefund({
    publicId: orderB.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_000000000000000000000005",
    idempotencyKey: "idemp_mismatched_payment",
    staff: STAFF_ADMIN,
  });
  assert.equal(resB.ok, false);
  assert.equal((resB as { reason: string }).reason, "payment_record_missing");
});

test("R1-09: Cash refund uses onSiteCollection without PaymentModel", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "paid",
    onSiteCollection: {
      method: "cash",
      amountSek: 120,
      collectedBy: "staff_counter_01",
      collectedAt: new Date(),
      idempotencyKey: "counter_cash_col_12345",
    },
  });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "KVITTO-2026-101",
    idempotencyKey: "idemp_cash_refund_01",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updatedOrder = await OrderModel.findById(order._id).lean();
  assert.equal(updatedOrder?.paymentStatus, "refunded");
  assert.equal(updatedOrder?.refundRecord?.canonicalProvider, "cash");
  assert.equal(updatedOrder?.refundRecord?.canonicalReference, "KVITTO-2026-101");

  // Verify NO PaymentModel document was created
  const paymentCount = await PaymentModel.countDocuments({ orderId: order._id });
  assert.equal(paymentCount, 0, "No synthetic Payment document should exist for cash refund");

  const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "on_site_refund_recorded" }).lean();
  assert.ok(audit);
  assert.equal(audit?.deduplicationKey, "refund_ref:cash:KVITTO-2026-101");
});

test("R1-10: Card-terminal provider identity is distinct from cash (MANDATORY CORRECTION 2)", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "paid",
    onSiteCollection: {
      method: "card_terminal",
      amountSek: 120,
      collectedBy: "staff_counter_01",
      collectedAt: new Date(),
      idempotencyKey: "counter_terminal_col_12345",
    },
  });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "SLIP-TERM-999",
    idempotencyKey: "idemp_terminal_refund_01",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  if (!res.ok) return;

  const updatedOrder = await OrderModel.findById(order._id).lean();
  assert.equal(updatedOrder?.refundRecord?.canonicalProvider, "card_terminal");

  const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "on_site_refund_recorded" }).lean();
  assert.equal(audit?.deduplicationKey, "refund_ref:card_terminal:SLIP-TERM-999", "Deduplication key must use distinct provider card_terminal");

  // Also verify that attempting a cash method on a card_terminal collection is rejected
  const orderMismatch = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentStatus: "paid",
    onSiteCollection: {
      method: "card_terminal",
      amountSek: 120,
      collectedBy: "staff_counter_01",
      collectedAt: new Date(),
      idempotencyKey: "counter_terminal_col_diff",
    },
  });
  const resMismatch = await recordFullRefund({
    publicId: orderMismatch.publicId,
    amountSek: 120,
    method: "cash", // Requested cash on terminal order
    reasonCategory: "customer_cancellation",
    externalReference: "KVITTO-DIFF",
    idempotencyKey: "idemp_mismatch_test",
    staff: STAFF_ADMIN,
  });
  assert.equal(resMismatch.ok, false);
  assert.equal((resMismatch as { reason: string }).reason, "method_mismatch");
});

test("R1-11: Same idempotency key and payload replay safely", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const input = {
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation" as const,
    reasonNote: "Samma förfrågan",
    externalReference: "re_same_key_1234567890abcdef",
    idempotencyKey: "idemp_key_repeat_01",
    staff: STAFF_ADMIN,
  };

  const first = await recordFullRefund(input);
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);

  const second = await recordFullRefund(input);
  assert.equal(second.ok, true);
  assert.equal(second.changed, false, "Idempotent replay must return changed: false");

  const auditCount = await AuditLogModel.countDocuments({ entityId: String(order._id) });
  assert.equal(auditCount, 1, "AuditLog must have exactly 1 record");
});

test("R1-12: Same key and different payload returns 409 idempotency_conflict", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const key = "idemp_conflict_key_999";
  const first = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    reasonNote: "Ursprunglig notering",
    externalReference: "re_conflict_1234567890abcdef",
    idempotencyKey: key,
    staff: STAFF_ADMIN,
  });
  assert.equal(first.ok, true);

  // Different payload (different external reference or different reason)
  const second = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "quality_issue", // Changed
    reasonNote: "Annan orsak",
    externalReference: "re_conflict_different_ref_123",
    idempotencyKey: key, // Same key!
    staff: STAFF_ADMIN,
  });
  assert.equal(second.ok, false);
  assert.equal((second as { reason: string }).reason, "idempotency_conflict");
});

test("R1-13: Duplicate normalized reference rejected across different orders", async () => {
  const orderA = await createTestOrder();
  const paymentA = await createTestPayment(orderA._id);
  await OrderModel.updateOne({ _id: orderA._id }, { $set: { paymentId: paymentA._id } });

  const orderB = await createTestOrder();
  const paymentB = await createTestPayment(orderB._id);
  await OrderModel.updateOne({ _id: orderB._id }, { $set: { paymentId: paymentB._id } });

  const ref = "re_duplicate_check_1234567890";

  const resA = await recordFullRefund({
    publicId: orderA.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: ref,
    idempotencyKey: "idemp_order_a",
    staff: STAFF_ADMIN,
  });
  assert.equal(resA.ok, true);

  // Order B attempts to use the SAME external reference
  const resB = await recordFullRefund({
    publicId: orderB.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: `  ${ref}  `, // Surrounding whitespace
    idempotencyKey: "idemp_order_b",
    staff: STAFF_ADMIN,
  });
  assert.equal(resB.ok, false);
  assert.equal((resB as { reason: string }).reason, "duplicate_external_reference");
});

test("R1-14: Concurrent full refund requests cannot double-record", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const input1 = {
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation" as const,
    externalReference: "re_concurrent_1234567890abcdef",
    idempotencyKey: "idemp_conc_1",
    staff: STAFF_ADMIN,
  };
  const input2 = {
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "quality_issue" as const,
    externalReference: "re_concurrent_2222222222abcdef",
    idempotencyKey: "idemp_conc_2",
    staff: STAFF_ADMIN,
  };

  const [res1, res2] = await Promise.all([recordFullRefund(input1), recordFullRefund(input2)]);

  const successes = [res1, res2].filter((r) => r.ok && r.changed);
  const failures = [res1, res2].filter((r) => !r.ok);

  assert.equal(successes.length, 1, "Exactly one concurrent request must win");
  assert.equal(failures.length, 1, "The competing request must fail");

  const updatedOrder = await OrderModel.findById(order._id).lean();
  assert.equal(updatedOrder?.totalRefundedSek, 120);

  const updatedPayment = await PaymentModel.findById(payment._id).lean();
  assert.equal(updatedPayment?.refundedSek, 120);
});

test("R1-15: Transaction rollback preserves consistency on injected error", async () => {
  const order = await createTestOrder();
  // Payment with amount mismatch to trigger error mid-way
  const payment = await createTestPayment(order._id, { amountSek: 50 }); // Mismatch with order.totalSek (120)
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_rollback_test_1234567890",
    idempotencyKey: "idemp_rollback_01",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);

  const orderCheck = await OrderModel.findById(order._id).lean();
  assert.equal(orderCheck?.paymentStatus, "paid");
  assert.equal(orderCheck?.totalRefundedSek, 0);
  assert.equal(orderCheck?.refundRecord, undefined);

  const paymentCheck = await PaymentModel.findById(payment._id).lean();
  assert.equal(paymentCheck?.status, "paid");
  assert.equal(paymentCheck?.refundedSek, 0);

  const auditCount = await AuditLogModel.countDocuments({ entityId: String(order._id) });
  assert.equal(auditCount, 0);
});

test("R1-16: External refund already completed, internal recording retry succeeds", async () => {
  // Scenario: Money moved externally. Internal recording attempt 1 had an error or retry.
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const externalRef = "re_external_done_1234567890ab";
  const idempKey = "idemp_recovery_retry_01";

  // Operator submits with the external reference
  const res = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    reasonNote: "Manuell avstämning efter extern utbetalning",
    externalReference: externalRef,
    idempotencyKey: idempKey,
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, true);
  assert.equal(res.changed, true);

  // Subsequent retry with identical data succeeds safely
  const retry = await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    reasonNote: "Manuell avstämning efter extern utbetalning",
    externalReference: externalRef,
    idempotencyKey: idempKey,
    staff: STAFF_ADMIN,
  });

  assert.equal(retry.ok, true);
  assert.equal(retry.changed, false);
});

test("R1-17: Database unavailable error returns clean failure without claiming external failure", async () => {
  const order = await createTestOrder();
  // Simulate network timeout or db failure on query
  const origFindOne = OrderModel.findOne.bind(OrderModel);
  (OrderModel as any).findOne = () => {
    throw new Error("MongoNetworkTimeoutError: connection timed out");
  };

  try {
    const req = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `falken_admin_session=${globalStaffSessionToken}; falken_admin_csrf=${globalCsrfToken}`,
        "x-csrf-token": globalCsrfToken,
      },
      body: JSON.stringify({
        amountSek: 120,
        reasonCategory: "customer_cancellation",
        externalReference: "re_db_down_1234567890abcdef",
        idempotencyKey: "idemp_db_down_123456",
      }),
    });

    const res = await refundRoutePost(req, { params: Promise.resolve({ publicId: order.publicId }) });
    assert.ok(res.status === 500 || res.status === 503, `Status should be 500 or 503 on database timeout, got ${res.status}`);
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error === "internal_error" || body.error === "service_unavailable", `Expected internal_error or service_unavailable, got ${body.error}`);
    assert.notEqual(body.error, "external_refund_failed", "Must never claim external refund failed when database is down");
  } finally {
    OrderModel.findOne = origFindOne;
  }
});

test("R1-18: Active pending online payment cannot be cancelled prematurely", async () => {
  // Online card order with paymentExpiresAt in the FUTURE
  const order = await createTestOrder({
    paymentMethod: "card",
    paymentStatus: "pending",
    fulfillmentStatus: "PENDING_PAYMENT",
    paymentExpiresAt: new Date(Date.now() + 900000), // 15 mins in future
  });

  const res = await cancelUnpaidOrder({
    publicId: order.publicId,
    reasonCategory: "customer_cancellation",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "cancellation_blocked_session_active");

  const check = await OrderModel.findById(order._id).lean();
  assert.equal(check?.fulfillmentStatus, "PENDING_PAYMENT");
});

test("R1-19: Uncertain expired payment cannot be prematurely cancelled if session open", async () => {
  // Order expired in the past, but has a pending payment session in DB
  const order = await createTestOrder({
    paymentMethod: "card",
    paymentStatus: "pending",
    fulfillmentStatus: "PENDING_PAYMENT",
    paymentExpiresAt: new Date(Date.now() - 60000), // 1 min in past
  });
  // Active pending payment record attached
  await createTestPayment(order._id, { status: "pending" });

  const res = await cancelUnpaidOrder({
    publicId: order.publicId,
    reasonCategory: "customer_cancellation",
    staff: STAFF_ADMIN,
  });

  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "cancellation_blocked_session_active");
});

test("R1-20: SellerSnapshot and historical financial data remain completely unchanged", async () => {
  const order = await createTestOrder({
    sellerSnapshot: {
      name: "Original Falken Restaurant",
      legalName: "Original Legal Name AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019-29 48 98",
    },
  });
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  await recordFullRefund({
    publicId: order.publicId,
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_seller_snap_check_12345",
    idempotencyKey: "idemp_snap_check_01",
    staff: STAFF_ADMIN,
  });

  const check = await OrderModel.findById(order._id).lean();
  assert.deepEqual(check?.sellerSnapshot, {
    name: "Original Falken Restaurant",
    legalName: "Original Legal Name AB",
    street: "Skolgatan 4",
    zip: "719 30",
    city: "Vintrosa",
    country: "Sverige",
    phone: "019-29 48 98",
  });
  assert.equal(check?.subtotalSek, 120);
  assert.equal(check?.totalSek, 120);
});

test("R1-21: Admin auth and CSRF are enforced on API routes", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const validPayload = {
    amountSek: 120,
    reasonCategory: "customer_cancellation",
    externalReference: "re_route_auth_check_123456",
    idempotencyKey: "idemp_route_auth_01",
  };

  // Case 1: Unauthenticated request (no cookie)
  const reqUnauth = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  });
  const resUnauth = await refundRoutePost(reqUnauth, { params: Promise.resolve({ publicId: order.publicId }) });
  assert.equal(resUnauth.status, 401);

  // Case 2: Missing or wrong CSRF token
  const reqNoCsrf = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `falken_admin_session=${globalStaffSessionToken}`,
    },
    body: JSON.stringify(validPayload),
  });
  const resNoCsrf = await refundRoutePost(reqNoCsrf, { params: Promise.resolve({ publicId: order.publicId }) });
  assert.equal(resNoCsrf.status, 403);

  // Case 3: Fully authenticated request with valid CSRF
  const reqValid = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `falken_admin_session=${globalStaffSessionToken}; falken_admin_csrf=${globalCsrfToken}`,
      "x-csrf-token": globalCsrfToken,
    },
    body: JSON.stringify(validPayload),
  });
  const resValid = await refundRoutePost(reqValid, { params: Promise.resolve({ publicId: order.publicId }) });
  assert.equal(resValid.status, 200);

  const jsonBody = (await resValid.json()) as { order: OrderDoc; changed: boolean };
  assert.equal(jsonBody.changed, true);
  assert.equal(jsonBody.order.paymentStatus, "refunded");
});

test("R1-22: Standalone MongoDB with no transaction support rejects recordFullRefund with transactions_required (0 writes)", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  // Simulate standalone mongod (command { hello: 1 } returns no setName and no isdbgrid msg)
  const originalCommand = mongoose.connection.db!.command;
  (mongoose.connection.db as any).command = async (cmd: any, options: any) => {
    if (cmd && cmd.hello) {
      return { ok: 1, isWritablePrimary: true }; // Standalone: no setName, no msg: isdbgrid
    }
    return originalCommand.call(mongoose.connection.db, cmd, options);
  };

  try {
    const res = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 120,
      reasonCategory: "customer_cancellation",
      externalReference: "re_standalone_reject_12345",
      idempotencyKey: "idemp_standalone_01",
      staff: STAFF_ADMIN,
    });

    assert.equal(res.ok, false);
    assert.equal((res as { reason: string }).reason, "transactions_required");

    // Zero writes persisted check:
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.paymentStatus, "paid");
    assert.equal(persistedOrder?.totalRefundedSek, 0);
    assert.equal(persistedOrder?.refundRecord, undefined);

    const persistedPayment = await PaymentModel.findById(payment._id).lean();
    assert.equal(persistedPayment?.status, "paid");
    assert.equal(persistedPayment?.refundedSek, 0);

    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "electronic_refund_recorded" }).lean();
    assert.equal(audit, null, "No audit log must be created when transactions are unsupported");
  } finally {
    (mongoose.connection.db as any).command = originalCommand;
  }
});

test("R1-23: Standalone MongoDB with no transaction support rejects cancelUnpaidOrder with transactions_required (0 writes)", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
  });

  const originalCommand = mongoose.connection.db!.command;
  (mongoose.connection.db as any).command = async (cmd: any, options: any) => {
    if (cmd && cmd.hello) {
      return { ok: 1, isWritablePrimary: true }; // Standalone
    }
    return originalCommand.call(mongoose.connection.db, cmd, options);
  };

  try {
    const res = await cancelUnpaidOrder({
      publicId: order.publicId,
      reasonCategory: "customer_cancellation",
      reasonNote: "Test cancel on standalone",
      staff: STAFF_ADMIN,
    });

    assert.equal(res.ok, false);
    assert.equal((res as { reason: string }).reason, "transactions_required");

    // Zero writes persisted check:
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.fulfillmentStatus, "CONFIRMED", "Order must remain CONFIRMED, not cancelled");
    assert.equal(persistedOrder?.cancelledAt, undefined);

    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "order_cancelled_unpaid" }).lean();
    assert.equal(audit, null, "No audit log must be created when transactions are unsupported");
  } finally {
    (mongoose.connection.db as any).command = originalCommand;
  }
});

test("R1-24: Atomic rollback of cancelUnpaidOrder when AuditLog creation fails (CRITICAL DEFECT 2 FIX)", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
  });

  // Inject failure into AuditLogModel.create
  const originalCreate = AuditLogModel.create;
  (AuditLogModel as any).create = async function () {
    throw new Error("INJECTED_AUDIT_LOG_CREATION_FAILURE");
  };

  try {
    await assert.rejects(
      async () => {
        await cancelUnpaidOrder({
          publicId: order.publicId,
          reasonCategory: "customer_cancellation",
          reasonNote: "Customer requested cancellation before pickup",
          staff: STAFF_ADMIN,
        });
      },
      (err: any) => {
        assert.match(err.message, /INJECTED_AUDIT_LOG_CREATION_FAILURE/);
        return true;
      },
    );

    // ATOMIC ROLLBACK VERIFICATION:
    // Order was updated to CANCELLED in the transaction before AuditLog threw.
    // The entire transaction must have rolled back. Order must remain CONFIRMED!
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.fulfillmentStatus, "CONFIRMED", "Order must NOT be CANCELLED if AuditLog fails");
    assert.equal(persistedOrder?.cancelledAt, undefined, "cancelledAt must remain undefined");
    assert.equal(persistedOrder?.statusHistory.some((s) => s.to === "CANCELLED"), false, "statusHistory must not contain CANCELLED");

    // Verify no AuditLog entry exists
    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "order_cancelled_unpaid" }).lean();
    assert.equal(audit, null, "No audit log must exist in DB");
  } finally {
    (AuditLogModel as any).create = originalCreate;
  }
});

test("R1-25: Atomic rollback of electronic recordFullRefund when Payment update fails", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  // Inject failure into PaymentModel.updateOne
  const originalUpdateOne = PaymentModel.updateOne;
  (PaymentModel as any).updateOne = async function () {
    throw new Error("INJECTED_PAYMENT_UPDATE_FAILURE");
  };

  try {
    await assert.rejects(
      async () => {
        await recordFullRefund({
          publicId: order.publicId,
          amountSek: 120,
          reasonCategory: "quality_issue",
          externalReference: "re_payment_fail_rollback_12345",
          idempotencyKey: "idemp_pay_fail_01",
          staff: STAFF_ADMIN,
        });
      },
      (err: any) => {
        assert.match(err.message, /INJECTED_PAYMENT_UPDATE_FAILURE/);
        return true;
      },
    );

    // ATOMIC ROLLBACK VERIFICATION:
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.paymentStatus, "paid", "Order paymentStatus must remain paid");
    assert.equal(persistedOrder?.fulfillmentStatus, "CONFIRMED", "Order fulfillmentStatus must remain CONFIRMED");
    assert.equal(persistedOrder?.totalRefundedSek, 0, "totalRefundedSek must remain 0");
    assert.equal(persistedOrder?.refundRecord, undefined, "refundRecord must be undefined");

    const persistedPayment = await PaymentModel.findById(payment._id).lean();
    assert.equal(persistedPayment?.status, "paid");
    assert.equal(persistedPayment?.refundedSek, 0);

    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "electronic_refund_recorded" }).lean();
    assert.equal(audit, null);
  } finally {
    (PaymentModel as any).updateOne = originalUpdateOne;
  }
});

test("R1-26: Atomic rollback of electronic recordFullRefund when AuditLog creation fails", async () => {
  const order = await createTestOrder();
  const payment = await createTestPayment(order._id);
  await OrderModel.updateOne({ _id: order._id }, { $set: { paymentId: payment._id } });

  const originalCreate = AuditLogModel.create;
  (AuditLogModel as any).create = async function () {
    throw new Error("INJECTED_REFUND_AUDIT_LOG_FAILURE");
  };

  try {
    await assert.rejects(
      async () => {
        await recordFullRefund({
          publicId: order.publicId,
          amountSek: 120,
          reasonCategory: "kitchen_delay",
          externalReference: "re_audit_fail_rollback_12345",
          idempotencyKey: "idemp_audit_fail_01",
          staff: STAFF_ADMIN,
        });
      },
      (err: any) => {
        assert.match(err.message, /INJECTED_REFUND_AUDIT_LOG_FAILURE/);
        return true;
      },
    );

    // ATOMIC ROLLBACK VERIFICATION:
    // Both Order and Payment were modified in the transaction before AuditLog threw.
    // They must BOTH be rolled back!
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.paymentStatus, "paid");
    assert.equal(persistedOrder?.totalRefundedSek, 0);
    assert.equal(persistedOrder?.refundRecord, undefined);

    const persistedPayment = await PaymentModel.findById(payment._id).lean();
    assert.equal(persistedPayment?.status, "paid");
    assert.equal(persistedPayment?.refundedSek, 0);

    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "electronic_refund_recorded" }).lean();
    assert.equal(audit, null);
  } finally {
    (AuditLogModel as any).create = originalCreate;
  }
});

test("R1-27: Atomic rollback of on-site cash refund when AuditLog creation fails", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentProvider: undefined,
    paymentStatus: "paid",
    fulfillmentStatus: "PICKED_UP",
    onSiteCollection: {
      method: "cash",
      amountSek: 120,
      collectedAt: new Date(),
      collectedBy: "staff_counter_001",
      idempotencyKey: "idemp_coll_cash_rollback",
    },
  });

  const originalCreate = AuditLogModel.create;
  (AuditLogModel as any).create = async function () {
    throw new Error("INJECTED_CASH_AUDIT_LOG_FAILURE");
  };

  try {
    await assert.rejects(
      async () => {
        await recordFullRefund({
          publicId: order.publicId,
          amountSek: 120,
          reasonCategory: "quality_issue",
          externalReference: "CASH-ROLLBACK-001",
          idempotencyKey: "idemp_cash_audit_fail",
          staff: STAFF_ADMIN,
        });
      },
      (err: any) => {
        assert.match(err.message, /INJECTED_CASH_AUDIT_LOG_FAILURE/);
        return true;
      },
    );

    // ATOMIC ROLLBACK VERIFICATION:
    const persistedOrder = await OrderModel.findById(order._id).lean();
    assert.equal(persistedOrder?.paymentStatus, "paid");
    assert.equal(persistedOrder?.fulfillmentStatus, "PICKED_UP");
    assert.equal(persistedOrder?.totalRefundedSek, 0);
    assert.equal(persistedOrder?.refundRecord, undefined);

    const audit = await AuditLogModel.findOne({ entityId: String(order._id), action: "on_site_refund_recorded" }).lean();
    assert.equal(audit, null);
  } finally {
    (AuditLogModel as any).create = originalCreate;
  }
});

test("R1-28: API routes return HTTP 503 transactions_required when transactions are unsupported", async () => {
  const order = await createTestOrder({
    paymentMethod: "pay_on_pickup",
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
  });

  const originalCommand = mongoose.connection.db!.command;
  (mongoose.connection.db as any).command = async (cmd: any, options: any) => {
    if (cmd && cmd.hello) {
      return { ok: 1, isWritablePrimary: true }; // Standalone
    }
    return originalCommand.call(mongoose.connection.db, cmd, options);
  };

  try {
    // 1. Cancel route under standalone
    const cancelReq = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `falken_admin_session=${globalStaffSessionToken}; falken_admin_csrf=${globalCsrfToken}`,
        "x-csrf-token": globalCsrfToken,
      },
      body: JSON.stringify({
        reasonCategory: "customer_cancellation",
        reasonNote: "Testing 503 on standalone",
      }),
    });
    const cancelRes = await cancelRoutePost(cancelReq, { params: Promise.resolve({ publicId: order.publicId }) });
    assert.equal(cancelRes.status, 503);
    const cancelJson = (await cancelRes.json()) as { error: string };
    assert.equal(cancelJson.error, "transactions_required");

    // 2. Refund route under standalone
    const refundReq = new Request(`http://localhost:3000/api/admin/orders/${order.publicId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `falken_admin_session=${globalStaffSessionToken}; falken_admin_csrf=${globalCsrfToken}`,
        "x-csrf-token": globalCsrfToken,
      },
      body: JSON.stringify({
        amountSek: 120,
        reasonCategory: "customer_cancellation",
        externalReference: "re_route_standalone_503_check",
        idempotencyKey: "idemp_standalone_route_503",
      }),
    });
    const refundRes = await refundRoutePost(refundReq, { params: Promise.resolve({ publicId: order.publicId }) });
    assert.equal(refundRes.status, 503);
    const refundJson = (await refundRes.json()) as { error: string };
    assert.equal(refundJson.error, "transactions_required");
  } finally {
    (mongoose.connection.db as any).command = originalCommand;
  }
});
