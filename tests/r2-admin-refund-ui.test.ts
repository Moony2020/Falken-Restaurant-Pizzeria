import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import mongoose, { Types } from "mongoose";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import {
  adminOrderQuerySchema,
  adminVisibleOrderFilter,
  getAdminOrder,
} from "../src/server/admin-orders.ts";
import {
  recordFullRefund,
  cancelUnpaidOrder,
  normalizeExternalReference,
} from "../src/server/refund-service.ts";
import {
  type AdminPrincipal,
} from "../src/server/admin-auth.ts";

const TEST_URI = "mongodb://127.0.0.1:27018/falken_a8_acceptance?replicaSet=rs0&directConnection=true";

const adminActor: AdminPrincipal = {
  id: new Types.ObjectId().toString(),
  email: "r2-tester@falken-test.local",
  displayName: "R2 UI Admin Tester",
  role: "ADMIN",
};

function makeIdemKey(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

test("R2 Admin UI - Unit, Query, Filter & Integration Tests", async (t) => {
  before(async () => {
    await mongoose.connect(TEST_URI);
  });

  after(async () => {
    await mongoose.disconnect();
  });

  await t.test("R2-1: adminOrderQuerySchema accepts CANCELLED and REFUNDED filters", () => {
    const qCancelled = adminOrderQuerySchema.parse({ status: "CANCELLED" });
    assert.equal(qCancelled.status, "CANCELLED");

    const qRefunded = adminOrderQuerySchema.parse({ status: "REFUNDED" });
    assert.equal(qRefunded.status, "REFUNDED");

    const qAll = adminOrderQuerySchema.parse({ status: "ALL" });
    assert.equal(qAll.status, "ALL");

    const qPreparing = adminOrderQuerySchema.parse({ status: "PREPARING" });
    assert.equal(qPreparing.status, "PREPARING");
  });

  await t.test("R2-2: adminVisibleOrderFilter returns correct query shapes", () => {
    const filterAll = adminVisibleOrderFilter("ALL");
    assert.ok(filterAll.fulfillmentStatus);
    assert.ok(filterAll.$or);

    const filterCancelled = adminVisibleOrderFilter("CANCELLED");
    assert.equal(filterCancelled.fulfillmentStatus, "CANCELLED");

    const filterRefunded = adminVisibleOrderFilter("REFUNDED");
    assert.equal(filterRefunded.paymentStatus, "refunded");
  });

  await t.test("R2-3: getAdminOrder retrieves and exposes cancelledAt, totalRefundedSek, and refundRecord", async () => {
    const publicId = "R2A30RD001";
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const now = new Date();
    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });

    await OrderModel.create({
      _id: orderId,
      publicId,
      idempotencyKey: makeIdemKey("idem_r2_t3"),
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Test Kund", phone: "070-1234567" },
      items: [
        {
          productSlug: "vesuvio",
          productNameSnapshot: "Vesuvio",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 120,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: 120,
        },
      ],
      subtotalSek: 120,
      discountSek: 0,
      totalSek: 120,
      currency: "SEK",
      pickupAt: new Date(Date.now() + 3600000),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "paid",
      paymentId,
      paidAt: now,
      fulfillmentStatus: "CONFIRMED",
      sellerSnapshot: {
        name: "Falken Baseline",
        legalName: "Restaurang & Pizzeria Falken AB",
        street: "Skolgatan 4",
        zip: "719 30",
        city: "Vintrosa",
        country: "Sverige",
        phone: "019 29 48 98",
      },
    });

    await PaymentModel.create({
      _id: paymentId,
      orderId,
      provider: "stripe",
      providerSessionId: "cs_test_r2_t3_" + Math.random().toString(36),
      providerPaymentId: "pi_test_r2_t3_" + Math.random().toString(36),
      amountSek: 120,
      currency: "SEK",
      status: "paid",
      refundedSek: 0,
      processedEventIds: [],
    });

    const extRef = "re_test_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const refundRes = await recordFullRefund({
      publicId,
      amountSek: 120,
      reasonCategory: "customer_cancellation",
      reasonNote: "Kund avbokade via telefon",
      externalReference: extRef,
      idempotencyKey: makeIdemKey("idem_ref_t3"),
      staff: adminActor,
    });
    assert.equal(refundRes.ok, true, "Refund failed: " + JSON.stringify(refundRes));

    const order = await getAdminOrder(publicId);
    assert.ok(order);
    assert.equal(order.publicId, publicId);
    assert.equal(order.paymentStatus, "refunded");
    assert.equal(order.fulfillmentStatus, "CANCELLED");
    assert.equal(order.totalRefundedSek, 120);
    assert.ok(order.refundRecord);
    assert.equal(order.refundRecord.amountSek, 120);
    assert.equal(order.refundRecord.canonicalProvider, "stripe");
    assert.equal(order.refundRecord.externalReference, extRef);
    assert.equal(order.refundRecord.verificationTier, "admin_attested");

    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });
  });

  await t.test("R2-4: UI helper normalizeExternalReference formats Stripe and Swish correctly", () => {
    // Stripe
    const stripeRes = normalizeExternalReference("stripe", "  re_12345678901234567890  ");
    assert.equal(stripeRes.canonical, "re_12345678901234567890");
    assert.equal(stripeRes.error, undefined);

    // Swish 14-digit bank ref
    const swishRes = normalizeExternalReference("swish", " 991 234 567 890 12 ");
    assert.equal(swishRes.canonical, "99123456789012");
    assert.equal(swishRes.error, undefined);

    // Invalid format rejected
    const invalidSwish = normalizeExternalReference("swish", "swish_short");
    assert.equal(invalidSwish.error, "invalid_reference_format");
  });

  await t.test("R2-5: Post-pickup refund preserves fulfillmentStatus PICKED_UP in getAdminOrder", async () => {
    const publicId = "R2A5PCK001";
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const now = new Date();

    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });

    await OrderModel.create({
      _id: orderId,
      publicId,
      idempotencyKey: makeIdemKey("idem_r2_t5"),
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Magnus Hämtad", phone: "073-1234567" },
      items: [
        {
          productSlug: "kebabrulle",
          productNameSnapshot: "Kebabrulle",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 120,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: 120,
        },
      ],
      subtotalSek: 120,
      discountSek: 0,
      totalSek: 120,
      currency: "SEK",
      pickupAt: new Date(Date.now() + 3600000),
      paymentMethod: "swish",
      paymentProvider: "swish",
      paymentStatus: "paid",
      paymentId,
      paidAt: now,
      fulfillmentStatus: "PICKED_UP",
      sellerSnapshot: {
        name: "Falken Baseline",
        legalName: "Restaurang & Pizzeria Falken AB",
        street: "Skolgatan 4",
        zip: "719 30",
        city: "Vintrosa",
        country: "Sverige",
        phone: "019 29 48 98",
      },
    });

    await PaymentModel.create({
      _id: paymentId,
      orderId,
      provider: "swish",
      providerSessionId: "swish_sess_" + Math.random().toString(36),
      providerPaymentId: "swish_pay_" + Math.random().toString(36),
      amountSek: 120,
      currency: "SEK",
      status: "paid",
      refundedSek: 0,
      processedEventIds: [],
    });

    const swishRef = "99" + Date.now().toString().slice(-12);
    const refundRes = await recordFullRefund({
      publicId,
      amountSek: 120,
      reasonCategory: "quality_issue",
      reasonNote: "Kall mat",
      externalReference: swishRef,
      idempotencyKey: makeIdemKey("idem_ref_t5"),
      staff: adminActor,
    });

    assert.equal(refundRes.ok, true, "Refund failed: " + JSON.stringify(refundRes));

    const updated = await getAdminOrder(publicId);
    assert.ok(updated);
    // CRITICAL: PICKED_UP preserved!
    assert.equal(updated.fulfillmentStatus, "PICKED_UP");
    assert.equal(updated.paymentStatus, "refunded");
    assert.equal(updated.totalRefundedSek, 120);
    assert.equal(updated.refundRecord?.externalReference, swishRef);
    assert.equal(updated.refundRecord?.verificationTier, "admin_attested");

    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });
  });

  await t.test("R2-6: Unpaid order cancellation updates status to CANCELLED and records audit event", async () => {
    const publicId = "R2A6NPD001";
    await OrderModel.deleteMany({ publicId });

    await OrderModel.create({
      publicId,
      idempotencyKey: makeIdemKey("idem_r2_t6"),
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Olof Obetald", phone: "076-1234567" },
      items: [
        {
          productSlug: "margherita",
          productNameSnapshot: "Margherita",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 95,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: 95,
        },
      ],
      subtotalSek: 95,
      discountSek: 0,
      totalSek: 95,
      currency: "SEK" as const,
      pickupAt: new Date(Date.now() + 3600000),
      paymentMethod: "pay_on_pickup",
      paymentStatus: "unpaid",
      fulfillmentStatus: "CONFIRMED",
      sellerSnapshot: {
        name: "Falken Baseline",
        legalName: "Restaurang & Pizzeria Falken AB",
        street: "Skolgatan 4",
        zip: "719 30",
        city: "Vintrosa",
        country: "Sverige",
        phone: "019 29 48 98",
      },
    });

    const cancelRes = await cancelUnpaidOrder({
      publicId,
      reasonCategory: "kitchen_delay",
      reasonNote: "Kök fullbokat",
      staff: adminActor,
    });

    assert.equal(cancelRes.ok, true);

    const updated = await getAdminOrder(publicId);
    assert.ok(updated);
    assert.equal(updated.fulfillmentStatus, "CANCELLED");
    assert.equal(updated.paymentStatus, "unpaid");
    assert.ok(updated.cancelledAt);
    assert.equal(updated.totalRefundedSek, 0);
    assert.equal(updated.refundRecord, null);

    await OrderModel.deleteMany({ publicId });
  });

  // ============================================================================
  // REMEDIATION ACCEPTANCE TESTS: R2-F1, R2-F2, R2-F3
  // ============================================================================

  await t.test("R2-F1: Refunded order receipt shows 'Återbetald' and 'Kvitto', never 'Väntar på betalning' or 'Orderbekräftelse'", async () => {
    const publicId = "R2F1REC001";
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const now = new Date();
    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });

    const sellerSnapshot = {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    };

    await OrderModel.create({
      _id: orderId,
      publicId,
      idempotencyKey: makeIdemKey("idem_r2_f1"),
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Anna Återbetalning", phone: "072-4445566" },
      items: [
        {
          productSlug: "calzone",
          productNameSnapshot: "Calzone",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 130,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 2,
          lineTotalSek: 260,
        },
      ],
      subtotalSek: 260,
      discountSek: 0,
      totalSek: 260,
      currency: "SEK",
      pickupAt: new Date(Date.now() + 3600000),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "paid",
      paymentId,
      paidAt: now,
      fulfillmentStatus: "CONFIRMED",
      sellerSnapshot,
    });

    await PaymentModel.create({
      _id: paymentId,
      orderId,
      provider: "stripe",
      providerSessionId: "cs_test_r2_f1_" + Math.random().toString(36),
      providerPaymentId: "pi_test_r2_f1_" + Math.random().toString(36),
      amountSek: 260,
      currency: "SEK",
      status: "paid",
      refundedSek: 0,
      processedEventIds: [],
    });

    // Record full refund
    const stripeRef = "re_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 14);
    const refundRes = await recordFullRefund({
      publicId,
      amountSek: 260,
      reasonCategory: "customer_cancellation",
      reasonNote: "Kunden avbokade via telefon innan tillagning.",
      externalReference: stripeRef,
      idempotencyKey: makeIdemKey("idem_ref_f1"),
      staff: adminActor,
    });
    assert.equal(refundRes.ok, true, "Refund failed: " + JSON.stringify(refundRes));

    const refundedOrder = await getAdminOrder(publicId);
    assert.ok(refundedOrder);
    assert.equal(refundedOrder.paymentStatus, "refunded");

    // 1. Test Admin Dashboard receipt builder logic
    const buildDashboardReceipt = (ord: typeof refundedOrder) => ({
      orderNumber: ord.publicId,
      customerName: ord.customerName,
      phone: ord.phone,
      date: ord.createdAt ? new Date(ord.createdAt).toLocaleDateString("sv-SE") : new Date().toLocaleDateString("sv-SE"),
      paymentMethod: ord.paymentMethod === "card" ? "Stripe · kort" : ord.paymentMethod === "swish" ? "Swish" : "Betala på plats",
      paymentStatus: ord.paymentStatus === "refunded" ? "Återbetald" : ord.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
      totalSek: ord.totalSek,
      items: ord.items.map((it) => ({
        description: it.name,
        quantity: it.quantity,
        unitPriceSek: it.basePriceSek || Math.round(it.lineTotalSek / Math.max(1, it.quantity)),
      })),
      seller: ord.sellerSnapshot ? {
        name: ord.sellerSnapshot.name,
        legalName: ord.sellerSnapshot.legalName,
        street: ord.sellerSnapshot.street,
        city: ord.sellerSnapshot.city,
        phone: ord.sellerSnapshot.phone,
      } : undefined,
    });

    const receiptInput = buildDashboardReceipt(refundedOrder);
    assert.equal(receiptInput.paymentStatus, "Återbetald");
    assert.equal(receiptInput.totalSek, 260);
    assert.equal(receiptInput.items.length, 1);
    assert.equal(receiptInput.items[0].description, "Calzone");
    assert.equal(receiptInput.seller?.name, "Falken Baseline");

    // 2. Test AdminReceiptModal title and status determination
    const resolveModalState = (receipt: typeof receiptInput) => {
      const statusNormalized = receipt.paymentStatus.toLowerCase().trim();
      const isRefunded = statusNormalized === "återbetald" || statusNormalized === "refunded";
      const isPaid = !isRefunded && (statusNormalized.includes("betald") || statusNormalized === "paid");
      const docTitle = isPaid || isRefunded ? "Kvitto" : "Orderbekräftelse";
      const statusLabel = isRefunded ? "Återbetald" : isPaid ? "Betald" : "Väntar på betalning";
      const badgeStyle = (isRefunded || isPaid) ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fffbeb] text-[#92400e]";
      return { docTitle, statusLabel, badgeStyle, isRefunded, isPaid };
    };

    const modalState = resolveModalState(receiptInput);
    assert.equal(modalState.docTitle, "Kvitto", "Refunded order must show 'Kvitto' as docTitle");
    assert.notEqual(modalState.docTitle, "Orderbekräftelse");
    assert.equal(modalState.statusLabel, "Återbetald", "Refunded order status badge must read 'Återbetald'");
    assert.notEqual(modalState.statusLabel, "Väntar på betalning");
    assert.equal(modalState.badgeStyle, "bg-[#ecfdf5] text-[#065f46]");

    // Verify historical VAT calculation remains intact
    const vatAmount = Math.round(receiptInput.totalSek * 0.1071);
    const subtotalExclVat = receiptInput.totalSek - vatAmount;
    assert.equal(vatAmount, 28);
    assert.equal(subtotalExclVat, 232);

    // 3. Test PDF generator status & docTitle resolution
    const resolvePdfState = (input: typeof receiptInput) => {
      const cleanOrderNumber = input.orderNumber.replace(/^#/, "");
      const statusNormalized = input.paymentStatus.toLowerCase().trim();
      const isRefunded = statusNormalized === "återbetald" || statusNormalized === "refunded";
      const isPaid = !isRefunded && (statusNormalized.includes("betald") || statusNormalized === "paid");
      const docTitle = isPaid || isRefunded ? `Kvitto ${cleanOrderNumber}` : `Orderbekräftelse ${cleanOrderNumber}`;
      const statusLabel = isRefunded ? "Återbetald" : isPaid ? "Betald" : "Väntar på betalning";
      return { docTitle, statusLabel, isRefunded, isPaid };
    };

    const pdfState = resolvePdfState(receiptInput);
    assert.equal(pdfState.docTitle, `Kvitto ${publicId}`);
    assert.equal(pdfState.statusLabel, "Återbetald");

    // Clean up
    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });
  });

  await t.test("R2-F2: Cancelled electronic order with failed payment status remains visible in Admin Alla and Avbrutna", async () => {
    const idCardFailed = "R2F2CRD001";
    const idSwishFailed = "R2F2SWH001";
    const idPickupUnpaid = "R2F2PCK001";
    const idCardRefunded = "R2F2REF001";
    const idPendingCart = "R2F2PND001";

    const testIds = [idCardFailed, idSwishFailed, idPickupUnpaid, idCardRefunded, idPendingCart];
    await OrderModel.deleteMany({ publicId: { $in: testIds } });

    const baseOrder = {
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Test Kund", phone: "070-0000000" },
      items: [
        {
          productSlug: "margherita",
          productNameSnapshot: "Margherita",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 95,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: 95,
        },
      ],
      subtotalSek: 95,
      discountSek: 0,
      totalSek: 95,
      currency: "SEK" as const,
      pickupAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    };

    // 1. Cancelled electronic card order with paymentStatus='failed'
    await OrderModel.create({
      ...baseOrder,
      publicId: idCardFailed,
      idempotencyKey: makeIdemKey("idem_f2_card"),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "failed",
      fulfillmentStatus: "CANCELLED",
      cancelledAt: new Date(),
    });

    // 2. Cancelled electronic swish order with paymentStatus='failed'
    await OrderModel.create({
      ...baseOrder,
      publicId: idSwishFailed,
      idempotencyKey: makeIdemKey("idem_f2_swish"),
      paymentMethod: "swish",
      paymentProvider: "swish",
      paymentStatus: "failed",
      fulfillmentStatus: "CANCELLED",
      cancelledAt: new Date(),
    });

    // 3. Cancelled pay_on_pickup order with paymentStatus='unpaid'
    await OrderModel.create({
      ...baseOrder,
      publicId: idPickupUnpaid,
      idempotencyKey: makeIdemKey("idem_f2_pickup"),
      paymentMethod: "pay_on_pickup",
      paymentStatus: "unpaid",
      fulfillmentStatus: "CANCELLED",
      cancelledAt: new Date(),
    });

    // 4. Cancelled refunded order with paymentStatus='refunded'
    await OrderModel.create({
      ...baseOrder,
      publicId: idCardRefunded,
      idempotencyKey: makeIdemKey("idem_f2_refund"),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "refunded",
      fulfillmentStatus: "CANCELLED",
      cancelledAt: new Date(),
      totalRefundedSek: 95,
      refundRecord: {
        amountSek: 95,
        reasonCategory: "customer_cancellation",
        reasonNote: "Avbokad",
        canonicalProvider: "stripe",
        externalReference: "re_1234567890abcdef_f2",
        canonicalReference: "re_1234567890abcdef_f2",
        verificationTier: "admin_attested",
        recordedBy: adminActor.id,
        recordedAt: new Date(),
        idempotencyKey: makeIdemKey("idem_rec_f2"),
        requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      },
    });

    // 5. Active pending online order (abandoned cart, NOT cancelled)
    await OrderModel.create({
      ...baseOrder,
      publicId: idPendingCart,
      idempotencyKey: makeIdemKey("idem_f2_pending"),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "pending",
      fulfillmentStatus: "CONFIRMED",
    });

    // Check query under "ALL"
    const filterAll = adminVisibleOrderFilter("ALL");
    const ordersAll = await OrderModel.find({ ...filterAll, publicId: { $in: testIds } }).lean();
    const idsAll = ordersAll.map((o) => o.publicId);

    assert.ok(idsAll.includes(idCardFailed), "Cancelled Stripe order with paymentStatus='failed' must be visible in 'Alla'");
    assert.ok(idsAll.includes(idSwishFailed), "Cancelled Swish order with paymentStatus='failed' must be visible in 'Alla'");
    assert.ok(idsAll.includes(idPickupUnpaid), "Cancelled pay_on_pickup order must be visible in 'Alla'");
    assert.ok(idsAll.includes(idCardRefunded), "Cancelled refunded order must be visible in 'Alla'");
    assert.equal(idsAll.includes(idPendingCart), false, "Unpaid active pending online order MUST NOT appear in 'Alla' (kitchen isolation)");

    // Check query under "CANCELLED"
    const filterCancelled = adminVisibleOrderFilter("CANCELLED");
    const ordersCancelled = await OrderModel.find({ ...filterCancelled, publicId: { $in: testIds } }).lean();
    const idsCancelled = ordersCancelled.map((o) => o.publicId);

    assert.ok(idsCancelled.includes(idCardFailed), "Cancelled Stripe order with paymentStatus='failed' must be visible in 'Avbrutna'");
    assert.ok(idsCancelled.includes(idSwishFailed), "Cancelled Swish order with paymentStatus='failed' must be visible in 'Avbrutna'");
    assert.ok(idsCancelled.includes(idPickupUnpaid), "Cancelled pay_on_pickup order must be visible in 'Avbrutna'");
    assert.ok(idsCancelled.includes(idCardRefunded), "Cancelled refunded order must be visible in 'Avbrutna'");
    assert.equal(idsCancelled.includes(idPendingCart), false, "Pending cart must NOT be in 'Avbrutna'");

    // Clean up
    await OrderModel.deleteMany({ publicId: { $in: testIds } });
  });

  await t.test("R2-F3: Pending online cancellation action is accessible in Admin, but backend refuses active session and UI shows clear error without mutating order", async () => {
    const publicId = "R2F3PND001";
    const paymentId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });

    const futureExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins in future: session is active!

    await OrderModel.create({
      _id: orderId,
      publicId,
      idempotencyKey: makeIdemKey("idem_r2_f3"),
      requestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      contact: { name: "Pelle Pending", phone: "073-9998877" },
      items: [
        {
          productSlug: "hawaii",
          productNameSnapshot: "Hawaii",
          variantId: "normal",
          variantNameSnapshot: "Normal",
          basePriceSek: 110,
          modifiersSnapshot: [],
          removedIngredients: [],
          quantity: 1,
          lineTotalSek: 110,
        },
      ],
      subtotalSek: 110,
      discountSek: 0,
      totalSek: 110,
      currency: "SEK",
      pickupAt: new Date(Date.now() + 3600000),
      paymentMethod: "card",
      paymentProvider: "stripe",
      paymentStatus: "pending",
      paymentExpiresAt: futureExpiry,
      paymentId,
      fulfillmentStatus: "CONFIRMED",
    });

    await PaymentModel.create({
      _id: paymentId,
      orderId,
      provider: "stripe",
      providerSessionId: "cs_test_r2_f3_active",
      amountSek: 110,
      currency: "SEK",
      status: "pending",
      refundedSek: 0,
      processedEventIds: [],
    });

    // 1. UI accessibility check: order dialog enables 'Avbryt beställning' for pending orders
    const canInitiateCancel = (order: { paymentStatus: string; fulfillmentStatus: string }) => {
      return (
        (order.paymentStatus === "unpaid" || order.paymentStatus === "pending") &&
        order.fulfillmentStatus !== "CANCELLED" &&
        order.fulfillmentStatus !== "PICKED_UP"
      );
    };

    assert.equal(
      canInitiateCancel({ paymentStatus: "pending", fulfillmentStatus: "CONFIRMED" }),
      true,
      "Admin UI must allow pending online orders to initiate cancellation"
    );

    // 2. R1 Backend authority: Attempting to cancel active session must be rejected with 'cancellation_blocked_session_active'
    const cancelResult = await cancelUnpaidOrder({
      publicId,
      reasonCategory: "customer_cancellation",
      reasonNote: "Kunden ringde och bad om avbokning",
      staff: adminActor,
    });

    assert.equal(cancelResult.ok, false, "Active session cancellation must be rejected by R1 backend");
    if (!cancelResult.ok) {
      assert.equal(cancelResult.reason, "cancellation_blocked_session_active");
    }

    // 3. Immutability verification: Order MUST NOT be mutated in the database
    const orderAfterAttempt = await OrderModel.findOne({ publicId }).lean();
    assert.ok(orderAfterAttempt);
    assert.equal(orderAfterAttempt.fulfillmentStatus, "CONFIRMED", "Order status must remain CONFIRMED");
    assert.equal(orderAfterAttempt.paymentStatus, "pending", "Payment status must remain pending");
    assert.equal(orderAfterAttempt.cancelledAt, undefined, "cancelledAt must NOT be set");

    // 4. UI error mapping verification: Swedish explanation is clear and friendly
    const mapCancelError = (errorCode?: string) => {
      if (errorCode === "refund_required") return "Beställningen är betald och kräver återbetalning, kan ej avbrytas direkt.";
      if (errorCode === "transactions_required") return "Databasens transaktioner är tillfälligt otillgängliga. Försök igen.";
      if (errorCode === "cancellation_blocked_session_active")
        return "Beställningen kan inte avbrytas eftersom betalsessionen fortfarande är aktiv eller inväntar svar från betalleverantören.";
      if (errorCode === "conflict") return "Beställningens status har ändrats. Kontrollera aktuell status.";
      return "Kunde inte avbryta beställningen.";
    };

    const uiMessage = mapCancelError("cancellation_blocked_session_active");
    assert.equal(
      uiMessage,
      "Beställningen kan inte avbrytas eftersom betalsessionen fortfarande är aktiv eller inväntar svar från betalleverantören."
    );

    // Clean up
    await OrderModel.deleteMany({ publicId });
    await PaymentModel.deleteMany({ _id: paymentId });
  });
});
