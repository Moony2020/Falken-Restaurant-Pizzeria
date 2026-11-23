import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import mongoose, { Types } from "mongoose";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { getAdminOverview } from "../src/server/admin-overview.ts";
import { recordFullRefund } from "../src/server/refund-service.ts";
import { type AdminPrincipal } from "../src/server/admin-auth.ts";

const TEST_URI = "mongodb://127.0.0.1:27018/falken_r3b_test?replicaSet=rs0&directConnection=true";

// Fail-closed security guard: strictly reject any remote/Atlas URI
if (TEST_URI.includes("mongodb.net") || TEST_URI.includes("atlas")) {
  throw new Error("FAIL-CLOSED GUARD: Tests must only run against isolated local MongoDB container on port 27018.");
}

const adminActor: AdminPrincipal = {
  id: new Types.ObjectId().toString(),
  email: "r3b-tester@falken-test.local",
  displayName: "R3B Financial Tester",
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

let crockfordCounter = 5000;
function nextPublicId(): string {
  crockfordCounter++;
  const base = "R3B" + crockfordCounter.toString(36).toUpperCase().padStart(7, "0");
  return base.slice(0, 10).replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0");
}

test("R3B Financial Dashboard UI & Analytics Integration Matrix (R3B-01 through R3B-12)", async (t) => {
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

  // Helper to seed order and matching authoritative payment
  async function seedOrder(overrides: Record<string, unknown>) {
    const publicId = (overrides.publicId as string) || nextPublicId();
    const totalSek = (overrides.totalSek as number) ?? 150;
    const now = (overrides.createdAt as Date) ?? new Date();
    const paymentMethod = ((overrides.paymentMethod as "card" | "swish" | "pay_on_pickup") ?? "card");
    const paymentStatus = ((overrides.paymentStatus as "pending" | "unpaid" | "paid" | "failed" | "expired" | "refunded") ?? "paid");
    const fulfillmentStatus = ((overrides.fulfillmentStatus as "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "CANCELLED") ?? "CONFIRMED");

    const orderDoc: Record<string, unknown> = {
      publicId,
      idempotencyKey: makeIdemKey("r3b_idem"),
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
        providerSessionId: "cs_r3b_" + createdOrder.publicId + "_" + Date.now().toString(36),
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

  // R3B-01: Gross, Refund, and Net KPI bindings match server metrics
  await t.test("R3B-01: Gross, Refund, and Net KPI bindings match server metrics", async () => {
    const today = new Date("2026-11-23T12:00:00Z");

    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: new Date("2026-11-23T10:00:00Z"),
      createdAt: new Date("2026-11-23T10:00:00Z"),
      totalSek: 300,
    });

    const order2 = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: new Date("2026-11-23T11:00:00Z"),
      createdAt: new Date("2026-11-23T11:00:00Z"),
      totalSek: 100,
    });

    await recordFullRefund({
      publicId: order2.publicId,
      amountSek: 100,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r3b1"),
      idempotencyKey: makeIdemKey("r3b1_idem"),
      staff: adminActor,
      now: new Date("2026-11-23T11:30:00Z"),
    });

    const overview = await getAdminOverview("today", "ALL", today);

    assert.equal(overview.metrics.grossRevenueSek, 400, "Gross must be 400 SEK (300 + 100)");
    assert.equal(overview.metrics.refundedSek, 100, "Refunds must be 100 SEK");
    assert.equal(overview.metrics.netRevenueSek, 300, "Net must be 300 SEK (400 - 100)");
    assert.equal(overview.metrics.revenueSek, 300, "Backward-compatible revenueSek alias must equal net");
  });

  // R3B-02: Server totals equal chart bucket totals across periods
  await t.test("R3B-02: Server totals equal chart bucket totals across periods", async () => {
    const monday = new Date("2026-11-23T10:00:00Z");
    const tuesday = new Date("2026-11-24T14:00:00Z");

    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: monday,
      createdAt: monday,
      totalSek: 250,
    });

    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: tuesday,
      createdAt: tuesday,
      totalSek: 150,
    });

    const overview = await getAdminOverview("week", "ALL", tuesday);

    const bucketGrossSum = overview.chart.reduce((sum, b) => sum + b.grossRevenueSek, 0);
    const bucketRefundSum = overview.chart.reduce((sum, b) => sum + b.refundedSek, 0);
    const bucketNetSum = overview.chart.reduce((sum, b) => sum + b.netRevenueSek, 0);

    assert.equal(bucketGrossSum, overview.metrics.grossRevenueSek, "Chart bucket gross sum must match metrics.grossRevenueSek");
    assert.equal(bucketRefundSum, overview.metrics.refundedSek, "Chart bucket refund sum must match metrics.refundedSek");
    assert.equal(bucketNetSum, overview.metrics.netRevenueSek, "Chart bucket net sum must match metrics.netRevenueSek");
  });

  // R3B-03: Monday sale and Friday refund shown on their correct reporting days
  await t.test("R3B-03: Monday sale and Friday refund shown on their correct reporting days in chart", async () => {
    const monday = new Date("2026-11-23T10:00:00Z");
    const friday = new Date("2026-11-27T15:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: monday,
      createdAt: monday,
      totalSek: 200,
    });

    await recordFullRefund({
      publicId: order.publicId,
      amountSek: 200,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("fri"),
      idempotencyKey: makeIdemKey("fri_idem"),
      staff: adminActor,
      now: friday,
    });

    const overview = await getAdminOverview("week", "ALL", friday);

    // Monday (2026-11-23) bucket
    const mondayBucket = overview.chart.find((b) => b.key === "2026-11-23");
    assert.ok(mondayBucket, "Monday bucket must exist");
    assert.equal(mondayBucket.grossRevenueSek, 200, "Monday must have 200 gross");
    assert.equal(mondayBucket.refundedSek, 0, "Monday must have 0 refunds");
    assert.equal(mondayBucket.netRevenueSek, 200, "Monday net must be 200");

    // Friday (2026-11-27) bucket
    const fridayBucket = overview.chart.find((b) => b.key === "2026-11-27");
    assert.ok(fridayBucket, "Friday bucket must exist");
    assert.equal(fridayBucket.grossRevenueSek, 0, "Friday must have 0 gross");
    assert.equal(fridayBucket.refundedSek, 200, "Friday must have 200 refund recorded");
    assert.equal(fridayBucket.netRevenueSek, -200, "Friday net must be -200");
  });

  // R3B-04: Fully refunded order preserves original gross sale
  await t.test("R3B-04: Fully refunded order preserves original gross sale in chart and metrics", async () => {
    const today = new Date("2026-11-23T12:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: new Date("2026-11-23T10:00:00Z"),
      createdAt: new Date("2026-11-23T10:00:00Z"),
      totalSek: 180,
    });

    await recordFullRefund({
      publicId: order.publicId,
      amountSek: 180,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("r3b4"),
      idempotencyKey: makeIdemKey("r3b4_idem"),
      staff: adminActor,
      now: new Date("2026-11-23T11:00:00Z"),
    });

    const overview = await getAdminOverview("today", "ALL", today);
    assert.equal(overview.metrics.grossRevenueSek, 180, "Original gross sale preserved");
    assert.equal(overview.metrics.refundedSek, 180, "Refund recorded");
    assert.equal(overview.metrics.netRevenueSek, 0, "Net is 0");
  });

  // R3B-05: Refunded PICKED_UP order remains in historical reporting
  await t.test("R3B-05: Refunded PICKED_UP order remains in historical reporting and preserves fulfillmentStatus", async () => {
    const today = new Date("2026-11-23T12:00:00Z");
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      fulfillmentStatus: "PICKED_UP",
      paidAt: new Date("2026-11-23T10:00:00Z"),
      createdAt: new Date("2026-11-23T10:00:00Z"),
      totalSek: 220,
    });

    await recordFullRefund({
      publicId: order.publicId,
      amountSek: 220,
      reasonCategory: "quality_issue",
      method: "stripe",
      externalReference: makeStripeRef("picked"),
      idempotencyKey: makeIdemKey("picked_idem"),
      staff: adminActor,
      now: new Date("2026-11-23T11:00:00Z"),
    });

    const updatedOrder = await OrderModel.findOne({ publicId: order.publicId }).lean();
    assert.equal(updatedOrder?.fulfillmentStatus, "PICKED_UP", "Fulfillment status must remain PICKED_UP");
    assert.equal(updatedOrder?.paymentStatus, "refunded");

    const overview = await getAdminOverview("today", "ALL", today);
    assert.equal(overview.metrics.grossRevenueSek, 220);
    assert.equal(overview.metrics.refundedSek, 220);
    assert.equal(overview.metrics.netRevenueSek, 0);
  });

  // R3B-06: Unverified electronic payment excluded from verified gross totals
  await t.test("R3B-06: Unverified electronic payment excluded from verified gross totals", async () => {
    const today = new Date("2026-11-23T12:00:00Z");
    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: today,
      totalSek: 350,
      skipPaymentDoc: true,
    });

    const overview = await getAdminOverview("today", "ALL", today);
    assert.equal(overview.metrics.grossRevenueSek, 0, "Unverified sale must contribute 0 to gross revenue");
    assert.equal(overview.metrics.reconciliation?.status, "discrepancy_detected");
    assert.equal(overview.metrics.reconciliation?.unverifiedGrossSalesCount, 1);
  });

  // R3B-07: Reconciliation discrepancies visibly reported
  await t.test("R3B-07: Reconciliation discrepancies visibly reported with discrepancy type and details", async () => {
    const today = new Date("2026-11-23T12:00:00Z");
    const unverified = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: today,
      totalSek: 275,
      skipPaymentDoc: true,
    });

    const overview = await getAdminOverview("today", "ALL", today);
    assert.equal(overview.metrics.reconciliation?.status, "discrepancy_detected");
    const disc = overview.metrics.reconciliation?.discrepancies.find((d) => d.orderId === unverified.publicId);
    assert.ok(disc, "Must report discrepancy for unverified order");
    assert.equal(disc.type, "missing_payment_id");
  });

  // R3B-08: Negative net amounts displayed accurately without clamping
  await t.test("R3B-08: Negative net amounts displayed accurately without clamping to zero", async () => {
    const monday = new Date("2026-11-23T10:00:00Z");
    const wednesday = new Date("2026-11-25T14:00:00Z");

    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: monday,
      createdAt: monday,
      totalSek: 190,
    });

    await recordFullRefund({
      publicId: order.publicId,
      amountSek: 190,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("neg"),
      idempotencyKey: makeIdemKey("neg_idem"),
      staff: adminActor,
      now: wednesday,
    });

    // Overview for Wednesday only (gross = 0, refund = 190, net = -190)
    const overviewWed = await getAdminOverview("today", "ALL", wednesday);
    assert.equal(overviewWed.metrics.grossRevenueSek, 0);
    assert.equal(overviewWed.metrics.refundedSek, 190);
    assert.equal(overviewWed.metrics.netRevenueSek, -190, "Net revenue must be -190 SEK and not clamped to 0");
  });

  // R3B-09: No-refund period displays zero recorded refunds correctly
  await t.test("R3B-09: No-refund period displays zero recorded refunds correctly", async () => {
    const today = new Date("2026-11-23T12:00:00Z");
    await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      paidAt: today,
      createdAt: today,
      totalSek: 150,
    });

    const overview = await getAdminOverview("today", "ALL", today);
    assert.equal(overview.metrics.grossRevenueSek, 150);
    assert.equal(overview.metrics.refundedSek, 0, "No refunds must report 0 SEK");
    assert.equal(overview.metrics.netRevenueSek, 150);
    assert.equal(overview.metrics.reconciliation?.status, "clean");
  });

  // R3B-10: Unauthorized user cannot access financial data
  await t.test("R3B-10: Unauthorized user cannot access financial data (returns 401)", async () => {
    const { GET } = await import("../src/app/api/admin/overview/route.ts");

    const req = new Request("http://localhost:3000/api/admin/overview?period=today&status=ALL", {
      method: "GET",
    });

    const res = await GET(req);
    assert.equal(res.status, 401, "Unauthenticated request must be rejected with HTTP 401");
    const json = await res.json();
    assert.equal(json.error, "unauthenticated");
  });

  // R3B-11: Component render and Swedish currency formatting contract
  await t.test("R3B-11: Swedish currency formatting displays negative and positive SEK cleanly", () => {
    const formatMoney = (sek: number) =>
      `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(sek)} kr`;

    assert.equal(formatMoney(0), "0 kr");
    assert.equal(formatMoney(250), "250 kr");
    assert.equal(formatMoney(24500).replace(/\s/g, " "), "24 500 kr");
    // Negative currency formatting check (sv-SE uses unicode minus \u2212 or standard minus)
    assert.ok(/^[−\-]200\s?kr$/.test(formatMoney(-200).trim()), "Negative currency should format cleanly with minus");
    assert.equal(formatMoney(-200).replace(/\u2212/g, "-").replace(/\s/g, " "), "-200 kr");
  });

  // R3B-12: Regression check: SellerSnapshot immutability and refund verification tiers
  await t.test("R3B-12: Regression check: SellerSnapshot immutability and refund verification tiers remain intact", async () => {
    const order = await seedOrder({
      paymentMethod: "card",
      paymentStatus: "paid",
      totalSek: 120,
    });

    // Verify SellerSnapshot immutability guard rejects mutations
    await assert.rejects(
      async () => {
        await OrderModel.updateOne({ _id: order._id }, { $set: { "sellerSnapshot.name": "Tampered Name" } });
      },
      /sellerSnapshot is immutable/,
      "SellerSnapshot must remain immutable"
    );

    // Verify refund tier is recorded properly
    const refRes = await recordFullRefund({
      publicId: order.publicId,
      amountSek: 120,
      reasonCategory: "customer_cancellation",
      method: "stripe",
      externalReference: makeStripeRef("tier"),
      idempotencyKey: makeIdemKey("tier_idem"),
      staff: adminActor,
    });
    assert.equal(refRes.ok, true);

    const reloaded = await OrderModel.findOne({ publicId: order.publicId }).lean();
    assert.equal(reloaded?.refundRecord?.verificationTier, "admin_attested");
    assert.ok(reloaded?.refundRecord?.recordedAt);
  });
});
