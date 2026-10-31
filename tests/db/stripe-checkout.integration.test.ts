import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { GET as statusGet } from "../../src/app/api/orders/[publicId]/status/route.ts";
import { POST as checkoutPost } from "../../src/app/api/orders/[publicId]/checkout/route.ts";
import { POST as webhookPost } from "../../src/app/api/webhooks/stripe/route.ts";
import { listKitchenOrders } from "../../src/server/kitchen.ts";
import { AuditLogModel, WebhookEventModel } from "../../src/server/models/events.ts";
import { generatePublicId, OrderModel, PaymentModel } from "../../src/server/models/order.ts";
import { deriveAccessToken } from "../../src/server/order-access.ts";
import { expirePendingOrders } from "../../src/server/order-expiry.ts";
import { transitionOrder } from "../../src/server/order-transitions.ts";
import { getPaymentsConfig, type PaymentsConfig } from "../../src/server/payments-config.ts";
import { createCheckout, getOrderStatus, handleStripeWebhook, makeStripeExpiryCheck, MAX_SESSIONS_PER_ORDER } from "../../src/server/payments-service.ts";
import { resetRateLimits } from "../../src/server/rate-limit.ts";
import { setStripeGatewayForTests } from "../../src/server/stripe-gateway.ts";
import { eventBody, MOCK_WEBHOOK_SECRET, MockStripe, signPayload } from "../helpers/mock-stripe.ts";

// Stripe Checkout (test mode) against a local database and a local fake of Stripe. Nothing here can reach
// Stripe or Atlas.
const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);

const SECRET = "test-only-order-token-secret-0123456789";
const NOW = new Date("2026-10-22T10:00:00Z");
const min = (m: number) => new Date(NOW.getTime() + m * 60_000);
const fakeKey = "sk_" + "test_" + "notARealKeyJustShapedLikeOne";
const ENABLED: PaymentsConfig = getPaymentsConfig({ PAYMENTS_ENABLED: "true", STRIPE_SECRET_KEY: fakeKey, STRIPE_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET });
const DISABLED: PaymentsConfig = getPaymentsConfig({ STRIPE_SECRET_KEY: fakeKey, STRIPE_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET });

let n = 0;
async function makeOrder(over: Record<string, unknown> = {}) {
  const publicId = generatePublicId();
  const o = await OrderModel.create({
    publicId,
    idempotencyKey: `stripe-key-${String(++n).padStart(10, "0")}`,
    requestHash: "d".repeat(64),
    items: [
      { productSlug: "vesuvio", productNameSnapshot: "Vesuvio", variantId: "normal", variantNameSnapshot: "Normal", basePriceSek: 110, quantity: 1, lineTotalSek: 110 },
      { productSlug: "cola", productNameSnapshot: "Coca-Cola", variantId: "standard", variantNameSnapshot: "Standard", basePriceSek: 20, quantity: 2, lineTotalSek: 40 },
    ],
    subtotalSek: 150,
    totalSek: 150,
    pickupAt: min(60),
    contact: { name: "Anna", phone: "070-123 45 67" },
    paymentExpiresAt: min(45),
    statusHistory: [{ at: NOW, to: "PENDING_PAYMENT", actorType: "customer", reason: "order_created" }],
    ...over,
  });
  return { order: o, publicId, token: deriveAccessToken(publicId, SECRET), id: o._id };
}

const status = async (id: unknown) => (await OrderModel.findById(id).lean())!;
const payments = (orderId: mongoose.Types.ObjectId) => PaymentModel.find({ orderId }).sort({ createdAt: 1 }).lean();

