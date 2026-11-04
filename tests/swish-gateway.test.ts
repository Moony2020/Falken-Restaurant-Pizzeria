import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createSwishGateway } from "../src/server/swish-gateway.ts";

type Seen = { method?: string; url?: string; headers: IncomingHttpHeaders; body: unknown };
let server: Server;
let port = 0;
let seen: Seen[] = [];

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      let body: unknown = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        // empty or query
      }
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });

      if (req.method === "PUT") {
        res.setHeader("location", "https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/ABC123");
        res.setHeader("paymentrequesttoken", "test_token_12345");
        res.statusCode = 201;
        res.end();
        return;
      }

      if (req.method === "GET") {
        res.setHeader("content-type", "application/json");
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: "ABC123",
            payeePaymentReference: "FALKEN-TEST",
            paymentReference: "PAYREF123",
            callbackUrl: "https://example.com/callback",
            payerAlias: "46700000000",
            payeeAlias: "1234679304",
            amount: 150.0,
            currency: "SEK",
            message: "Falken Test",
            status: "PAID",
            dateCreated: "2026-11-03T12:00:00.000Z",
            datePaid: "2026-11-03T12:01:00.000Z",
            errorCode: null,
            errorMessage: null,
          }),
        );
        return;
      }

      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

after(() => server.close());

const dummyConfig = {
  enabled: true,
  payeeAlias: "1234679304",
  certPath: "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.pem",
  keyPath: "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.key",
  caPath: "certs/swish/client_cert/Swish_TLS_RootCA.pem",
  passphrase: "swish",
  baseUrl: "https://mss.cpc.getswish.net",
};

describe("swish-gateway unit tests", () => {
  test("creates a Swish payment request with exact SEK amount, instructionUUID, and returns payment token", async () => {
    seen = [];
    const gateway = createSwishGateway(dummyConfig, { host: "127.0.0.1", port, protocol: "http" });
    const res = await gateway.createPaymentRequest({
      instructionUUID: "B8838B27EC104DBF95B598F5359EF29E",
      payeePaymentReference: "FALKEN-999",
      callbackUrl: "https://example.com/api/webhooks/swish",
      amountSek: 150,
      message: "Falken order 999",
    });

    assert.equal(res.status, "CREATED");
    assert.equal(res.paymentRequestToken, "test_token_12345");
    assert.equal(res.id, "B8838B27EC104DBF95B598F5359EF29E");

    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "PUT");
    assert.equal(seen[0].url, "/swish-cpcapi/api/v2/paymentrequests/B8838B27EC104DBF95B598F5359EF29E");
    const sentBody = seen[0].body as Record<string, string>;
    assert.equal(sentBody.amount, "150.00");
    assert.equal(sentBody.currency, "SEK");
    assert.equal(sentBody.payeeAlias, "1234679304");
  });

  test("retrieves a Swish payment request and maps status, paymentReference, and amount", async () => {
    seen = [];
    const gateway = createSwishGateway(dummyConfig, { host: "127.0.0.1", port, protocol: "http" });
    const res = await gateway.retrievePaymentRequest("ABC123");

    assert.equal(res.status, "PAID");
    assert.equal(res.paymentReference, "PAYREF123");
    assert.equal(res.amount, 150);
    assert.equal(res.currency, "SEK");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "GET");
    assert.equal(seen[0].url, "/swish-cpcapi/api/v1/paymentrequests/ABC123");
  });
});

