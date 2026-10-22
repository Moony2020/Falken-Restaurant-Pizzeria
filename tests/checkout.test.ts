import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintOf, orderFailureSv, resolveAttempt, submitOrder, type OrderBody, type OrderResult } from "../src/lib/checkout.ts";
import { getPickupSlotInstants } from "../src/lib/hours.ts";

const body = (key: string): OrderBody => ({
  idempotencyKey: key,
  items: [{ productSlug: "vesuvio", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [], note: "" }],
  contact: { name: "Anna", phone: "070-123 45 67" },
  pickupAt: "2026-10-22T11:00:00.000Z",
  expectedTotalSek: 110,
});

const order = { publicId: "ABCDEFGHJK", status: "PENDING_PAYMENT", paymentStatus: "pending", totalSek: 110, pickupAt: "2026-10-22T11:00:00.000Z", items: [] };
const reply = (status: number, data: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers });

const fake = (handler: (init: RequestInit) => Response | Promise<Response>) => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return handler(init);
  }) as unknown as typeof fetch;
  return { impl, calls };
};

describe("idempotency keys", () => {
  const newKey = (() => {
    let n = 0;
    return () => `key-${++n}`;
  })();

  test("the same cart, contact and time keep one key across retries and reloads", () => {
    const fp = fingerprintOf({ a: 1 });
    const first = resolveAttempt(null, fp, newKey);
    assert.deepEqual(resolveAttempt(first, fp, newKey), first);
  });

  test("any change starts a fresh attempt with a new key", () => {
    const first = resolveAttempt(null, fingerprintOf({ a: 1 }), newKey);
    const second = resolveAttempt(first, fingerprintOf({ a: 2 }), newKey);
    assert.notEqual(second.key, first.key);
  });
});

describe("creating an order", () => {
  test("201 is a created order and it stays unpaid exactly as the server says", async () => {
    const { impl, calls } = fake(() => reply(201, { order }));
    const r = await submitOrder(body("k-created-0000000001"), impl);
    assert.ok(r.kind === "created");
    assert.equal(r.order.status, "PENDING_PAYMENT");
    assert.equal(r.order.paymentStatus, "pending");
    assert.equal(calls[0].url, "/api/orders");
  });

  test("200 is a replay of an existing order, not a second one", async () => {
    const { impl } = fake(() => reply(200, { order }));
    const r = await submitOrder(body("k-replay-00000000001"), impl);
    assert.equal(r.kind, "replayed");
  });

  test("the request carries the idempotency key and the approved total, and no prices", async () => {
    const { impl, calls } = fake(() => reply(201, { order }));
    await submitOrder(body("k-shape-000000000001"), impl);
    const sent = calls[0].body;
    assert.equal(sent.idempotencyKey, "k-shape-000000000001");
    assert.equal(sent.expectedTotalSek, 110);
    assert.ok(!/priceSek|lineTotal|subtotal|status|paymentStatus/i.test(JSON.stringify(sent.items)));
  });

  test("a double click sends one request and both callers get the same result", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { impl, calls } = fake(async () => {
      await gate;
      return reply(201, { order });
    });
    const a = submitOrder(body("k-double-0000000001"), impl);
    const b = submitOrder(body("k-double-0000000001"), impl);
    release();
    const [ra, rb] = await Promise.all([a, b]);
    assert.equal(calls.length, 1);
    assert.deepEqual(ra, rb);
  });

  test("after it settles, the same key can be retried (for example after a network failure)", async () => {
    let n = 0;
    const { impl, calls } = fake(() => {
      if (++n === 1) throw new TypeError("Failed to fetch");
      return reply(200, { order });
    });
    const first = await submitOrder(body("k-retry-00000000001"), impl);
    assert.equal(first.kind, "network");
    const second = await submitOrder(body("k-retry-00000000001"), impl);
    assert.equal(second.kind, "replayed");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.idempotencyKey, calls[1].body.idempotencyKey);
  });
});

describe("failures", () => {
  const run = async (status: number, data: unknown, headers: Record<string, string> = {}): Promise<OrderResult> =>
    submitOrder(body(`k-fail-${status}-${Math.random().toString(36).slice(2, 12)}`), fake(() => reply(status, data, headers)).impl);

  test("a changed total is reported with both amounts", async () => {
    const r = await run(409, { error: "price_changed", details: { expectedSek: 110, actualSek: 115 } });
    assert.deepEqual(r, { kind: "price_changed", expectedSek: 110, actualSek: 115 });
  });

  test("a reused key for another order is a conflict", async () => {
    assert.equal((await run(409, { error: "idempotency_conflict" })).kind, "conflict");
  });

  test("unavailable items come back as issues", async () => {
    const r = await run(422, { error: "pricing", details: [{ index: 0, code: "price_unconfirmed", message: "x" }] });
    assert.ok(r.kind === "issues" && r.issues[0].code === "price_unconfirmed");
  });

  test("an unavailable pickup time, rate limiting and bad input are told apart", async () => {
    assert.equal((await run(422, { error: "pickup_unavailable" })).kind, "pickup_unavailable");
    assert.deepEqual(await run(429, { error: "rate_limited" }, { "retry-after": "17" }), { kind: "rate_limited", retryAfterSec: 17 });
    assert.equal((await run(400, { error: "invalid_request" })).kind, "invalid");
  });

  test("server trouble is 'unavailable' and never looks like success", async () => {
    for (const status of [500, 503]) assert.equal((await run(status, { error: "service_unavailable" })).kind, "unavailable");
    assert.equal((await run(200, { nothing: true })).kind, "unavailable");
  });

  test("a lost connection is reported as unknown outcome", async () => {
    const r = await submitOrder(body("k-offline-0000000001"), (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    assert.equal(r.kind, "network");
    assert.match(orderFailureSv(r), /du får aldrig två beställningar/);
  });

  test("every failure has a Swedish message and none claims success", () => {
    const failures: OrderResult[] = [
      { kind: "network" },
      { kind: "price_changed", expectedSek: 1, actualSek: 2 },
      { kind: "issues", issues: [] },
      { kind: "pickup_unavailable" },
      { kind: "conflict" },
      { kind: "rate_limited", retryAfterSec: 5 },
      { kind: "invalid" },
      { kind: "unavailable" },
    ];
    for (const f of failures) {
      const text = orderFailureSv(f);
      assert.ok(text.length > 10, f.kind);
      assert.ok(!/tack för|bekräftad!|betald!/i.test(text), `${f.kind}: ${text}`);
    }
  });
});

describe("pickup slots sent to the server", () => {
  const opts = { prepMinutes: 25, lastBeforeClose: 15, step: 15 };

  test("slot instants line up with the Stockholm wall-clock label", () => {
    // Thursday 22 Oct 2026, 12:00 Stockholm = 10:00Z.
    const slots = getPickupSlotInstants(new Date("2026-10-22T10:00:07Z"), "vinter", opts);
    assert.deepEqual(slots[0], { label: "12:30", iso: "2026-10-22T10:30:00.000Z" });
    assert.deepEqual(slots.at(-1), { label: "20:45", iso: "2026-10-22T18:45:00.000Z" });
  });

  test("the instants don't drift as the clock ticks within the same minute", () => {
    const a = getPickupSlotInstants(new Date("2026-10-22T10:00:01Z"), "vinter", opts);
    const b = getPickupSlotInstants(new Date("2026-10-22T10:00:59Z"), "vinter", opts);
    assert.deepEqual(a, b);
  });
});
