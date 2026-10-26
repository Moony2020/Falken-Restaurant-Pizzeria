import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { deriveAccessToken, verifyAccessToken } from "../src/server/order-access.ts";
import { getOrderTokenSecret } from "../src/server/env.ts";
import { getPaymentsConfig, ORDER_EXPIRY_MINUTES, PAYMENT_SESSION_MINUTES } from "../src/server/payments-config.ts";

// Fake, test-shaped values built at runtime so no key-looking literal sits in the repository.
const fakeStripe = "sk_" + "test_" + "A1b2C3d4E5f6G7h8";
const fakeWebhook = "whsec_" + "A1b2C3d4E5f6G7h8";
const fakeLive = "sk_" + "live_" + "A1b2C3d4E5f6G7h8";
const throwsWithout = (fn: () => unknown, secret: string) => {
  try {
    fn();
    assert.fail("should have thrown");
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(!e.message.includes(secret), "the error message must not repeat the secret");
    return e.message;
  }
};

describe("payments configuration (test mode only)", () => {
  test("empty configuration is valid: nothing connected yet", () => {
    const c = getPaymentsConfig({});
    assert.deepEqual(c, { mode: "test", enabled: false, siteUrl: undefined, stripe: null });
  });

  test("Stripe TEST keys are accepted", () => {
    const c = getPaymentsConfig({ STRIPE_SECRET_KEY: fakeStripe, STRIPE_WEBHOOK_SECRET: fakeWebhook });
    assert.equal(c.stripe?.secretKey, fakeStripe);
    assert.equal(c.stripe?.webhookSecret, fakeWebhook);
  });

  test("a Stripe LIVE key is refused, and the message doesn't contain it", () => {
    const msg = throwsWithout(() => getPaymentsConfig({ STRIPE_SECRET_KEY: fakeLive }), fakeLive);
    assert.match(msg, /LIVE credential/);
    assert.match(msg, /STRIPE_SECRET_KEY/);
  });

  test("a live key hiding in any other variable is refused too", () => {
    const msg = throwsWithout(() => getPaymentsConfig({ STRIPE_WEBHOOK_SECRET: fakeLive }), fakeLive);
    assert.match(msg, /LIVE credential/);
  });

  test("malformed Stripe values are refused", () => {
    assert.throws(() => getPaymentsConfig({ STRIPE_SECRET_KEY: "not-a-key" }), /TEST mode key/);
    assert.throws(() => getPaymentsConfig({ STRIPE_WEBHOOK_SECRET: "nope" }), /whsec_/);
  });

  test("payments are off unless PAYMENTS_ENABLED=true, and the flag is validated", () => {
    assert.equal(getPaymentsConfig({}).enabled, false);
    assert.equal(getPaymentsConfig({ PAYMENTS_ENABLED: "false" }).enabled, false);
    assert.equal(getPaymentsConfig({ PAYMENTS_ENABLED: "true" }).enabled, true);
    assert.throws(() => getPaymentsConfig({ PAYMENTS_ENABLED: "yes" }), /PAYMENTS_ENABLED/);
  });

  test("SITE_URL must be a URL; a trailing slash is dropped", () => {
    assert.equal(getPaymentsConfig({ SITE_URL: "https://falken.example/" }).siteUrl, "https://falken.example");
    assert.throws(() => getPaymentsConfig({ SITE_URL: "not a url" }), /SITE_URL/);
  });

  test("only PAYMENTS_MODE=test exists", () => {
    assert.deepEqual(getPaymentsConfig({ PAYMENTS_MODE: "test" }).mode, "test");
    assert.throws(() => getPaymentsConfig({ PAYMENTS_MODE: "live" }), /PAYMENTS_MODE/);
  });

  test("the agreed timings: 30 minute payment session, 45 minute order window", () => {
    assert.equal(PAYMENT_SESSION_MINUTES, 30);
    assert.equal(ORDER_EXPIRY_MINUTES, 45);
    assert.ok(ORDER_EXPIRY_MINUTES > PAYMENT_SESSION_MINUTES, "an order must outlive its payment session");
  });
});

describe("order access tokens", () => {
  const secret = "s".repeat(40);

  test("a token is stable for an order and differs between orders", () => {
    assert.equal(deriveAccessToken("ABCDEFGHJK", secret), deriveAccessToken("ABCDEFGHJK", secret));
    assert.notEqual(deriveAccessToken("ABCDEFGHJK", secret), deriveAccessToken("ABCDEFGHJM", secret));
  });

  test("the right token verifies; a token for another order, a wrong or missing one does not", () => {
    const token = deriveAccessToken("ABCDEFGHJK", secret);
    assert.equal(verifyAccessToken("ABCDEFGHJK", token, secret), true);
    assert.equal(verifyAccessToken("ABCDEFGHJM", token, secret), false);
    assert.equal(verifyAccessToken("ABCDEFGHJK", token + "x", secret), false);
    assert.equal(verifyAccessToken("ABCDEFGHJK", token.slice(0, -1), secret), false);
    assert.equal(verifyAccessToken("ABCDEFGHJK", "", secret), false);
    assert.equal(verifyAccessToken("ABCDEFGHJK", null, secret), false);
    assert.equal(verifyAccessToken("ABCDEFGHJK", "x".repeat(500), secret), false);
  });

  test("the public order number alone is not a token", () => {
    assert.equal(verifyAccessToken("ABCDEFGHJK", "ABCDEFGHJK", secret), false);
  });

  test("a token made with a different secret is rejected", () => {
    assert.equal(verifyAccessToken("ABCDEFGHJK", deriveAccessToken("ABCDEFGHJK", "t".repeat(40)), secret), false);
  });

  test("a weak or missing secret is refused", () => {
    assert.throws(() => deriveAccessToken("ABCDEFGHJK", "short"), /32 characters/);
    assert.throws(() => getOrderTokenSecret({}), /ORDER_TOKEN_SECRET/);
    assert.throws(() => getOrderTokenSecret({ ORDER_TOKEN_SECRET: "short" }), /ORDER_TOKEN_SECRET/);
    assert.equal(getOrderTokenSecret({ ORDER_TOKEN_SECRET: secret }), secret);
  });
});

describe("order token secret handling", () => {
  test("a weak secret is refused without repeating it in the error", () => {
    const weak = "weak-secret-value";
    try {
      getOrderTokenSecret({ ORDER_TOKEN_SECRET: weak });
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof Error && !e.message.includes(weak));
    }
    try {
      deriveAccessToken("ABCDEFGHJK", weak);
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e instanceof Error && !e.message.includes(weak));
    }
  });
});
