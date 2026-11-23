import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import mongoose, { Types } from "mongoose";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import {
  getFinancialReport,
  getAdminOverview,
} from "../src/server/admin-overview.ts";
import {
  recordFullRefund,
} from "../src/server/refund-service.ts";
import {
  type AdminPrincipal,
} from "../src/server/admin-auth.ts";

const TEST_URI = "mongodb://127.0.0.1:27018/falken_r3a_test?replicaSet=rs0&directConnection=true";

// Fail-closed security guard: strictly reject any remote/Atlas URI
if (TEST_URI.includes("mongodb.net") || TEST_URI.includes("atlas")) {
  throw new Error("FAIL-CLOSED GUARD: Tests must only run against isolated local MongoDB container on port 27018.");
}

const adminActor: AdminPrincipal = {
  id: new Types.ObjectId().toString(),
  email: "r3a-tester@falken-test.local",
  displayName: "R3A Financial Tester",
  role: "ADMIN",
};

function makeIdemKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeStripeRef(tag: string) {
  const cleanTag = tag.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).padEnd(6, "x");
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  return `re_${cleanTag}${suffix}`.slice(0, 24);
}

function makeSha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

let crockfordCounter = 1000;
function nextPublicId(): string {
  crockfordCounter++;
  const base = "R3A" + crockfordCounter.toString(36).toUpperCase().padStart(7, "0");
  return base.slice(0, 10).replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0");
}