describe("Stripe Checkout (test mode, local fake)", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  let stripe: MockStripe;

  const checkout = (o: { publicId: string; token: string | null }, over: Partial<Parameters<typeof createCheckout>[0]> = {}) =>
    createCheckout({ publicId: o.publicId, token: o.token, origin: "https://falken.test", tokenSecret: SECRET, gateway: stripe, config: ENABLED, now: NOW, ...over });

  const deliver = (eventId: string, type: string, sessionId: string, opts: { signature?: string; body?: string } = {}) => {
    const rawBody = opts.body ?? eventBody(eventId, type, sessionId);
    return handleStripeWebhook({ rawBody, signature: opts.signature ?? signPayload(rawBody), gateway: stripe, now: NOW });
  };

  before(async () => {
    assert.ok(safe, "MONGODB_URI_TEST must be a local mongodb:// URI whose database name ends in _test");
    await mongoose.connect(uri as string, { dbName: "falken_stripe_test", serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([OrderModel, PaymentModel, WebhookEventModel, AuditLogModel].map((m) => m.init()));
  });
  after(async () => {
    setStripeGatewayForTests(null);
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  beforeEach(() => {
    stripe = new MockStripe();
    resetRateLimits();
  });

  describe("creating the payment page", () => {
    test("returns a Stripe page address for the saved order total, as one session and one pending Payment", async () => {
      const o = await makeOrder();
      const r = await checkout(o);
      assert.ok(r.kind === "ok" && r.url.startsWith("https://checkout.stripe.test/") && !r.reused);
      const session = [...stripe.sessions.values()][0];
      assert.equal(session.totalOre, 15000, "150 kr is exactly 15000 öre");
      assert.deepEqual(session.input.lines.map((l) => l.unitAmountOre), [11000, 4000]);
      assert.equal(session.input.expiresAt, Math.floor(NOW.getTime() / 1000) + 30 * 60, "30 minute session");
      assert.equal(session.input.successUrl, `https://falken.test/bestallning/${o.publicId}`);
      assert.equal(session.input.cancelUrl, `https://falken.test/bestallning/${o.publicId}?avbruten=1`);
      for (const url of [session.input.successUrl, session.input.cancelUrl]) assert.ok(!url.includes(o.token), "the access token never travels in a URL");
      const ps = await payments(o.id);
      assert.deepEqual([ps.length, ps[0].status, ps[0].amountSek, ps[0].provider], [1, "pending", 150, "stripe"]);
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT", "creating a page never pays the order");
    });

    test("is off when PAYMENTS_ENABLED is not true, and then touches neither Stripe nor the database", async () => {
      const o = await makeOrder();
      assert.deepEqual(await checkout(o, { config: DISABLED }), { kind: "unavailable" });
      assert.deepEqual(await checkout(o, { gateway: null }), { kind: "unavailable" });
      assert.equal(stripe.createCalls, 0);
      assert.equal((await payments(o.id)).length, 0);
    });

    test("the public order number is not enough: a missing, wrong or other order's token is refused", async () => {
      const a = await makeOrder();
      const b = await makeOrder();
      for (const token of [null, "", "nope", b.token, a.publicId]) assert.deepEqual(await checkout({ publicId: a.publicId, token }), { kind: "not_found" });
      assert.deepEqual(await checkout({ publicId: "UNKNOWNID1", token: deriveAccessToken("UNKNOWNID1", SECRET) }), { kind: "not_found" });
      assert.equal(stripe.createCalls, 0);
    });

    test("pressing pay twice, or reloading, reuses the open page: one session, one Payment", async () => {
      const o = await makeOrder();
      const first = await checkout(o);
      const second = await checkout(o);
      assert.ok(first.kind === "ok" && second.kind === "ok");
      assert.equal(second.sessionId, first.sessionId);
      assert.ok(second.reused);
      assert.equal(stripe.createCalls, 1);
      assert.equal((await payments(o.id)).length, 1);
    });

    test("eight simultaneous requests still produce a single session and a single Payment", async () => {
      const o = await makeOrder();
      const rs = await Promise.all(Array.from({ length: 8 }, () => checkout(o)));
      assert.ok(rs.every((r) => r.kind === "ok"));
      assert.equal(new Set(rs.map((r) => (r.kind === "ok" ? r.sessionId : ""))).size, 1);
      assert.equal(stripe.sessions.size, 1);
      assert.equal((await payments(o.id)).length, 1);
    });

    test("after the page expires a new one is made (a new attempt), and the old Payment is marked expired", async () => {
      const o = await makeOrder();
      const first = await checkout(o);
      assert.ok(first.kind === "ok");
      stripe.expire(first.sessionId);
      const second = await checkout(o, { now: min(31) });
      assert.ok(second.kind === "ok" && second.sessionId !== first.sessionId);
      const ps = await payments(o.id);
      assert.deepEqual(ps.map((p) => p.status), ["expired", "pending"]);
      assert.equal(stripe.sessions.size, 2);
    });

    test("an order can't make endless payment pages", async () => {
      const o = await makeOrder();
      for (let i = 0; i < MAX_SESSIONS_PER_ORDER; i++) {
        const r = await checkout(o, { now: min(i) });
        assert.ok(r.kind === "ok");
        stripe.expire(r.sessionId);
      }
      assert.deepEqual(await checkout(o, { now: min(10) }), { kind: "too_many_attempts" });
    });

    test("only an unpaid, unexpired order can be paid", async () => {
      const cancelled = await makeOrder();
      await transitionOrder({ orderId: cancelled.id, to: "CANCELLED", actor: { type: "system" }, now: NOW });
      assert.deepEqual(await checkout(cancelled), { kind: "not_payable", status: "CANCELLED" });
      const late = await makeOrder();
      assert.deepEqual(await checkout(late, { now: min(46) }), { kind: "expired" });
      const paid = await makeOrder();
      const page = await checkout(paid);
      assert.ok(page.kind === "ok");
      stripe.pay(page.sessionId);
      assert.deepEqual(await checkout(paid), { kind: "paid" });
      assert.deepEqual(await checkout(paid), { kind: "not_payable", status: "CONFIRMED" });
    });

    test("when Stripe can't be reached nothing is stored and the error is thrown for the route to answer 502", async () => {
      const o = await makeOrder();
      stripe.failNetwork = true;
      await assert.rejects(checkout(o));
      assert.equal((await payments(o.id)).length, 0);
      stripe.failNetwork = false;
      assert.ok((await checkout(o)).kind === "ok", "and it works again afterwards");
    });

    test("if the customer already paid at Stripe but our webhook never arrived, asking again settles it", async () => {
      const o = await makeOrder();
      const r = await checkout(o);
      assert.ok(r.kind === "ok");
      stripe.pay(r.sessionId);
      assert.deepEqual(await checkout(o), { kind: "paid" });
      assert.equal((await status(o.id)).fulfillmentStatus, "CONFIRMED");
    });
  });

  describe("the webhook", () => {
    async function pendingOrder() {
      const o = await makeOrder();
      const r = await checkout(o);
      assert.ok(r.kind === "ok");
      return { ...o, sessionId: r.sessionId };
    }

    test("a request Stripe did not sign is refused and changes nothing", async () => {
      const o = await pendingOrder();
      stripe.pay(o.sessionId);
      const body = eventBody("evt_forged", "checkout.session.completed", o.sessionId);
      for (const signature of [signPayload(body, "whsec_attackerSecret"), "t=1,v1=00", "garbage"]) {
        const r = await handleStripeWebhook({ rawBody: body, signature, gateway: stripe, now: NOW });
        assert.deepEqual([r.status, r.body.error], [400, "invalid_signature"]);
      }
      assert.equal((await handleStripeWebhook({ rawBody: body, signature: null, gateway: stripe, now: NOW })).status, 400);
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
      assert.equal(await WebhookEventModel.countDocuments({ eventId: "evt_forged" }), 0);
    });

    test("the signature covers the exact raw body: re-formatted JSON with the same meaning is refused", async () => {
      const o = await pendingOrder();
      stripe.pay(o.sessionId);
      const body = eventBody("evt_raw", "checkout.session.completed", o.sessionId);
      const signature = signPayload(body);
      const reformatted = JSON.stringify(JSON.parse(body), null, 2);
      assert.equal((await handleStripeWebhook({ rawBody: reformatted, signature, gateway: stripe, now: NOW })).status, 400);
      assert.equal((await handleStripeWebhook({ rawBody: body, signature, gateway: stripe, now: NOW })).status, 200);
    });

    test("a confirmed card payment moves the order to CONFIRMED plus paid once, with history, and only then the kitchen sees it", async () => {
      const o = await pendingOrder();
      assert.ok(!(await listKitchenOrders()).some((k) => k.publicId === o.publicId));
      stripe.pay(o.sessionId);
      const r = await deliver("evt_paid_1", "checkout.session.completed", o.sessionId);
      assert.deepEqual([r.status, r.body.outcome], [200, "paid"]);
      const after = await status(o.id);
      assert.deepEqual([after.fulfillmentStatus, after.paymentStatus, after.paymentProvider], ["CONFIRMED", "paid", "stripe"]);
      assert.equal(after.statusHistory.filter((h) => h.to === "CONFIRMED").length, 1);
      const [p] = await payments(o.id);
      assert.deepEqual([p.status, p.receivedSek], ["paid", 150]);
      assert.ok((await listKitchenOrders()).some((k) => k.publicId === o.publicId));
      assert.equal((await WebhookEventModel.findOne({ eventId: "evt_paid_1" }).lean())?.status, "processed");
    });

    test("the same event delivered again, or six times at once, changes nothing more", async () => {
      const o = await pendingOrder();
      stripe.pay(o.sessionId);
      const results = await Promise.all(Array.from({ length: 6 }, () => deliver("evt_dup", "checkout.session.completed", o.sessionId)));
      assert.ok(results.every((r) => r.status === 200 || r.status === 409), JSON.stringify(results.map((r) => r.status)));
      assert.equal(results.filter((r) => r.body.outcome === "paid").length, 1);
      const again = await deliver("evt_dup", "checkout.session.completed", o.sessionId);
      assert.deepEqual([again.status, again.body.outcome], [200, "duplicate"]);
      assert.equal((await status(o.id)).statusHistory.filter((h) => h.to === "CONFIRMED").length, 1);
    });

    test("'completed' is not 'paid': an asynchronous method waits until Stripe says the money arrived", async () => {
      const o = await pendingOrder();
      stripe.pay(o.sessionId, { asynchronous: true });
      const first = await deliver("evt_async_1", "checkout.session.completed", o.sessionId);
      assert.deepEqual([first.status, first.body.outcome], [200, "awaiting_payment"]);
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
      stripe.settleAsync(o.sessionId);
      const second = await deliver("evt_async_2", "checkout.session.async_payment_succeeded", o.sessionId);
      assert.deepEqual([second.status, second.body.outcome], [200, "paid"]);
      assert.equal((await status(o.id)).fulfillmentStatus, "CONFIRMED");
    });

    test("the event body is never trusted: Stripe is asked, and an event for an unpaid session pays nothing", async () => {
      const o = await pendingOrder(); // the session is still open at Stripe
      const r = await deliver("evt_claims_paid", "checkout.session.completed", o.sessionId);
      assert.equal(r.body.outcome, "awaiting_payment");
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("a payment of the wrong amount, currency or order reference does not pay the order and is flagged", async () => {
      const cases: [string, Parameters<MockStripe["pay"]>[1], string][] = [
        ["amount", { amountOre: 100 }, "amount_mismatch"],
        ["currency", { currency: "eur" }, "amount_mismatch"],
        ["reference", { reference: "SOMEONEELSE" }, "reference_mismatch"],
        ["missing reference", { reference: null }, "reference_mismatch"],
      ];
      for (const [label, opts, outcome] of cases) {
        const o = await pendingOrder();
        stripe.pay(o.sessionId, opts);
        const r = await deliver(`evt_bad_${label}`, "checkout.session.completed", o.sessionId);
        assert.equal(r.body.outcome, outcome, label);
        const after = await status(o.id);
        assert.equal(after.fulfillmentStatus, "PENDING_PAYMENT", label);
        assert.ok(after.needsReview?.reason, label);
      }
    });

    test("a payment that arrives after the order was cancelled is recorded and flagged, never reviving the order", async () => {
      const o = await pendingOrder();
      await transitionOrder({ orderId: o.id, to: "CANCELLED", actor: { type: "system" }, reason: "payment_window_expired", now: min(46) });
      stripe.pay(o.sessionId);
      const r = await deliver("evt_late", "checkout.session.completed", o.sessionId);
      assert.equal(r.body.outcome, "late_payment");
      const after = await status(o.id);
      assert.deepEqual([after.fulfillmentStatus, after.needsReview?.reason], ["CANCELLED", "late_payment"]);
      assert.equal((await payments(o.id))[0].receivedSek, 150, "the money is on record");
      assert.ok(!(await listKitchenOrders()).some((k) => k.publicId === o.publicId));
    });

    test("a failure halfway is not lost: the event is marked failed, and Stripe's retry completes it", async () => {
      const o = await pendingOrder();
      stripe.pay(o.sessionId);
      stripe.failNetwork = true; // asking Stripe fails while we process
      const first = await deliver("evt_retry", "checkout.session.completed", o.sessionId);
      assert.deepEqual([first.status, first.body.error], [500, "processing_failed"]);
      assert.equal((await WebhookEventModel.findOne({ eventId: "evt_retry" }).lean())?.status, "failed");
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
      stripe.failNetwork = false;
      const retry = await deliver("evt_retry", "checkout.session.completed", o.sessionId);
      assert.deepEqual([retry.status, retry.body.outcome], [200, "paid"]);
      assert.equal((await status(o.id)).fulfillmentStatus, "CONFIRMED");
    });

    test("expired and failed sessions close the Payment but never touch a paid one, whatever order the events arrive in", async () => {
      const a = await pendingOrder();
      stripe.expire(a.sessionId);
      assert.equal((await deliver("evt_exp", "checkout.session.expired", a.sessionId)).body.outcome, "session_expired");
      assert.equal((await payments(a.id))[0].status, "expired");
      assert.equal((await status(a.id)).fulfillmentStatus, "PENDING_PAYMENT", "an expired page does not cancel the order by itself");

      const b = await pendingOrder();
      stripe.pay(b.sessionId, { asynchronous: true });
      assert.equal((await deliver("evt_fail", "checkout.session.async_payment_failed", b.sessionId)).body.outcome, "payment_failed");
      assert.equal((await payments(b.id))[0].status, "failed");

      const c = await pendingOrder();
      stripe.pay(c.sessionId);
      await deliver("evt_c_paid", "checkout.session.completed", c.sessionId);
      await deliver("evt_c_exp", "checkout.session.expired", c.sessionId); // out of order / stale
      assert.equal((await payments(c.id))[0].status, "paid");
      assert.equal((await status(c.id)).fulfillmentStatus, "CONFIRMED");
    });

    test("events we don't handle, and events for sessions we never made, are acknowledged without effect", async () => {
      const o = await pendingOrder();
      assert.equal((await deliver("evt_other", "charge.succeeded", o.sessionId)).body.outcome, "ignored");
      stripe.sessions.set("cs_test_stranger", { ...stripe.sessions.get(o.sessionId)!, id: "cs_test_stranger" });
      const r = await deliver("evt_stranger", "checkout.session.completed", "cs_test_stranger");
      assert.deepEqual([r.status, r.body.outcome], [200, "unknown_payment"]);
    });

    test("with payments off the endpoint says so (503) instead of pretending", async () => {
      const r = await handleStripeWebhook({ rawBody: "{}", signature: "x", gateway: null, now: NOW });
      assert.equal(r.status, 503);
    });
  });

  describe("reading an order's state", () => {
    test("needs the token, shows the real server state, and shows nothing internal", async () => {
      const o = await makeOrder();
      assert.deepEqual(await getOrderStatus({ publicId: o.publicId, token: null, tokenSecret: SECRET }), { kind: "not_found" });
      assert.deepEqual(await getOrderStatus({ publicId: o.publicId, token: "x", tokenSecret: SECRET }), { kind: "not_found" });
      const before = await getOrderStatus({ publicId: o.publicId, token: o.token, tokenSecret: SECRET });
      assert.ok(before.kind === "ok" && before.order.status === "PENDING_PAYMENT" && before.order.paidAt === null);

      const r = await checkout(o);
      assert.ok(r.kind === "ok");
      stripe.pay(r.sessionId);
      await handleStripeWebhook({ rawBody: eventBody("evt_s", "checkout.session.completed", r.sessionId), signature: signPayload(eventBody("evt_s", "checkout.session.completed", r.sessionId)), gateway: stripe, now: NOW });
      await OrderModel.updateOne({ _id: o.id }, { $set: { "needsReview.reason": "x" } });
      const after = await getOrderStatus({ publicId: o.publicId, token: o.token, tokenSecret: SECRET });
      assert.ok(after.kind === "ok" && after.order.status === "CONFIRMED" && after.order.paidAt);
      assert.deepEqual(Object.keys(after.order).sort(), ["items", "paidAt", "paymentMethod", "paymentStatus", "pickupAt", "publicId", "status", "totalSek"]);
    });

    test("coming back from Stripe proves nothing: a customer who closes the tab without paying stays unpaid", async () => {
      const o = await makeOrder();
      await checkout(o);
      const s = await getOrderStatus({ publicId: o.publicId, token: o.token, tokenSecret: SECRET });
      assert.ok(s.kind === "ok" && s.order.status === "PENDING_PAYMENT" && s.order.paymentStatus === "pending");
    });
  });

  describe("expiry with open payment pages", () => {
    const run = (extra: { now?: Date } = {}) => expirePendingOrders({ now: min(50), ...extra, check: makeStripeExpiryCheck(stripe, min(50)) });

    test("an order whose payment page is still open is NOT cancelled, even past its deadline", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      const r0 = await checkout(o);
      assert.ok(r0.kind === "ok");
      const r = await run();
      assert.ok(r.skippedUnknown >= 1);
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("once the page has expired at Stripe and nothing was paid, the order is cancelled", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      const r0 = await checkout(o, { now: min(5) });
      assert.ok(r0.kind === "ok");
      stripe.expire(r0.sessionId);
      await run();
      assert.equal((await status(o.id)).fulfillmentStatus, "CANCELLED");
      assert.equal((await payments(o.id))[0].status, "expired");
    });

    test("a payment made but whose webhook was missed is found at Stripe and recorded: the order is paid, not cancelled", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      const r0 = await checkout(o, { now: min(5) });
      assert.ok(r0.kind === "ok");
      stripe.pay(r0.sessionId);
      await run();
      const after = await status(o.id);
      assert.equal(after.fulfillmentStatus, "CONFIRMED");
      assert.equal(after.needsReview?.reason, undefined);
    });

    test("an asynchronous payment that is still settling keeps the order alive", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      const r0 = await checkout(o, { now: min(5) });
      assert.ok(r0.kind === "ok");
      stripe.pay(r0.sessionId, { asynchronous: true });
      await run();
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("if Stripe can't be asked, nothing is cancelled", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      const r0 = await checkout(o, { now: min(5) });
      assert.ok(r0.kind === "ok");
      stripe.failNetwork = true;
      await run();
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
    });

    test("an order that never started paying is cancelled as before", async () => {
      const o = await makeOrder({ paymentExpiresAt: min(40) });
      await run();
      assert.equal((await status(o.id)).fulfillmentStatus, "CANCELLED");
    });
  });

  describe("HTTP routes", () => {
    const saved: Record<string, string | undefined> = {};
    const vars: Record<string, string> = {
      ORDER_TOKEN_SECRET: SECRET,
      PAYMENTS_ENABLED: "true",
      STRIPE_SECRET_KEY: fakeKey,
      STRIPE_WEBHOOK_SECRET: MOCK_WEBHOOK_SECRET,
    };
    let ip = 0;
    const ctx = (publicId: string) => ({ params: Promise.resolve({ publicId }) }) as never;
    const post = (o: { publicId: string; token: string | null }, body: unknown = {}, headers: Record<string, string> = {}) =>
      checkoutPost(
        new Request(`http://shop.test/api/orders/${o.publicId}/checkout`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": `10.8.0.${++ip}`, ...(o.token ? { "x-order-token": o.token } : {}), ...headers },
          body: JSON.stringify(body),
        }),
        ctx(o.publicId),
      );

    before(() => {
      for (const [k, v] of Object.entries(vars)) {
        saved[k] = process.env[k];
        process.env[k] = v;
      }
    });
    after(() => {
      setStripeGatewayForTests(null);
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
    beforeEach(() => setStripeGatewayForTests(stripe));

    // The routes use the real clock, so these orders must be unexpired right now.
    const liveOrder = () => makeOrder({ paymentExpiresAt: new Date(Date.now() + 45 * 60_000) });

    test("POST …/checkout returns the Stripe address; a price in the request body is ignored", async () => {
      const o = await liveOrder();
      const res = await post(o, { amountSek: 1, totalSek: 1, items: [] });
      assert.equal(res.status, 200);
      assert.match((await res.json()).url, /^https:\/\/checkout\.stripe\.test\//);
      assert.equal([...stripe.sessions.values()][0].totalOre, 15000);
    });

    test("it refuses a missing or wrong token (404), a foreign origin (403), and payments switched off (503)", async () => {
      const o = await makeOrder();
      assert.equal((await post({ publicId: o.publicId, token: null })).status, 404);
      assert.equal((await post({ publicId: o.publicId, token: "wrong" })).status, 404);
      assert.equal((await post(o, {}, { origin: "https://evil.example" })).status, 403);
      process.env.PAYMENTS_ENABLED = "false";
      setStripeGatewayForTests(null);
      assert.equal((await post(o)).status, 503);
      process.env.PAYMENTS_ENABLED = "true";
      assert.equal(stripe.createCalls, 0);
    });

    test("a Stripe outage is a clean 502 and stores nothing", async () => {
      const o = await liveOrder();
      stripe.failNetwork = true;
      assert.equal((await post(o)).status, 502);
      assert.equal((await payments(o.id)).length, 0);
    });

    test("an order that can no longer be paid answers 409", async () => {
      const o = await makeOrder();
      await transitionOrder({ orderId: o.id, to: "CANCELLED", actor: { type: "system" }, now: NOW });
      const res = await post(o);
      assert.deepEqual([res.status, (await res.json()).error], [409, "not_payable"]);
    });

    test("GET …/status needs the token and returns the order's real state", async () => {
      const o = await makeOrder();
      const get = (token: string | null) =>
        statusGet(new Request(`http://shop.test/api/orders/${o.publicId}/status`, { headers: { "x-forwarded-for": "10.7.0.1", ...(token ? { "x-order-token": token } : {}) } }), ctx(o.publicId));
      assert.equal((await get(null)).status, 404);
      const ok = await get(o.token);
      assert.deepEqual([ok.status, (await ok.json()).order.status], [200, "PENDING_PAYMENT"]);
    });

    test("POST /api/webhooks/stripe: forged signature 400, valid signature 200 and the order is confirmed plus paid", async () => {
      const o = await makeOrder();
      const r = await createCheckout({ publicId: o.publicId, token: o.token, origin: "https://falken.test", tokenSecret: SECRET, gateway: stripe, config: ENABLED, now: NOW });
      assert.ok(r.kind === "ok");
      stripe.pay(r.sessionId);
      const body = eventBody("evt_route_1", "checkout.session.completed", r.sessionId);
      const send = (signature: string | null, raw = body) =>
        webhookPost(new Request("http://shop.test/api/webhooks/stripe", { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, body: raw }));
      assert.equal((await send(signPayload(body, "whsec_wrongSecretWrongSecret"))).status, 400);
      assert.equal((await send(null)).status, 400);
      assert.equal((await status(o.id)).fulfillmentStatus, "PENDING_PAYMENT");
      const good = await send(signPayload(body));
      assert.deepEqual([good.status, (await good.json()).outcome], [200, "paid"]);
      assert.equal((await status(o.id)).fulfillmentStatus, "CONFIRMED");
    });
  });
});
