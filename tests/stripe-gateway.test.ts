import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createStripeGateway } from "../src/server/stripe-gateway.ts";

// The real Stripe SDK, pointed at a fake server on this machine. No network, no real key: it checks what we would
// send to Stripe and that we verify webhook signatures on the raw body.

const key = "sk_" + "test_" + "unitTestKeyNotReal1234";
const whsec = "whsec_" + "unitTestSecretNotReal1234";

type Seen = { method?: string; url?: string; headers: IncomingHttpHeaders; body: URLSearchParams };
let server: Server;
let port = 0;
let seen: Seen[] = [];

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: new URLSearchParams(Buffer.concat(chunks).toString()) });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "cs_test_fake1",
          object: "checkout.session",
          url: "https://checkout.stripe.test/c/pay/cs_test_fake1",
          status: "open",
          payment_status: "unpaid",
          amount_total: 12500,
          currency: "sek",
          payment_intent: null,
          client_reference_id: "ABCDEFGHJK",
          expires_at: 1900000000,
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
after(() => server.close());

const gateway = () => createStripeGateway(key, whsec, { host: "127.0.0.1", port, protocol: "http" });

describe("what we send to Stripe", () => {
  test("a card-only, SEK, server-priced session with an idempotency key and a 30 minute expiry", async () => {
    seen = [];
    const s = await gateway().createCheckoutSession({
      publicId: "ABCDEFGHJK",
      orderId: "64b000000000000000000001",
      lines: [
        { name: "1 × Vesuvio", unitAmountOre: 11000 },
        { name: "1 × Extra ost", unitAmountOre: 1500 },
      ],
      successUrl: "https://falken.test/bestallning/ABCDEFGHJK",
      cancelUrl: "https://falken.test/bestallning/ABCDEFGHJK?avbruten=1",
      expiresAt: 1900000000,
      idempotencyKey: "falken-checkout:64b000000000000000000001:1",
    });
    assert.equal(s.url, "https://checkout.stripe.test/c/pay/cs_test_fake1");
    assert.equal(seen.length, 1);
    const [req] = seen;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/checkout/sessions");
    assert.equal(req.headers["idempotency-key"], "falken-checkout:64b000000000000000000001:1");
    assert.match(String(req.headers.authorization), /^Bearer sk_test_/);
    const b = req.body;
    assert.equal(b.get("mode"), "payment");
    assert.equal(b.get("currency"), "sek");
    assert.equal(b.get("allowed_payment_method_types[0]"), "card");
    assert.equal(b.get("allowed_payment_method_types[1]"), null, "only cards");
    assert.equal(b.get("client_reference_id"), "ABCDEFGHJK");
    assert.equal(b.get("expires_at"), "1900000000");
    assert.equal(b.get("line_items[0][price_data][unit_amount]"), "11000");
    assert.equal(b.get("line_items[1][price_data][unit_amount]"), "1500");
    assert.equal(b.get("line_items[0][price_data][currency]"), "sek");
    assert.equal(b.get("metadata[publicId]"), "ABCDEFGHJK");
  });

  test("a session read from Stripe is mapped: amount in öre, payment status and the order reference", async () => {
    const s = await gateway().retrieveSession("cs_test_fake1");
    assert.deepEqual([s.status, s.paymentStatus, s.amountTotal, s.currency, s.clientReferenceId], ["open", "unpaid", 12500, "sek", "ABCDEFGHJK"]);
  });
});

describe("webhook signatures are checked on the raw body (real SDK verification)", () => {
  const body = JSON.stringify({ id: "evt_test_1", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_test_fake1", object: "checkout.session" } } });

  async function sign(payload: string, secret = whsec) {
    const m = await import("stripe");
    return new m.default(key).webhooks.generateTestHeaderString({ payload, secret });
  }

  test("a correctly signed body is accepted", async () => {
    const e = await gateway().constructEvent(body, await sign(body));
    assert.deepEqual([e.id, e.type, e.sessionId], ["evt_test_1", "checkout.session.completed", "cs_test_fake1"]);
  });

  test("a forged signature, a wrong secret, a changed body and a missing secret are all refused", async () => {
    await assert.rejects(gateway().constructEvent(body, "t=1,v1=deadbeef"));
    await assert.rejects(gateway().constructEvent(body, await sign(body, "whsec_" + "someOtherSecret12345678")));
    await assert.rejects(gateway().constructEvent(body.replace("cs_test_fake1", "cs_test_other"), await sign(body)));
    await assert.rejects(gateway().constructEvent(body + " ", await sign(body)), "even whitespace changes the signature");
    await assert.rejects(createStripeGateway(key, undefined).constructEvent(body, await sign(body)));
  });
});
