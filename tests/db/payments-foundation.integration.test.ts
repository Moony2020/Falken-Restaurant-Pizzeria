import { after, before, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { POST as ordersPost } from "../../src/app/api/orders/route.ts";
import { AuditLogModel, WebhookEventModel } from "../../src/server/models/events.ts";
import { generatePublicId, OrderModel, PaymentModel } from "../../src/server/models/order.ts";
import { CategoryModel, ModifierModel, ProductModel } from "../../src/server/models/catalog.ts";
import { listKitchenOrders } from "../../src/server/kitchen.ts";
import { verifyAccessToken } from "../../src/server/order-access.ts";
import { expirePendingOrders } from "../../src/server/order-expiry.ts";
import { createOrder } from "../../src/server/orders-service.ts";
import { transitionOrder } from "../../src/server/order-transitions.ts";
import { applyVerifiedPayment, markVerified } from "../../src/server/payment-apply.ts";
import { resetRateLimits } from "../../src/server/rate-limit.ts";
import { seedCatalog } from "../../src/server/seed.ts";
import { claimWebhookEvent, completeWebhookEvent, failWebhookEvent } from "../../src/server/webhook-events.ts";

// Same safety rule as the other integration files: a throwaway LOCAL database only, never Atlas.
const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);

const NOW = new Date("2026-10-22T10:00:00Z");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);
let n = 0;

async function makeOrder(over: Record<string, unknown> = {}) {
  const idem = `pay-key-${String(++n).padStart(10, "0")}`;
  return OrderModel.create({
    publicId: generatePublicId(),
    idempotencyKey: idem,
    requestHash: "c".repeat(64),
    items: [{ productSlug: "vesuvio", productNameSnapshot: "Vesuvio", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 110, quantity: 1, lineTotalSek: 110 }],
    subtotalSek: 110,
    totalSek: 110,
    pickupAt: min(60),
    contact: { name: "Anna", phone: "070-123 45 67" },
    paymentExpiresAt: min(45),
    statusHistory: [{ at: NOW, to: "PENDING_PAYMENT", actorType: "customer", reason: "order_created" }],
    ...over,
  });
}
async function makePayment(orderId: unknown, over: Record<string, unknown> = {}) {
  const doc = await PaymentModel.create({ orderId, provider: "stripe", providerSessionId: `cs_test_${++n}`, amountSek: 110, status: "pending", ...over } as never);
  return doc as unknown as { _id: mongoose.Types.ObjectId; providerSessionId: string };
}
const verified = (sessionId: string, over: Record<string, unknown> = {}) =>
  markVerified({ provider: "stripe", providerSessionId: sessionId, providerPaymentId: `pi_${sessionId}`, amountSek: 110, currency: "SEK", ...over } as never);
const status = async (id: unknown) => (await OrderModel.findById(id).lean())!;

