import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { AuditLogModel } from "../../src/server/models/events.ts";
import { OrderModel } from "../../src/server/models/order.ts";
import { collectPayOnPickupPayment } from "../../src/server/pay-on-pickup-collection.ts";

const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);
let n = 0;
const staff = { id: "cashier-1", email: "cashier@example.test", displayName: "Cashier", role: "ADMIN" as const };

async function order(over: Record<string, unknown> = {}) {
  n += 1;
  return OrderModel.create({
    publicId: `A5TEST${String(n).padStart(4, "0")}`.slice(-10), idempotencyKey: `a5-order-key-${n}`,
    requestHash: "a".repeat(64), items: [{ productSlug: "vesuvio", productNameSnapshot: "Vesuvio", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 110, quantity: 1, lineTotalSek: 110 }],
    subtotalSek: 110, totalSek: 110, pickupAt: new Date("2026-10-22T11:00:00Z"), contact: { name: "Test", phone: "0700000000" },
    paymentMethod: "pay_on_pickup", paymentStatus: "unpaid", fulfillmentStatus: "READY_FOR_PICKUP", statusHistory: [{ at: new Date(), to: "READY_FOR_PICKUP", actorType: "staff" }], ...over,
  });
}

describe("A5 on-site collections on an isolated local MongoDB", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => { assert.ok(safe); await mongoose.connect(uri!, { dbName: "falken_a5_test", serverSelectionTimeoutMS: 5000 }); await mongoose.connection.dropDatabase(); await Promise.all([OrderModel.init(), AuditLogModel.init()]); });
  after(async () => { if (safe) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  test("records saved amount, staff and audit atomically for cash", async () => { const o = await order(); const r = await collectPayOnPickupPayment({ publicId: o.publicId, method: "cash", idempotencyKey: "a5-cash-key-0001", staff }); assert.deepEqual(r, { ok: true, changed: true }); const saved = await OrderModel.findById(o._id).lean(); assert.equal(saved?.paymentStatus, "paid"); assert.deepEqual([saved?.onSiteCollection?.method, saved?.onSiteCollection?.amountSek, saved?.onSiteCollection?.collectedBy], ["cash", 110, staff.id]); assert.equal(await AuditLogModel.countDocuments({ action: "pay_on_pickup_collected", entityId: String(o._id) }), 1); });
  test("supports card terminal without creating provider evidence and prevents duplicates", async () => { const o = await order(); const first = await collectPayOnPickupPayment({ publicId: o.publicId, method: "card_terminal", idempotencyKey: "a5-card-key-0001", staff }); const again = await collectPayOnPickupPayment({ publicId: o.publicId, method: "card_terminal", idempotencyKey: "a5-card-key-0001", staff }); const other = await collectPayOnPickupPayment({ publicId: o.publicId, method: "cash", idempotencyKey: "a5-card-key-0002", staff }); assert.equal(first.ok, true); assert.deepEqual(again, { ok: true, changed: false }); assert.deepEqual(other, { ok: false, reason: "already_collected" }); const saved = await OrderModel.findById(o._id).lean(); assert.equal(saved?.paymentProvider, undefined); assert.equal(saved?.paymentId, undefined); });
  test("rejects wrong payment method and concurrent collection creates one record", async () => { const card = await order({ paymentMethod: "card", paymentStatus: "pending" }); assert.deepEqual(await collectPayOnPickupPayment({ publicId: card.publicId, method: "cash", idempotencyKey: "a5-wrong-key-0001", staff }), { ok: false, reason: "wrong_payment_method" }); const o = await order(); const results = await Promise.all(Array.from({ length: 6 }, (_, i) => collectPayOnPickupPayment({ publicId: o.publicId, method: "cash", idempotencyKey: `a5-race-key-${String(i).padStart(4, "0")}`, staff }))); assert.equal(results.filter((r) => r.ok && r.changed).length, 1); });
  test("rolls back the payment if the audit record cannot be written", async () => {
    const o = await order();
    const originalCreate = AuditLogModel.create;
    AuditLogModel.create = (async () => { throw new Error("simulated audit failure"); }) as typeof AuditLogModel.create;
    try {
      await assert.rejects(() => collectPayOnPickupPayment({ publicId: o.publicId, method: "cash", idempotencyKey: "a5-audit-fail-01", staff }), /simulated audit failure/);
    } finally {
      AuditLogModel.create = originalCreate;
    }
    const saved = await OrderModel.findById(o._id).lean();
    assert.equal(saved?.paymentStatus, "unpaid");
    assert.equal(saved?.onSiteCollection, undefined);
  });
});
