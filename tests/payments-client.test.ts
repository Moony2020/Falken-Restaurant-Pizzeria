import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fetchOrderStatus, startCardPayment, startPaymentFailureSv, type StartPaymentResult } from "../src/lib/payments-client.ts";

const reply = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe("starting a card payment from the browser", () => {
  test("sends only the order number in the address and the access token in a header, never an amount", async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const f = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await startCardPayment("ABCDEFGHJK", "tok123", f);
    assert.deepEqual(r, { kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    assert.equal(seen!.url, "/api/orders/ABCDEFGHJK/checkout");
    assert.equal((seen!.init?.headers as Record<string, string>)["x-order-token"], "tok123");
    assert.equal(seen!.init?.body, "{}");
  });

  test("only an https address is followed", async () => {
    for (const url of ["http://evil.example", "javascript:alert(1)", "//evil.example", ""]) {
      assert.notEqual((await startCardPayment("A", "t", reply(200, { url }))).kind, "redirect", url);
    }
  });

  test("every answer maps to a clear result", async () => {
    const cases: [number, unknown, StartPaymentResult["kind"]][] = [
      [200, { paid: true }, "paid"],
      [202, { processing: true }, "processing"],
      [503, { error: "payments_unavailable" }, "unavailable"],
      [429, { error: "rate_limited" }, "rate_limited"],
      [409, { error: "order_expired" }, "expired"],
      [409, { error: "not_payable" }, "not_payable"],
      [404, { error: "not_found" }, "not_payable"],
      [502, { error: "payment_provider_error" }, "error"],
      [500, {}, "error"],
    ];
    for (const [status, body, kind] of cases) assert.equal((await startCardPayment("A", "t", reply(status, body))).kind, kind, `${status}`);
  });

  test("a dropped connection is reported as such", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    assert.deepEqual(await startCardPayment("A", "t", f), { kind: "network" });
  });

  test("every failure has a Swedish message, and none says the order is paid", () => {
    const kinds: StartPaymentResult["kind"][] = ["unavailable", "expired", "not_payable", "rate_limited", "network", "processing", "error"];
    for (const kind of kinds) {
      const text = startPaymentFailureSv({ kind } as StartPaymentResult);
      assert.ok(text.length > 10, kind);
      assert.ok(!/bekräftad!|tack/i.test(text), kind);
    }
  });
});

describe("reading an order's status from the browser", () => {
  const order = { publicId: "ABCDEFGHJK", status: "PENDING_PAYMENT", paymentStatus: "pending", totalSek: 150, pickupAt: "2026-10-22T11:00:00.000Z", paidAt: null, items: [] };

  test("returns the server's order, and sends the token as a header", async () => {
    let header = "";
    const f = (async (_u: string, init?: RequestInit) => {
      header = (init?.headers as Record<string, string>)["x-order-token"];
      return new Response(JSON.stringify({ order }), { status: 200 });
    }) as unknown as typeof fetch;
    assert.deepEqual(await fetchOrderStatus("ABCDEFGHJK", "tok", f), { kind: "ok", order });
    assert.equal(header, "tok");
  });

  test("404 means denied; other failures are not mistaken for an order", async () => {
    assert.deepEqual(await fetchOrderStatus("A", "t", reply(404, { error: "not_found" })), { kind: "denied" });
    assert.deepEqual(await fetchOrderStatus("A", "t", reply(500, {})), { kind: "error" });
    assert.deepEqual(await fetchOrderStatus("A", "t", reply(200, {})), { kind: "error" });
    const f = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    assert.deepEqual(await fetchOrderStatus("A", "t", f), { kind: "network" });
  });
});