describe("payment foundation on a local test database", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => {
    assert.ok(safe, "MONGODB_URI_TEST must be a local mongodb:// URI whose database name ends in _test");
    await mongoose.connect(uri as string, { dbName: "falken_payments_test", serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([OrderModel, PaymentModel, WebhookEventModel, AuditLogModel, CategoryModel, ProductModel, ModifierModel].map((m) => m.init()));
  });
  after(async () => {
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(() => resetRateLimits());

  describe("transitions", () => {
    test("a legal transition changes the status and records who, when and why, in the same update", async () => {
      const o = await makeOrder();
      const r = await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment", id: "stripe" }, reason: "test", now: NOW });
      assert.ok(r.ok && r.changed);
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "PAID");
      assert.equal(after.paymentStatus, "paid");
      assert.deepEqual(after.paidAt, NOW);
      const last = after.statusHistory.at(-1)!;
      assert.deepEqual([last.from, last.to, last.actorType, last.actorId, last.reason], ["PENDING_PAYMENT", "PAID", "payment", "stripe", "test"]);
      assert.equal(after.statusHistory.length, 2);
    });

    test("staff cannot mark an order paid, and the attempt is audited", async () => {
      const o = await makeOrder();
      const r = await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "staff", id: "u1" }, now: NOW });
      assert.deepEqual(r.ok ? null : r.reason, "actor_not_allowed");
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "PENDING_PAYMENT");
      assert.equal(after.paymentStatus, "pending");
      assert.equal(await AuditLogModel.countDocuments({ action: "transition_rejected", entityId: String(o._id) }), 1);
    });

    test("an unpaid order can't skip to the kitchen steps", async () => {
      const o = await makeOrder();
      for (const to of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP", "REFUNDED"] as const) {
        const r = await transitionOrder({ orderId: o._id, to, actor: { type: "staff" }, now: NOW });
        assert.equal(r.ok, false, to);
      }
      assert.equal((await status(o._id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("asking for the status it already has is a harmless no-op", async () => {
      const o = await makeOrder();
      await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW });
      const again = await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW });
      assert.ok(again.ok && !again.changed);
      assert.equal((await status(o._id)).statusHistory.length, 2);
    });

    test("ten simultaneous 'mark paid' requests produce exactly one change and one history entry", async () => {
      const o = await makeOrder();
      const results = await Promise.all(Array.from({ length: 10 }, () => transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW })));
      assert.equal(results.filter((r) => r.ok && r.changed).length, 1);
      assert.ok(results.every((r) => r.ok));
      const after = await status(o._id);
      assert.equal(after.statusHistory.filter((h) => h.to === "PAID").length, 1);
    });

    test("a paid order cannot be cancelled, even by the system", async () => {
      const o = await makeOrder();
      await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW });
      const r = await transitionOrder({ orderId: o._id, to: "CANCELLED", actor: { type: "system" }, now: NOW });
      assert.equal(r.ok, false);
      assert.equal((await status(o._id)).fulfillmentStatus, "PAID");
    });

    test("unknown orders are reported, not thrown", async () => {
      const r = await transitionOrder({ orderId: new mongoose.Types.ObjectId(), to: "PAID", actor: { type: "payment" } });
      assert.deepEqual(r.ok ? null : r.reason, "not_found");
    });
  });

  describe("webhook events survive crashes, repeats and races", () => {
    const ev = (id: string) => ({ provider: "stripe" as const, eventId: id, type: "checkout.session.completed" });

    test("first delivery is claimed; after completion a repeat is a duplicate", async () => {
      const first = await claimWebhookEvent({ ...ev("evt_1"), now: NOW });
      assert.equal(first.kind, "claimed");
      assert.ok(await completeWebhookEvent("stripe", "evt_1", "paid", NOW));
      assert.equal((await claimWebhookEvent({ ...ev("evt_1"), now: min(1) })).kind, "duplicate");
      assert.equal((await WebhookEventModel.findOne({ eventId: "evt_1" }).lean())?.status, "processed");
    });

    test("a failed event is NOT lost: the provider's retry claims it again", async () => {
      await claimWebhookEvent({ ...ev("evt_2"), now: NOW });
      await failWebhookEvent("stripe", "evt_2", new Error("database was briefly unavailable"));
      const doc = await WebhookEventModel.findOne({ eventId: "evt_2" }).lean();
      assert.equal(doc?.status, "failed");
      const retry = await claimWebhookEvent({ ...ev("evt_2"), now: min(1) });
      assert.ok(retry.kind === "claimed" && retry.attempts === 2);
    });

    test("a worker that dies mid-way: while its lease is live others wait, after it expires the event is reclaimed", async () => {
      assert.equal((await claimWebhookEvent({ ...ev("evt_3"), now: NOW, leaseMs: 60_000 })).kind, "claimed");
      assert.equal((await claimWebhookEvent({ ...ev("evt_3"), now: min(0.5) })).kind, "in_progress");
      const later = await claimWebhookEvent({ ...ev("evt_3"), now: min(2) });
      assert.ok(later.kind === "claimed" && later.attempts === 2);
    });

    test("a stale worker can't overwrite the outcome of the worker that took over", async () => {
      await claimWebhookEvent({ ...ev("evt_4"), now: NOW });
      assert.ok(await completeWebhookEvent("stripe", "evt_4", "paid", NOW));
      assert.equal(await completeWebhookEvent("stripe", "evt_4", "something else", NOW), false);
      assert.equal((await WebhookEventModel.findOne({ eventId: "evt_4" }).lean())?.outcome, "paid");
    });

    test("eight simultaneous deliveries of the same event: exactly one worker claims it", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => claimWebhookEvent({ ...ev("evt_5"), now: NOW })));
      assert.equal(results.filter((r) => r.kind === "claimed").length, 1);
      assert.ok(results.every((r) => r.kind === "claimed" || r.kind === "in_progress"));
      assert.equal(await WebhookEventModel.countDocuments({ eventId: "evt_5" }), 1);
    });

    test("the same event id from two providers is two different events", async () => {
      assert.equal((await claimWebhookEvent({ provider: "stripe", eventId: "shared", type: "x", now: NOW })).kind, "claimed");
      assert.equal((await claimWebhookEvent({ provider: "paypal", eventId: "shared", type: "x", now: NOW })).kind, "claimed");
    });

    test("error messages are scrubbed of keys and connection strings before they are stored", async () => {
      await claimWebhookEvent({ ...ev("evt_6"), now: NOW });
      const fakeKey = "sk_" + "test_" + "abcdefghijkl";
      await failWebhookEvent("stripe", "evt_6", new Error(`bad ${fakeKey} and mongodb+srv://user:pw@host/db and whsec_${"x".repeat(12)}`));
      const stored = (await WebhookEventModel.findOne({ eventId: "evt_6" }).lean())?.lastError ?? "";
      assert.ok(!stored.includes(fakeKey) && !stored.includes("user:pw") && !stored.includes("whsec_"), stored);
      assert.match(stored, /<redacted>/);
    });

    test("events arriving out of order are harmless: the state machine decides", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      // "expired" processed first, then the payment confirmation for the same order.
      await transitionOrder({ orderId: o._id, to: "CANCELLED", actor: { type: "system" }, now: NOW });
      const r = await applyVerifiedPayment(verified(p.providerSessionId), min(1));
      assert.equal(r.outcome, "late_payment");
    });
  });

  describe("applying a confirmed payment", () => {
    test("pays a pending order, links the payment and records what was received", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      const r = await applyVerifiedPayment(verified(p.providerSessionId), NOW);
      assert.equal(r.outcome, "paid");
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "PAID");
      assert.equal(String(after.paymentId), String(p._id));
      assert.equal(after.paymentProvider, "stripe");
      const pay = await PaymentModel.findById(p._id).lean();
      assert.deepEqual([pay?.status, pay?.receivedSek], ["paid", 110]);
    });

    test("the same confirmation twice is idempotent", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      assert.equal((await applyVerifiedPayment(verified(p.providerSessionId), NOW)).outcome, "paid");
      assert.equal((await applyVerifiedPayment(verified(p.providerSessionId), min(1))).outcome, "already_paid");
      assert.equal((await status(o._id)).statusHistory.filter((h) => h.to === "PAID").length, 1);
    });

    test("six simultaneous confirmations of one payment: one 'paid', the rest 'already_paid', never a duplicate flag", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      const rs = await Promise.all(Array.from({ length: 6 }, () => applyVerifiedPayment(verified(p.providerSessionId), NOW)));
      assert.equal(rs.filter((r) => r.outcome === "paid").length, 1);
      assert.ok(rs.every((r) => r.outcome === "paid" || r.outcome === "already_paid"), JSON.stringify(rs.map((r) => r.outcome)));
      const after = await status(o._id);
      assert.equal(after.needsReview?.reason, undefined);
      assert.equal(after.statusHistory.filter((h) => h.to === "PAID").length, 1);
    });

    test("a crash after the order was marked paid but before the payment record was updated is repaired on retry", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW, set: { paymentProvider: "stripe", paymentId: p._id } });
      assert.equal((await PaymentModel.findById(p._id).lean())?.status, "pending"); // the half-finished state
      assert.equal((await applyVerifiedPayment(verified(p.providerSessionId), min(1))).outcome, "already_paid");
      assert.equal((await PaymentModel.findById(p._id).lean())?.status, "paid");
    });

    test("a wrong amount never pays the order: it is flagged and the received amount is recorded", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      const r = await applyVerifiedPayment(verified(p.providerSessionId, { amountSek: 1 }), NOW);
      assert.equal(r.outcome, "amount_mismatch");
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "PENDING_PAYMENT");
      assert.equal(after.needsReview?.reason, "amount_mismatch");
      assert.equal((await PaymentModel.findById(p._id).lean())?.receivedSek, 1);
      assert.equal(await AuditLogModel.countDocuments({ action: "payment_amount_mismatch" }) > 0, true);
    });

    test("a wrong currency never pays the order", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      assert.equal((await applyVerifiedPayment(verified(p.providerSessionId, { currency: "EUR" }), NOW)).outcome, "amount_mismatch");
      assert.equal((await status(o._id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("a provider reference that points at a different order is refused", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      const r = await applyVerifiedPayment(verified(p.providerSessionId, { orderReference: "SOMEONEELSE" }), NOW);
      assert.equal(r.outcome, "reference_mismatch");
      assert.equal((await status(o._id)).fulfillmentStatus, "PENDING_PAYMENT");
      const ok = await applyVerifiedPayment(verified(p.providerSessionId, { orderReference: o.publicId }), NOW);
      assert.equal(ok.outcome, "paid");
    });

    test("a payment for a session we never created is ignored and audited", async () => {
      const r = await applyVerifiedPayment(verified("cs_test_nope"), NOW);
      assert.equal(r.outcome, "unknown_payment");
    });

    test("LATE payment: confirmation after the order was cancelled is recorded and flagged, the order is not revived", async () => {
      const o = await makeOrder();
      const p = await makePayment(o._id);
      await transitionOrder({ orderId: o._id, to: "CANCELLED", actor: { type: "system" }, reason: "payment_window_expired", now: min(46) });
      const r = await applyVerifiedPayment(verified(p.providerSessionId), min(50));
      assert.equal(r.outcome, "late_payment");
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "CANCELLED");
      assert.equal(after.needsReview?.reason, "late_payment");
      const pay = await PaymentModel.findById(p._id).lean();
      assert.deepEqual([pay?.status, pay?.receivedSek], ["paid", 110]); // the money is on record
      assert.equal((await listKitchenOrders()).some((k) => k.publicId === o.publicId), false);
    });

    test("a second, different payment for an already paid order is flagged as a duplicate", async () => {
      const o = await makeOrder();
      const p1 = await makePayment(o._id);
      const p2 = await makePayment(o._id, { provider: "paypal" });
      await applyVerifiedPayment(verified(p1.providerSessionId), NOW);
      const r = await applyVerifiedPayment({ ...verified(p2.providerSessionId, { provider: "paypal" }) }, min(1));
      assert.equal(r.outcome, "duplicate_payment");
      const after = await status(o._id);
      assert.equal(String(after.paymentId), String(p1._id)); // the first payment stays the one that paid
      assert.equal(after.needsReview?.reason, "duplicate_payment");
    });

    test("the browser has no way in: nothing but markVerified() builds a VerifiedPayment", async () => {
      // A runtime guard can't see TypeScript brands, so this documents the rule: the only exported constructor is markVerified.
      const mod = await import("../../src/server/payment-apply.ts");
      assert.deepEqual(Object.keys(mod).filter((k) => /verif/i.test(k)).sort(), ["applyVerifiedPayment", "markVerified"]);
    });
  });

  describe("expiry", () => {
    test("an unpaid order past its deadline is cancelled, with history; one not yet due is left alone", async () => {
      const due = await makeOrder({ paymentExpiresAt: min(-1) });
      const notDue = await makeOrder({ paymentExpiresAt: min(30) });
      const r = await expirePendingOrders({ now: NOW });
      assert.ok(r.cancelled >= 1);
      const d = await status(due._id);
      assert.equal(d.fulfillmentStatus, "CANCELLED");
      assert.deepEqual(d.statusHistory.at(-1)?.reason, "payment_window_expired");
      assert.equal((await status(notDue._id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("an order with a payment session that may still be open is NOT cancelled (we can't be sure it's unpaid)", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(-1) });
      await makePayment(o._id, { status: "pending" });
      const r = await expirePendingOrders({ now: NOW });
      assert.ok(r.skippedUnknown >= 1);
      assert.equal((await status(o._id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("an order whose only payments are dead (failed/expired) is cancelled", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(-1) });
      await makePayment(o._id, { status: "failed" });
      await makePayment(o._id, { status: "expired" });
      await expirePendingOrders({ now: NOW });
      assert.equal((await status(o._id)).fulfillmentStatus, "CANCELLED");
    });

    test("a paid payment on a still-pending order is never cancelled: it is flagged for a person", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(-1) });
      await makePayment(o._id, { status: "paid" });
      const r = await expirePendingOrders({ now: NOW });
      assert.ok(r.foundPaid >= 1);
      const after = await status(o._id);
      assert.equal(after.fulfillmentStatus, "PENDING_PAYMENT");
      assert.equal(after.needsReview?.reason, "paid_but_pending");
    });

    test("a custom provider check decides: 'paid' protects the order, 'unpaid' allows cancelling", async () => {
      const a = await makeOrder({ paymentExpiresAt: min(-1) });
      const b = await makeOrder({ paymentExpiresAt: min(-1) });
      await expirePendingOrders({ now: NOW, check: async (o) => (String(o._id) === String(a._id) ? "paid" : "unpaid") });
      assert.equal((await status(a._id)).fulfillmentStatus, "PENDING_PAYMENT");
      assert.equal((await status(b._id)).fulfillmentStatus, "CANCELLED");
    });

    test("paid orders and already cancelled orders are never touched; running twice changes nothing more", async () => {
      const paid = await makeOrder({ paymentExpiresAt: min(-1) });
      await transitionOrder({ orderId: paid._id, to: "PAID", actor: { type: "payment" }, now: NOW });
      await expirePendingOrders({ now: NOW });
      assert.equal((await status(paid._id)).fulfillmentStatus, "PAID");
      const again = await expirePendingOrders({ now: NOW });
      assert.equal(again.cancelled, 0);
    });

    test("older orders that have no deadline field expire by age", async () => {
      const o = await makeOrder({ paymentExpiresAt: undefined });
      await OrderModel.collection.updateOne({ _id: o._id }, { $unset: { paymentExpiresAt: "" }, $set: { createdAt: min(-46) } });
      await expirePendingOrders({ now: NOW });
      assert.equal((await status(o._id)).fulfillmentStatus, "CANCELLED");
    });

    test("the number examined per run is capped", async () => {
      for (let i = 0; i < 3; i++) await makeOrder({ paymentExpiresAt: min(-1) });
      const r = await expirePendingOrders({ now: NOW, limit: 2 });
      assert.equal(r.examined, 2);
    });
  });

  describe("kitchen", () => {
    test("only paid, active orders are listed; unpaid, cancelled, refunded and collected ones never are", async () => {
      const mk = async (to: string | null) => {
        const o = await makeOrder();
        if (to) {
          await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW });
          for (const step of ["ACCEPTED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"]) {
            if (to === "PAID") break;
            await transitionOrder({ orderId: o._id, to: step as never, actor: { type: "staff" }, now: NOW });
            if (step === to) break;
          }
        }
        return o.publicId;
      };
      const pending = await mk(null);
      const paid = await mk("PAID");
      const ready = await mk("READY_FOR_PICKUP");
      const collected = await mk("PICKED_UP");
      const cancelled = (await makeOrder()).publicId;
      await OrderModel.updateOne({ publicId: cancelled }, { $set: { fulfillmentStatus: "CANCELLED" } });
      const ids = (await listKitchenOrders()).map((k) => k.publicId);
      assert.ok(ids.includes(paid) && ids.includes(ready));
      for (const bad of [pending, collected, cancelled]) assert.ok(!ids.includes(bad), `${bad} must not be listed`);
    });

    test("even a corrupted status can't leak an unpaid order: both status and payment status must say paid", async () => {
      const o = await makeOrder();
      await OrderModel.updateOne({ _id: o._id }, { $set: { fulfillmentStatus: "PAID" } }); // wrongly forced, paymentStatus still "pending"
      assert.ok(!(await listKitchenOrders()).some((k) => k.publicId === o.publicId));
    });

    test("kitchen entries expose what the kitchen needs and nothing about money internals", async () => {
      const o = await makeOrder();
      await transitionOrder({ orderId: o._id, to: "PAID", actor: { type: "payment" }, now: NOW });
      const entry = (await listKitchenOrders()).find((k) => k.publicId === o.publicId)!;
      assert.deepEqual(Object.keys(entry).sort(), ["_id", "contact", "fulfillmentStatus", "items", "paidAt", "pickupAt", "publicId", "totalSek"]);
    });
  });

  describe("order creation feeds the payment foundation", () => {
    before(async () => {
      await seedCatalog();
    });
    const PICKUP = "2026-10-22T11:00:00.000Z";
    const body = (key: string) => ({
      idempotencyKey: key,
      items: [{ productSlug: "vesuvio", variantId: "normal", quantity: 1 }],
      contact: { name: "Anna", phone: "070-123 45 67" },
      pickupAt: PICKUP,
      expectedTotalSek: 110,
    });
    const secret = "k".repeat(40);

    test("a new order gets a 45 minute payment deadline, a first history entry and a derivable access token", async () => {
      const r = await createOrder(body("create-key-000000001"), NOW, { tokenSecret: secret });
      const stored = await OrderModel.findOne({ publicId: r.order.publicId }).lean();
      assert.deepEqual(stored?.paymentExpiresAt, min(45));
      assert.deepEqual([stored?.statusHistory[0]?.to, stored?.statusHistory[0]?.actorType], ["PENDING_PAYMENT", "customer"]);
      assert.ok(r.accessToken && verifyAccessToken(r.order.publicId, r.accessToken, secret));
      assert.ok(!JSON.stringify(stored).includes(r.accessToken!), "the token itself is never stored");
    });

    test("a retried request returns the same token", async () => {
      const first = await createOrder(body("create-key-000000002"), NOW, { tokenSecret: secret });
      const again = await createOrder(body("create-key-000000002"), NOW, { tokenSecret: secret });
      assert.equal(again.replayed, true);
      assert.equal(again.accessToken, first.accessToken);
    });

    test("without a secret no token is produced", async () => {
      const r = await createOrder(body("create-key-000000003"), NOW);
      assert.equal(r.accessToken, undefined);
    });

    test("a brand new order is unpaid, invisible to the kitchen, and not expired yet", async () => {
      const r = await createOrder(body("create-key-000000004"), NOW, { tokenSecret: secret });
      assert.equal(r.order.status, "PENDING_PAYMENT");
      assert.ok(!(await listKitchenOrders()).some((k) => k.publicId === r.order.publicId));
      await expirePendingOrders({ now: NOW });
      assert.equal((await OrderModel.findOne({ publicId: r.order.publicId }).lean())?.fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("POST /api/orders returns the access token with the order (needs the secret to be configured)", async () => {
      process.env.ORDER_TOKEN_SECRET = secret;
      mock.timers.enable({ apis: ["Date"], now: NOW });
      try {
        const res = await ordersPost(
          new Request("http://shop.test/api/orders", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
            body: JSON.stringify(body("create-key-000000005")),
          }),
        );
        assert.equal(res.status, 201);
        const json = await res.json();
        assert.ok(verifyAccessToken(json.order.publicId, json.accessToken, secret));
      } finally {
        mock.timers.reset();
        delete process.env.ORDER_TOKEN_SECRET;
      }
    });

    test("POST /api/orders without the secret configured is a clean 503, and no order is stored", async () => {
      const before = await OrderModel.countDocuments();
      const res = await ordersPost(
        new Request("http://shop.test/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.10" },
          body: JSON.stringify(body("create-key-000000006")),
        }),
      );
      assert.equal(res.status, 503);
      assert.equal(await OrderModel.countDocuments(), before);
    });
  });
});