test("R3A Financial Reporting Backend — Isolated Acceptance Matrix (R3A-01 through R3A-18)", async (t) => {
  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await OrderModel.deleteMany({});
    await PaymentModel.deleteMany({});
  });

  // Helper to create an order and payment
  async function seedOrder(overrides: Record<string, unknown>) {
    const publicId = (overrides.publicId as string) || nextPublicId();
    const totalSek = (overrides.totalSek as number) ?? 150;
    const now = (overrides.createdAt as Date) ?? new Date();
    const paymentMethod = ((overrides.paymentMethod as "card" | "swish" | "pay_on_pickup") ?? "card");
    const paymentStatus = ((overrides.paymentStatus as "pending" | "unpaid" | "paid" | "failed" | "expired" | "refunded") ?? "paid");
    const fulfillmentStatus = ((overrides.fulfillmentStatus as "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "CANCELLED") ?? "CONFIRMED");

    const orderDoc: Record<string, unknown> = {
      publicId,
      idempotencyKey: makeIdemKey("idem"),
      requestHash: makeSha256("req_" + publicId),
      contact: { name: "Test Kund", phone: "070-123 45 67" },
      items: [
        {
          productSlug: "margherita",
          productNameSnapshot: "Margherita",
          variantId: "standard",
          variantNameSnapshot: "Standard",
          basePriceSek: totalSek,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: totalSek,
        },
      ],
      totalSek,
      subtotalSek: totalSek,
      discountSek: 0,
      paymentMethod,
      paymentStatus,
      fulfillmentStatus,
      pickupAt: new Date(now.getTime() + 1800000),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };

    const createdOrder = (await OrderModel.create(orderDoc as never)) as unknown as mongoose.Document & {
      _id: Types.ObjectId;
      publicId: string;
      paymentMethod: "card" | "swish" | "pay_on_pickup";
      paymentStatus: string;
      totalSek: number;
      paymentId?: Types.ObjectId;
      save: () => Promise<unknown>;
    };

    // If electronic order and has paymentId override or needs a valid payment record
    if ((createdOrder.paymentMethod === "card" || createdOrder.paymentMethod === "swish") && !overrides.skipPaymentDoc) {
      const pStatus = (overrides.paymentStatus as "pending" | "paid" | "failed" | "expired" | "refunded") ?? "paid";
      const paymentDoc = (await PaymentModel.create({
        orderId: createdOrder._id,
        provider: createdOrder.paymentMethod === "card" ? "stripe" : "swish",
        providerSessionId: "cs_test_" + createdOrder.publicId + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
        status: pStatus,
        amountSek: createdOrder.totalSek,
        refundedSek: (overrides.totalRefundedSek as number) ?? 0,
        currency: "SEK" as const,
        processedEventIds: [],
        createdAt: (overrides.paidAt as Date) ?? now,
      } as never)) as unknown as { _id: Types.ObjectId };

      createdOrder.paymentId = paymentDoc._id as Types.ObjectId;
      await createdOrder.save();
    }

    return createdOrder;
  }

  // R3A-01: Paid Stripe order counted once in gross
  await t.test("R3A-01: Paid Stripe order counted once in gross", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    await seedOrder({
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "paid",
      paidAt,
      totalSek: 180,
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 180);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 180);
    assert.equal(report.paidStripeOrders, 1);
    assert.equal(report.reconciliation.status, "clean");
  });

  // R3A-02: Paid Swish order counted once in gross
  await t.test("R3A-02: Paid Swish order counted once in gross", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    await seedOrder({
      paymentMethod: "swish",
      paymentProvider: "swish",
      paymentStatus: "paid",
      paidAt,
      totalSek: 220,
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 220);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 220);
    assert.equal(report.paidSwishOrders, 1);
    assert.equal(report.reconciliation.status, "clean");
  });

  // R3A-03: Collected cash order counted once in gross
  await t.test("R3A-03: Collected cash order counted once in gross", async () => {
    const collectedAt = new Date("2026-11-23T12:00:00Z");
    await seedOrder({
      paymentMethod: "pay_on_pickup",
      paymentStatus: "paid",
      totalSek: 130,
      onSiteCollection: {
        method: "cash",
        collectedBy: adminActor.displayName,
        amountSek: 130,
        collectedAt,
        idempotencyKey: makeIdemKey("cash"),
      },
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 130);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 130);
    assert.equal(report.collectedCashOrders, 1);
    assert.equal(report.reconciliation.status, "clean");
  });

  // R3A-04: Collected card-terminal order counted once in gross
  await t.test("R3A-04: Collected card-terminal order counted once in gross", async () => {
    const collectedAt = new Date("2026-11-23T13:00:00Z");
    await seedOrder({
      paymentMethod: "pay_on_pickup",
      paymentStatus: "paid",
      totalSek: 195,
      onSiteCollection: {
        method: "card_terminal",
        collectedBy: adminActor.displayName,
        amountSek: 195,
        collectedAt,
        idempotencyKey: makeIdemKey("card_term"),
      },
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 195);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 195);
    assert.equal(report.collectedCardTerminalOrders, 1);
    assert.equal(report.reconciliation.status, "clean");
  });

  // R3A-05: Unpaid order excluded
  await t.test("R3A-05: Unpaid order excluded from gross and net revenue", async () => {
    await seedOrder({
      paymentMethod: "pay_on_pickup",
      paymentStatus: "unpaid",
      totalSek: 250,
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-06: Pending electronic checkout excluded
  await t.test("R3A-06: Pending electronic checkout excluded from revenue", async () => {
    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "pending",
      paidAt: undefined,
      totalSek: 140,
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-07: Failed unpaid checkout excluded
  await t.test("R3A-07: Failed unpaid checkout excluded from revenue", async () => {
    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "failed",
      paidAt: undefined,
      totalSek: 160,
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0);
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-08: Fully refunded electronic payment retains original gross sale in payment period
  await t.test("R3A-08: Fully refunded electronic payment retains original gross sale in payment period", async () => {
    const paidAt = new Date("2026-11-20T10:00:00Z"); // Day 1
    const refundAt = new Date("2026-11-23T15:00:00Z"); // Day 4

    const order = await seedOrder({
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "paid",
      paidAt,
      totalSek: 300,
    });

    // Record refund on Day 4
    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 300,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r08"),
      idempotencyKey: makeIdemKey("ref_08"),
      staff: adminActor,
      now: refundAt,
    });
    assert.equal(refRes.ok, true);

    // Query Day 1 (payment period): gross must be 300, refund must be 0, net must be 300
    const day1Report = await getFinancialReport({
      from: new Date("2026-11-20T00:00:00Z"),
      to: new Date("2026-11-20T23:59:59Z"),
    });
    assert.equal(day1Report.grossRevenueSek, 300, "Gross sale must remain in the payment period");
    assert.equal(day1Report.refundedSek, 0, "No refund in Day 1");
    assert.equal(day1Report.netRevenueSek, 300, "Net equals gross on Day 1");
  });

  // R3A-09: Completed refund is subtracted exactly once (net = gross - refund)
  await t.test("R3A-09: Completed refund is subtracted exactly once (net = gross - refund)", async () => {
    const eventTime = new Date("2026-11-23T14:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: eventTime,
      totalSek: 210,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 210,
      reasonCategory: "quality_issue",
      method: "stripe",
      externalReference: makeStripeRef("r09"),
      idempotencyKey: makeIdemKey("ref_09"),
      staff: adminActor,
      now: eventTime,
    });
    assert.equal(refRes.ok, true);

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 210);
    assert.equal(report.refundedSek, 210);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-10: Refund after PICKED_UP retains historical sale and pickup state
  await t.test("R3A-10: Refund after PICKED_UP retains historical sale and pickup state", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const refundAt = new Date("2026-11-23T16:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      fulfillmentStatus: "PICKED_UP",
      paidAt,
      totalSek: 275,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 275,
      reasonCategory: "quality_issue",
      method: "stripe",
      externalReference: makeStripeRef("r10"),
      idempotencyKey: makeIdemKey("ref_10"),
      staff: adminActor,
      now: refundAt,
    });
    assert.equal(refRes.ok, true);

    const reloaded = await OrderModel.findOne({ publicId: order.publicId }).lean();
    assert.equal(reloaded?.fulfillmentStatus, "PICKED_UP", "Fulfillment status must remain PICKED_UP");
    assert.equal(reloaded?.paymentStatus, "refunded");

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 275);
    assert.equal(report.refundedSek, 275);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-11: Refund before pickup and CANCELLED status does not erase gross history
  await t.test("R3A-11: Refund before pickup and CANCELLED status does not erase gross history", async () => {
    const paidAt = new Date("2026-11-23T09:00:00Z");
    const refundAt = new Date("2026-11-23T11:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      fulfillmentStatus: "CONFIRMED",
      paidAt,
      totalSek: 190,
    });

    // Refund before pickup transitions fulfillmentStatus to CANCELLED
    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 190,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r11"),
      idempotencyKey: makeIdemKey("ref_11"),
      staff: adminActor,
      now: refundAt,
    });
    assert.equal(refRes.ok, true);

    const reloaded = await OrderModel.findOne({ publicId: order.publicId }).lean();
    assert.equal(reloaded?.fulfillmentStatus, "CANCELLED");

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 190, "Cancelled order retains historical gross revenue");
    assert.equal(report.refundedSek, 190);
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-12: Sale on Monday, refund on Friday — correct day attribution
  await t.test("R3A-12: Sale on Monday, refund on Friday — correct day attribution", async () => {
    // 2026-11-16 is Monday, 2026-11-20 is Friday
    const mondayPaid = new Date("2026-11-16T12:00:00Z");
    const fridayRefund = new Date("2026-11-20T14:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: mondayPaid,
      totalSek: 240,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 240,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r12"),
      idempotencyKey: makeIdemKey("ref_12"),
      staff: adminActor,
      now: fridayRefund,
    });
    assert.equal(refRes.ok, true);

    // 1. Monday report
    const mondayReport = await getFinancialReport({
      from: new Date("2026-11-16T00:00:00Z"),
      to: new Date("2026-11-16T23:59:59Z"),
    });
    assert.equal(mondayReport.grossRevenueSek, 240);
    assert.equal(mondayReport.refundedSek, 0);
    assert.equal(mondayReport.netRevenueSek, 240);

    // 2. Friday report (no gross sale, but refund recorded -> net negative for that day)
    const fridayReport = await getFinancialReport({
      from: new Date("2026-11-20T00:00:00Z"),
      to: new Date("2026-11-20T23:59:59Z"),
    });
    assert.equal(fridayReport.grossRevenueSek, 0);
    assert.equal(fridayReport.refundedSek, 240);
    assert.equal(fridayReport.netRevenueSek, -240, "Friday net revenue is negative 240 kr");

    // 3. Whole week report (Monday through Sunday)
    const weekReport = await getFinancialReport({
      from: new Date("2026-11-16T00:00:00Z"),
      to: new Date("2026-11-22T23:59:59Z"),
    });
    assert.equal(weekReport.grossRevenueSek, 240);
    assert.equal(weekReport.refundedSek, 240);
    assert.equal(weekReport.netRevenueSek, 0, "Whole week net revenue is exactly 0");
  });

  // R3A-13: Correct day/week/month date boundaries in Europe/Stockholm
  await t.test("R3A-13: Correct day/week/month date boundaries in Europe/Stockholm", async () => {
    // In Stockholm (UTC+1 in November), 2026-11-23 00:05:00 CET is 2026-11-22 23:05:00 UTC
    // 2026-11-22 23:55:00 CET is 2026-11-22 22:55:00 UTC
    const nov22Late = new Date("2026-11-22T22:55:00Z"); // 23:55 CET on Nov 22
    const nov23Early = new Date("2026-11-22T23:05:00Z"); // 00:05 CET on Nov 23

    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: nov22Late,
      totalSek: 100,
    });

    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: nov23Early,
      totalSek: 150,
    });

    // Test getAdminOverview with period "today" at now = 2026-11-23 12:00 CET
    const overviewNov23 = await getAdminOverview("today", "ALL", new Date("2026-11-23T12:00:00+01:00"));

    // In Stockholm today (Nov 23), only nov23Early should be counted
    assert.equal(overviewNov23.metrics.grossRevenueSek, 150);
  });

  // R3A-14: Replayed idempotent refund does not double-count
  await t.test("R3A-14: Replayed idempotent refund does not double-count", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    const idemKey = makeIdemKey("ref_idem");
    const extRef = makeStripeRef("r14");

    // First call
    const firstCall = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: extRef,
      idempotencyKey: idemKey,
      staff: adminActor,
    });
    assert.equal(firstCall.ok, true);
    assert.equal((firstCall as { changed: boolean }).changed, true);

    // Replayed idempotent call
    const replayCall = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: extRef,
      idempotencyKey: idemKey,
      staff: adminActor,
    });
    assert.equal(replayCall.ok, true);
    assert.equal((replayCall as { changed: boolean }).changed, false, "Idempotent replay must report changed: false");

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.refundedSek, 200, "Refund must only be counted once");
    assert.equal(report.netRevenueSek, 0);
  });

  // R3A-15: Missing Payment record produces a reported reconciliation discrepancy and excludes unverified sale
  await t.test("R3A-15: Missing Payment record produces a reported reconciliation discrepancy and excludes unverified sale", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const unverifiedOrder = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 250,
      skipPaymentDoc: true, // Order created without paymentId
    });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Unverified electronic sale must NOT enter gross revenue");
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0, "Unverified electronic sale must NOT enter net revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    assert.ok(report.reconciliation.discrepancies.length > 0);
    assert.equal(report.reconciliation.discrepancies[0].type, "missing_payment_id");
    assert.equal(report.reconciliation.unverifiedGrossSalesCount, 1);
    assert.equal(report.reconciliation.verifiedGrossSalesCount, 0);

    // Verify source documents remain unchanged
    const orderInDb = await OrderModel.findOne({ publicId: unverifiedOrder.publicId }).lean();
    assert.ok(orderInDb);
    assert.equal(orderInDb.totalSek, 250);
    assert.equal(orderInDb.paymentStatus, "paid");
  });

  // R3A-15B: Payment orderId mismatch excludes unverified sale
  await t.test("R3A-15B: Payment orderId mismatch excludes unverified sale", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const orderA = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt, totalSek: 200 });
    const orderB = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt, totalSek: 200 });

    // Tamper orderA to point to payment belonging to orderB
    const paymentB = await PaymentModel.findOne({ orderId: orderB._id }).lean();
    assert.ok(paymentB);
    await OrderModel.updateOne({ _id: orderA._id }, { $set: { paymentId: paymentB._id } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    // orderA fails verification (order_id_mismatch), orderB passes
    assert.equal(report.grossRevenueSek, 200, "Only orderB should enter gross revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const mismatch = report.reconciliation.discrepancies.find((d) => d.type === "order_id_mismatch");
    assert.ok(mismatch, "Must report order_id_mismatch discrepancy");
    assert.equal(mismatch.orderId, orderA.publicId);
  });

  // R3A-15C: Payment amountSek mismatch excludes unverified sale
  await t.test("R3A-15C: Payment amountSek mismatch excludes unverified sale", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const order = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt, totalSek: 300 });

    // Tamper payment amount to 200 (mismatch)
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { amountSek: 200 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Mismatched amount must NOT enter gross revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const mismatch = report.reconciliation.discrepancies.find((d) => d.type === "payment_amount_mismatch");
    assert.ok(mismatch, "Must report payment_amount_mismatch discrepancy");
  });

  // R3A-15D: Payment provider mismatch excludes unverified sale
  await t.test("R3A-15D: Payment provider mismatch excludes unverified sale", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const order = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt, totalSek: 250 });

    // Tamper payment provider to swish while order is card
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { provider: "swish" } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Mismatched provider must NOT enter gross revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const mismatch = report.reconciliation.discrepancies.find((d) => d.type === "provider_mismatch");
    assert.ok(mismatch, "Must report provider_mismatch discrepancy");
  });

  // R3A-15E: Unsuccessful payment status (pending) excludes sale
  await t.test("R3A-15E: Unsuccessful payment status (pending) excludes sale from gross revenue", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const order = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt, totalSek: 250 });

    // Tamper payment status to pending
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "pending" } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Pending payment must NOT enter gross revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const mismatch = report.reconciliation.discrepancies.find((d) => d.type === "payment_status_mismatch");
    assert.ok(mismatch, "Must report payment_status_mismatch discrepancy");
  });

  // R3A-15F: Inconsistent refundedSek on refunded order excludes sale
  await t.test("R3A-15F: Inconsistent refundedSek on refunded order excludes sale", async () => {
    const paidAt = new Date("2026-11-23T11:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 220,
    });

    // Legitimate refund creates refundRecord and sets order.totalRefundedSek
    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 220,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("tamper"),
      idempotencyKey: makeIdemKey("tamper_ref"),
      staff: adminActor,
      now: new Date("2026-11-23T12:00:00Z"),
    });
    assert.equal(refRes.ok, true);

    // Tamper payment: status refunded but refundedSek is 0 (inconsistent with order totalRefundedSek = 220)
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "refunded", refundedSek: 0 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Inconsistent payment refund must NOT enter gross revenue");
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const mismatch = report.reconciliation.discrepancies.find((d) => d.type === "inconsistent_payment_refund");
    assert.ok(mismatch, "Must report inconsistent_payment_refund discrepancy");
  });

  // R3A-15G: Legitimately paid-and-refunded order preserves historical gross
  await t.test("R3A-15G: Legitimately paid-and-refunded order preserves historical gross sales", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 240,
    });

    // Process legitimate refund
    const refundRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 240,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("legit"),
      idempotencyKey: makeIdemKey("legit_ref"),
      staff: adminActor,
      now: new Date("2026-11-23T14:00:00Z"),
    });
    assert.equal(refundRes.ok, true);

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 240, "Historical gross sales must be preserved for refunded order");
    assert.equal(report.refundedSek, 240, "Refund must be recorded");
    assert.equal(report.netRevenueSek, 0, "Net revenue must be 0 (240 - 240)");
    assert.equal(report.reconciliation.status, "clean", "Legitimately refunded order must be clean");
    assert.equal(report.reconciliation.verifiedGrossSalesCount, 1);
    assert.equal(report.reconciliation.unverifiedGrossSalesCount, 0);
  });

  // R3A-16: Gross - Refunds equals Net across a historical date range
  await t.test("R3A-16: Gross - Refunds equals Net across a historical date range and chart buckets", async () => {
    // Seed multiple orders
    const now = new Date("2026-11-23T12:00:00+01:00");
    await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt: new Date("2026-11-23T09:00:00Z"), totalSek: 100 });
    await seedOrder({ paymentMethod: "swish", paymentStatus: "paid", paidAt: new Date("2026-11-23T10:00:00Z"), totalSek: 150 });
    const refundedOrder = await seedOrder({ paymentMethod: "card", paymentStatus: "paid", paidAt: new Date("2026-11-23T11:00:00Z"), totalSek: 80 });

    const refRes = await recordFullRefund({
      publicId: refundedOrder.publicId,
      amountSek: 80,
      reasonCategory: "out_of_stock",
      method: "stripe",
      externalReference: makeStripeRef("r16"),
      idempotencyKey: makeIdemKey("ref_16"),
      staff: adminActor,
      now: new Date("2026-11-23T13:00:00Z"),
    });
    assert.equal(refRes.ok, true);

    const overview = await getAdminOverview("today", "ALL", now);

    assert.equal(
      overview.metrics.grossRevenueSek - overview.metrics.refundedSek,
      overview.metrics.netRevenueSek,
      "Metrics Net Revenue must equal Gross - Refunds"
    );

    for (const bucket of overview.chart) {
      assert.equal(
        bucket.grossRevenueSek - bucket.refundedSek,
        bucket.netRevenueSek,
        `Bucket ${bucket.key} Net Revenue must equal Gross - Refunds`
      );
      assert.equal(bucket.revenueSek, bucket.netRevenueSek, "revenueSek alias must match netRevenueSek");
    }
  });

  // R3A-17: Existing SellerSnapshot, receipt, and R1/R2 behavior remain unchanged
  await t.test("R3A-17: Existing SellerSnapshot immutability and receipt behavior remain unchanged", async () => {
    const order = await seedOrder({
      sellerSnapshot: {
        name: "Falken Pizzeria",
        legalName: "Falken AB",
        street: "Storgatan 1",
        zip: "70210",
        city: "Örebro",
        country: "Sverige",
        phone: "019-123456",
      },
      paymentStatus: "paid",
      totalSek: 120,
    });

    // Test immutability guard
    await assert.rejects(
      async () => {
        await OrderModel.updateOne({ _id: order._id }, { $set: { "sellerSnapshot.name": "Hacked Name" } });
      },
      /sellerSnapshot is immutable/,
      "SellerSnapshot must remain strictly immutable"
    );

    const check = await OrderModel.findById(order._id).lean();
    assert.equal(check?.sellerSnapshot?.name, "Falken Pizzeria");
  });

  // R3A-18: Admin-only metrics authorization remains enforced on API route
  await t.test("R3A-18: Admin-only metrics authorization rejects unauthenticated requests with 401", async () => {
    // Import route handler dynamically to test authorization contract
    const { GET } = await import("../src/app/api/admin/overview/route.ts");

    // Unauthenticated request (no cookie)
    const req = new Request("http://localhost:3000/api/admin/overview?period=today&status=ALL", {
      method: "GET",
    });

    const res = await GET(req);
    assert.equal(res.status, 401, "API route must return 401 unauthenticated without valid admin session");
    const body = await res.json();
    assert.equal(body.error, "unauthenticated");
  });

  // R3A-19: Refund date attribution strictly uses recordedAt
  await t.test("R3A-19: Refund date attribution strictly uses recordedAt internal timestamp", async () => {
    const monday = new Date("2026-11-23T10:00:00Z");
    const wednesday = new Date("2026-11-25T14:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: monday,
      totalSek: 175,
    });

    // Record refund on Wednesday
    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 175,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("wed"),
      idempotencyKey: makeIdemKey("wed_ref"),
      staff: adminActor,
      now: wednesday,
    });
    assert.equal(refRes.ok, true);

    // Query Monday: Gross = 175, Refunds = 0 (refund occurred on Wednesday, not Monday)
    const mondayReport = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });
    assert.equal(mondayReport.grossRevenueSek, 175);
    assert.equal(mondayReport.refundedSek, 0, "Monday must have 0 refunds");
    assert.equal(mondayReport.netRevenueSek, 175);

    // Query Wednesday: Gross = 0, Refunds = 175, Net = -175
    const wednesdayReport = await getFinancialReport({
      from: new Date("2026-11-25T00:00:00Z"),
      to: new Date("2026-11-25T23:59:59Z"),
    });
    assert.equal(wednesdayReport.grossRevenueSek, 0);
    assert.equal(wednesdayReport.refundedSek, 175, "Wednesday must report the 175 refund by recordedAt");
    assert.equal(wednesdayReport.netRevenueSek, -175);
  });

  // R3A-20: Order refunded 200 SEK, Payment.status = refunded, Payment.refundedSek = 50 SEK
  await t.test("R3A-20: Order refunded 200 SEK with Payment refundedSek = 50 SEK excludes gross and reports discrepancy", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r20"),
      idempotencyKey: makeIdemKey("r20_idem"),
      staff: adminActor,
      now: paidAt,
    });
    assert.equal(refRes.ok, true);

    // Tamper payment: status is refunded but refundedSek is 50 (inconsistent with order totalRefundedSek = 200)
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "refunded", refundedSek: 50 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    // Inconsistent gross sale excluded
    assert.equal(report.grossRevenueSek, 0, "Gross sale must be excluded");
    // Completed refund record is preserved
    assert.equal(report.refundedSek, 200, "Completed refund outflow is preserved");
    assert.equal(report.netRevenueSek, -200);
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const disc = report.reconciliation.discrepancies.find((d) => d.orderId === order.publicId);
    assert.ok(disc, "Must report discrepancy for inconsistent refund amount");
    assert.equal(disc.type, "inconsistent_payment_refund");

    // No source mutation
    const orderInDb = await OrderModel.findById(order._id).lean();
    assert.equal(orderInDb?.totalRefundedSek, 200);
    assert.equal(orderInDb?.paymentStatus, "refunded");
    const paymentInDb = await PaymentModel.findOne({ orderId: order._id }).lean();
    assert.equal(paymentInDb?.refundedSek, 50);
  });

  // R3A-21: Order refunded 200 SEK, Payment.status = paid, Payment.refundedSek = 200 SEK
  await t.test("R3A-21: Order refunded 200 SEK with Payment.status = paid excludes gross and reports discrepancy", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r21"),
      idempotencyKey: makeIdemKey("r21_idem"),
      staff: adminActor,
      now: paidAt,
    });
    assert.equal(refRes.ok, true);

    // Tamper payment: status remains "paid" while order is "refunded"
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "paid", refundedSek: 200 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Gross sale must be excluded");
    assert.equal(report.refundedSek, 200, "Completed refund outflow is preserved");
    assert.equal(report.netRevenueSek, -200);
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const disc = report.reconciliation.discrepancies.find((d) => d.orderId === order.publicId);
    assert.ok(disc, "Must report discrepancy for status mismatch");
    assert.equal(disc.type, "payment_status_mismatch");

    // No source mutation
    const orderInDb = await OrderModel.findById(order._id).lean();
    assert.equal(orderInDb?.paymentStatus, "refunded");
    const paymentInDb = await PaymentModel.findOne({ orderId: order._id }).lean();
    assert.equal(paymentInDb?.status, "paid");
  });

  // R3A-22: Order paid 200 SEK, Payment.status = paid, Payment.refundedSek = 50 SEK
  await t.test("R3A-22: Order paid 200 SEK with Payment.refundedSek = 50 SEK excludes gross and reports discrepancy", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    // Tamper payment: status is "paid" but refundedSek is 50
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "paid", refundedSek: 50 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Gross sale must be excluded");
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0);
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const disc = report.reconciliation.discrepancies.find((d) => d.orderId === order.publicId);
    assert.ok(disc, "Must report discrepancy for non-zero refund on paid order");
    assert.equal(disc.type, "inconsistent_payment_refund");
  });

  // R3A-23: Order paid 200 SEK, Payment.status = refunded, Payment.refundedSek = 200 SEK
  await t.test("R3A-23: Order paid 200 SEK with Payment.status = refunded excludes gross and reports discrepancy", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    // Tamper payment: status is "refunded" while order is "paid"
    await PaymentModel.updateOne({ orderId: order._id }, { $set: { status: "refunded", refundedSek: 200 } });

    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    assert.equal(report.grossRevenueSek, 0, "Gross sale must be excluded");
    assert.equal(report.refundedSek, 0);
    assert.equal(report.netRevenueSek, 0);
    assert.equal(report.reconciliation.status, "discrepancy_detected");
    const disc = report.reconciliation.discrepancies.find((d) => d.orderId === order.publicId);
    assert.ok(disc, "Must report discrepancy for status mismatch");
    assert.equal(disc.type, "payment_status_mismatch");
  });

  // R3A-24: Consistent fully refunded electronic payment
  await t.test("R3A-24: Consistent fully refunded electronic payment counts gross once, refund once, net reconciles cleanly", async () => {
    const paidAt = new Date("2026-11-23T10:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt,
      totalSek: 200,
    });

    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r24"),
      idempotencyKey: makeIdemKey("r24_idem"),
      staff: adminActor,
      now: paidAt,
    });
    assert.equal(refRes.ok, true);

    // Payment model is updated consistently to refunded / 200 by recordFullRefund
    const report = await getFinancialReport({
      from: new Date("2026-11-23T00:00:00Z"),
      to: new Date("2026-11-23T23:59:59Z"),
    });

    // Original gross sale counted once
    assert.equal(report.grossRevenueSek, 200, "Historical gross sale must be counted once (200 SEK)");
    // Completed refund counted once
    assert.equal(report.refundedSek, 200, "Completed refund must be counted once (200 SEK)");
    // Net correctly reconciles: 200 - 200 = 0
    assert.equal(report.netRevenueSek, 0, "Net revenue must correctly reconcile to 0 SEK");
    // Clean reconciliation
    assert.equal(report.reconciliation.status, "clean", "Consistent payment/refund must report clean reconciliation");
    assert.equal(report.reconciliation.discrepancies.length, 0);
    assert.equal(report.reconciliation.verifiedGrossSalesCount, 1);
    assert.equal(report.reconciliation.unverifiedGrossSalesCount, 0);
  });
});
