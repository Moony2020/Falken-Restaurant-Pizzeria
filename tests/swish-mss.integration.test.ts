import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createSwishGateway } from "../src/server/swish-gateway.ts";

const mssConfig = {
  enabled: true,
  payeeAlias: "1234679304",
  certPath: "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.pem",
  keyPath: "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.key",
  caPath: "certs/swish/client_cert/Swish_TLS_RootCA.pem",
  passphrase: "swish",
  baseUrl: "https://mss.cpc.getswish.net",
};

const hasMssCerts =
  fs.existsSync(mssConfig.certPath) &&
  fs.existsSync(mssConfig.keyPath) &&
  fs.existsSync(mssConfig.caPath);

async function waitForMssTransition(gateway: ReturnType<typeof createSwishGateway>, id: string, maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await gateway.retrievePaymentRequest(id);
    if (s.status !== "CREATED") return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return gateway.retrievePaymentRequest(id);
}

describe("Official Merchant Swish Simulator (MSS) Live Integration Tests", { skip: !hasMssCerts ? "MSS test certificates not present in environment" : false }, () => {
  test("creates a payment request against official MSS endpoint via mTLS and gets valid token", async () => {
    const gateway = createSwishGateway(mssConfig);
    const instructionUUID = crypto.randomUUID().replace(/-/g, "").toUpperCase();

    const result = await gateway.createPaymentRequest({
      instructionUUID,
      payeePaymentReference: "FALKEN-MSS-LIVE-001",
      callbackUrl: "https://example.com/api/webhooks/swish",
      amountSek: 145,
      message: "Falken MSS Live Test",
    });

    assert.equal(result.status, "CREATED");
    assert.ok(result.paymentRequestToken, "PaymentRequestToken should be returned by MSS");
    assert.equal(result.id, instructionUUID);
    assert.equal(result.amount, 145);
    assert.equal(result.currency, "SEK");
  });

  test("retrieves payment request status from official MSS and verifies simulated PAID status", async () => {
    const gateway = createSwishGateway(mssConfig);
    const instructionUUID = crypto.randomUUID().replace(/-/g, "").toUpperCase();

    await gateway.createPaymentRequest({
      instructionUUID,
      payeePaymentReference: "FALKEN-MSS-LIVE-002",
      callbackUrl: "https://example.com/api/webhooks/swish",
      amountSek: 175,
      message: "Falken Settle Test",
    });

    const status = await waitForMssTransition(gateway, instructionUUID);
    assert.equal(status.id, instructionUUID);
    assert.equal(status.status, "PAID");
    assert.ok(status.paymentReference, "Should have a Swish payment reference");
    assert.equal(status.amount, 175);
    assert.equal(status.currency, "SEK");
  });

  test("simulates declined payment error scenario RF07 on official MSS", async () => {
    const gateway = createSwishGateway(mssConfig);
    const instructionUUID = crypto.randomUUID().replace(/-/g, "").toUpperCase();

    await gateway.createPaymentRequest({
      instructionUUID,
      payeePaymentReference: "FALKEN-MSS-FAIL-001",
      callbackUrl: "https://example.com/api/webhooks/swish",
      amountSek: 210,
      message: "RF07", // Swish official error simulation code
    });

    const status = await waitForMssTransition(gateway, instructionUUID);
    assert.equal(status.id, instructionUUID);
    assert.equal(status.status, "ERROR");
    assert.equal(status.errorCode, "RF07");
    assert.match(status.errorMessage || "", /declined/i);
  });
});
