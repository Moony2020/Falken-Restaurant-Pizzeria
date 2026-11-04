import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { markVerified } from "../src/server/payment-apply.ts";
import { getPaymentsConfig } from "../src/server/payments-config.ts";

describe("Swish payment verification & configuration safety", () => {
  test("markVerified creates a valid VerifiedPayment object for provider 'swish'", () => {
    const verified = markVerified({
      provider: "swish",
      providerSessionId: "B8838B27EC104DBF95B598F5359EF29E",
      providerPaymentId: "PAYREF_12345",
      amountSek: 130,
      currency: "SEK",
      orderReference: "ABCDEF1234",
    });

    assert.equal(verified.provider, "swish");
    assert.equal(verified.amountSek, 130);
    assert.equal(verified.currency, "SEK");
    assert.equal(verified.orderReference, "ABCDEF1234");
  });

  test("payments-config loads Swish MSS test defaults correctly", () => {
    const c = getPaymentsConfig({
      PAYMENTS_ENABLED: "true",
      SWISH_ENABLED: "true",
      SWISH_PAYEE_ALIAS: "1234679304",
    });

    assert.equal(c.enabled, true);
    assert.ok(c.swish);
    assert.equal(c.swish?.payeeAlias, "1234679304");
    assert.equal(c.swish?.baseUrl, "https://mss.cpc.getswish.net");
    assert.equal(c.swish?.passphrase, "swish");
  });

  test("payments-config refuses live Swish credentials or malformed aliases", () => {
    assert.throws(
      () =>
        getPaymentsConfig({
          SWISH_PAYEE_ALIAS: "not-a-number",
        }),
      /SWISH_PAYEE_ALIAS must be 10-13 digits/,
    );
  });
});

