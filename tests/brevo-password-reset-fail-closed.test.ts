import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { POST as forgotPasswordPost } from "../src/app/api/admin/auth/forgot-password/route.ts";
import { sendPasswordResetEmail, type SendEmailResult } from "../src/server/email.ts";
import { StaffPasswordResetModel, StaffUserModel } from "../src/server/models/staff.ts";

test("BREVO-P2-R1: Password Reset Email Fail-Closed Hardening, Zero Leaks & Route Contract", async (t) => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  // Helper to safely intercept console output
  function captureConsole() {
    const logs: string[] = [];
    const errors: string[] = [];
    const origLog = console.log;
    const origError = console.error;

    console.log = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    };
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" "));
    };

    return {
      get logs() {
        return logs;
      },
      get errors() {
        return errors;
      },
      restore() {
        console.log = origLog;
        console.error = origError;
      },
    };
  }

  t.afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  await t.test("P2-01: Brevo accepted request returns sent: true, mode: 'brevo'", async () => {
    process.env.BREVO_API_KEY = "test_brevo_api_key_valid";
    process.env.BREVO_SENDER_EMAIL = "mymoon676@hotmail.com";
    process.env.BREVO_SENDER_NAME = "Falken Test";

    let fetchedUrl = "";
    let fetchedHeaders: Record<string, string> = {};
    let fetchedBody: unknown = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchedUrl = String(input);
      fetchedHeaders = (init?.headers as Record<string, string>) || {};
      fetchedBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(JSON.stringify({ messageId: "msg_synthetic_123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    };

    const c = captureConsole();
    try {
      const result: SendEmailResult = await sendPasswordResetEmail({
        to: "mymoon676@hotmail.com",
        name: "Admin User",
        resetUrl: "https://localhost:3000/admin/reset-password?token=secret_token_12345",
      });

      assert.equal(result.sent, true, "Must return sent: true when Brevo accepts request");
      assert.equal(result.mode, "brevo", "Must indicate mode: 'brevo'");
      assert.equal(result.error, undefined, "Error must be undefined on success");
      assert.equal(fetchedUrl, "https://api.brevo.com/v3/smtp/email");
      assert.equal(fetchedHeaders["api-key"], "test_brevo_api_key_valid");
      assert.ok(fetchedBody && typeof fetchedBody === "object");
    } finally {
      c.restore();
    }
  });

  await t.test(
    "P2-02: Brevo rejected request fails closed with bounded error code and zero leaks of sensitive response body",
    async () => {
      process.env.BREVO_API_KEY = "test_brevo_api_key_invalid";
      process.env.BREVO_SENDER_EMAIL = "mymoon676@hotmail.com";

      const maliciousResponseBody = JSON.stringify({
        code: "unauthorized",
        message: "Key not found: fake_brevo_secret_key_888",
        leak: "https://evil.test/leak?token=fake_reset_token_xyz",
      });

      globalThis.fetch = async () => {
        return new Response(maliciousResponseBody, {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      };

      const c = captureConsole();
      try {
        const sensitiveToken = "unauthorized_token_secret_999";
        const sensitiveUrl = `https://localhost:3000/admin/reset-password?token=${sensitiveToken}`;

        const result: SendEmailResult = await sendPasswordResetEmail({
          to: "mymoon676@hotmail.com",
          name: "Admin User",
          resetUrl: sensitiveUrl,
        });

        assert.equal(result.sent, false, "Must return sent: false on Brevo rejection");
        assert.equal(result.mode, "brevo", "Mode must remain 'brevo' and NOT downgrade to 'dev'");
        assert.equal(result.error, "brevo_http_error_401", "Must use bounded, non-sensitive error code");

        // Verify that NO dev box or sensitive reset URL was logged to console.log
        const allLogs = c.logs.join("\n");
        assert.ok(!allLogs.includes("FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK"), "Must NOT log dev reset box on provider failure");
        assert.ok(!allLogs.includes(sensitiveToken), "stdout must NOT contain the sensitive reset token");
        assert.ok(!allLogs.includes("fake_brevo_secret_key_888"), "stdout must NOT contain synthetic secrets");

        // Verify that console.error does NOT leak raw response body or sensitive keys
        const allErrors = c.errors.join("\n");
        assert.ok(!allErrors.includes(sensitiveToken), "stderr must NOT contain the sensitive reset token");
        assert.ok(!allErrors.includes("fake_brevo_secret_key_888"), "stderr must NOT contain synthetic response secrets");
        assert.ok(!allErrors.includes("fake_reset_token_xyz"), "stderr must NOT contain synthetic response token");
        assert.ok(!allErrors.includes("evil.test"), "stderr must NOT contain synthetic URL host");
        assert.ok(allErrors.includes("code=brevo_http_error_401"), "stderr must log bounded error code");
      } finally {
        c.restore();
      }
    },
  );

  await t.test(
    "P2-03: Brevo network failure fails closed with bounded error code and zero leaks of exception text",
    async () => {
      process.env.BREVO_API_KEY = "test_brevo_api_key_network_err";
      process.env.BREVO_SENDER_EMAIL = "mymoon676@hotmail.com";

      globalThis.fetch = async () => {
        throw new Error(
          "fetch failed: getaddrinfo ENOTFOUND internal-auth-gateway.cluster.local:443 sensitive_internal_token_999",
        );
      };

      const c = captureConsole();
      try {
        const sensitiveToken = "network_token_secret_888";
        const sensitiveUrl = `https://localhost:3000/admin/reset-password?token=${sensitiveToken}`;

        const result = await sendPasswordResetEmail({
          to: "mymoon676@hotmail.com",
          name: "Admin User",
          resetUrl: sensitiveUrl,
        });

        assert.equal(result.sent, false, "Must return sent: false on network failure");
        assert.equal(result.mode, "brevo", "Mode must remain 'brevo'");
        assert.equal(result.error, "brevo_network_error", "Must return bounded error code 'brevo_network_error'");

        const allLogs = c.logs.join("\n");
        assert.ok(!allLogs.includes(sensitiveToken), "stdout must NOT contain token");
        assert.ok(!allLogs.includes("sensitive_internal_token_999"), "stdout must NOT contain sensitive exception text");

        const allErrors = c.errors.join("\n");
        assert.ok(!allErrors.includes(sensitiveToken), "stderr must NOT contain token");
        assert.ok(!allErrors.includes("sensitive_internal_token_999"), "stderr must NOT contain sensitive exception text");
        assert.ok(!allErrors.includes("internal-auth-gateway"), "stderr must NOT contain internal gateway text");
        assert.ok(allErrors.includes("code=brevo_network_error"), "stderr must log bounded code=brevo_network_error");
      } finally {
        c.restore();
      }
    },
  );

  await t.test(
    "P2-04: SMTP failure fails closed: sent: false, mode: 'smtp', bounded error code, zero leaks of exception text",
    async () => {
      delete process.env.BREVO_API_KEY;
      process.env.SMTP_HOST = "smtp.example.test";
      process.env.SMTP_PORT = "587";
      process.env.SMTP_USER = "falken-admin@example.test";
      process.env.SMTP_PASS = "sensitive_smtp_password_999";

      const origCreateTransport = nodemailer.createTransport;
      nodemailer.createTransport = (() => ({
        sendMail: async () => {
          throw new Error("535 5.7.8 Authentication credentials invalid: sensitive_smtp_password_999");
        },
      })) as unknown as typeof nodemailer.createTransport;

      const c = captureConsole();
      try {
        const sensitiveToken = "smtp_token_secret_777";
        const sensitiveUrl = `https://localhost:3000/admin/reset-password?token=${sensitiveToken}`;

        const result: SendEmailResult = await sendPasswordResetEmail({
          to: "admin@example.test",
          name: "Admin User",
          resetUrl: sensitiveUrl,
        });

        assert.equal(result.sent, false, "Must return sent: false on SMTP failure");
        assert.equal(result.mode, "smtp", "Mode must remain 'smtp' and NOT downgrade to 'dev'");
        assert.equal(result.error, "smtp_send_error", "Must return bounded code 'smtp_send_error'");

        const allLogs = c.logs.join("\n");
        assert.ok(!allLogs.includes("FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK"), "Must NOT log dev reset box on SMTP failure");
        assert.ok(!allLogs.includes(sensitiveToken), "stdout must NOT contain token");

        const allErrors = c.errors.join("\n");
        assert.ok(!allErrors.includes(sensitiveToken), "stderr must NOT contain token");
        assert.ok(!allErrors.includes("sensitive_smtp_password_999"), "stderr must NOT contain SMTP credentials");
        assert.ok(!allErrors.includes("Authentication credentials invalid"), "stderr must NOT contain raw exception text");
        assert.ok(allErrors.includes("code=smtp_send_error"), "stderr must log bounded code=smtp_send_error");
      } finally {
        nodemailer.createTransport = origCreateTransport;
        c.restore();
      }
    },
  );

  await t.test(
    "P2-05: Missing provider configuration in production environment fails closed with code=no_provider_configured",
    async () => {
      delete process.env.BREVO_API_KEY;
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";

      const c = captureConsole();
      try {
        const dummyToken = "prod_unconfigured_token_777";
        const dummyUrl = `https://falkenrestaurang.se/admin/reset-password?token=${dummyToken}`;

        const result = await sendPasswordResetEmail({
          to: "admin@falkenrestaurang.se",
          name: "Production Admin",
          resetUrl: dummyUrl,
        });

        assert.equal(result.sent, false, "Must return sent: false in production when no provider configured");
        assert.equal(result.error, "no_provider_configured");

        const allLogs = c.logs.join("\n");
        assert.ok(!allLogs.includes("FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK"), "Production must NEVER log dev reset box");
        assert.ok(!allLogs.includes(dummyToken), "Production logs must never expose reset token");

        const allErrors = c.errors.join("\n");
        assert.ok(allErrors.includes("code=no_provider_configured"), "stderr must log bounded code");
      } finally {
        c.restore();
      }
    },
  );

  await t.test("P2-06: Safe local development fallback is restricted to non-production with no provider", async () => {
    delete process.env.BREVO_API_KEY;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "development";

    const c = captureConsole();
    try {
      const devToken = "dev_local_token_666";
      const devUrl = `https://localhost:3000/admin/reset-password?token=${devToken}`;

      const result = await sendPasswordResetEmail({
        to: "developer@local.test",
        name: "Local Dev",
        resetUrl: devUrl,
      });

      assert.equal(result.sent, true, "Local dev fallback without provider returns sent: true");
      assert.equal(result.mode, "dev", "Mode must be 'dev'");
      assert.equal(result.error, undefined);

      const allLogs = c.logs.join("\n");
      assert.ok(allLogs.includes("FALKEN ADMIN - ÅTERSTÄLLNINGSLÄNK"), "Local dev logs terminal box for local developer");
      assert.ok(allLogs.includes(devToken), "Local dev box contains the token for local developer convenience");
    } finally {
      c.restore();
    }
  });

  await t.test(
    "P2-07: Public API route POST handler anti-account-enumeration: Cases A, B, and C return identical responses",
    async () => {
      process.env.ADMIN_SESSION_SECRET = "super_secret_admin_session_key_32_chars_minimum!";
      (process.env as Record<string, string | undefined>)["NODE_ENV"] = "test";

      // In-memory stub for connectDb: prevents live DB network operations
      type MongoCache = { promise: Promise<typeof mongoose> | null };
      const g = globalThis as typeof globalThis & { __falkenMongo?: MongoCache };
      if (!g.__falkenMongo) {
        g.__falkenMongo = { promise: Promise.resolve(mongoose) };
      } else {
        g.__falkenMongo.promise = Promise.resolve(mongoose);
      }
      const origReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, "readyState", {
        value: 1,
        configurable: true,
        writable: true,
      });

      const origFindOne = StaffUserModel.findOne;
      const origUpdateMany = StaffPasswordResetModel.updateMany;
      const origCreate = StaffPasswordResetModel.create;

      const mockUser = {
        _id: new mongoose.Types.ObjectId("64b8a25f1c9d440000a1b2c3"),
        email: "existing-admin@falkenrestaurang.se",
        displayName: "Falken Admin",
        active: true,
      };

      const c = captureConsole();
      try {
        // --- CASE A: Existing Admin account with successful mocked email delivery ---
        StaffUserModel.findOne = (() => ({
          lean: async () => mockUser,
        })) as unknown as typeof StaffUserModel.findOne;
        StaffPasswordResetModel.updateMany = (async () => ({})) as unknown as typeof StaffPasswordResetModel.updateMany;
        StaffPasswordResetModel.create = (async () => ({})) as unknown as typeof StaffPasswordResetModel.create;

        process.env.BREVO_API_KEY = "test_brevo_key_case_a";
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ messageId: "msg_synthetic_case_a" }), {
            status: 201,
            headers: { "content-type": "application/json" },
          });

        const reqA = new Request("http://localhost:3000/api/admin/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.101",
          },
          body: JSON.stringify({ email: "existing-admin@falkenrestaurang.se" }),
        });

        const resA = await forgotPasswordPost(reqA);
        const dataA = await resA.json();

        assert.equal(resA.status, 200, "Case A must return HTTP 200");
        assert.deepEqual(
          dataA,
          {
            ok: true,
            message: "Om e-postadressen finns i vårt system har en återställningslänk skickats.",
          },
          "Case A must return Swedish anti-enumeration message",
        );

        // --- CASE B: Nonexistent Admin account ---
        StaffUserModel.findOne = (() => ({
          lean: async () => null,
        })) as unknown as typeof StaffUserModel.findOne;

        const reqB = new Request("http://localhost:3000/api/admin/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.102",
          },
          body: JSON.stringify({ email: "nonexistent-user@falkenrestaurang.se" }),
        });

        const resB = await forgotPasswordPost(reqB);
        const dataB = await resB.json();

        assert.equal(resB.status, 200, "Case B must return HTTP 200");
        assert.deepEqual(
          dataB,
          {
            ok: true,
            message: "Om e-postadressen finns i vårt system har en återställningslänk skickats.",
          },
          "Case B must return identical Swedish anti-enumeration message",
        );

        // --- CASE C: Existing Admin account with failed mocked email delivery ---
        StaffUserModel.findOne = (() => ({
          lean: async () => mockUser,
        })) as unknown as typeof StaffUserModel.findOne;

        const simulatedLeakSecret = "brevo_internal_sensitive_leak_value_999";
        globalThis.fetch = async () =>
          new Response(JSON.stringify({ code: "server_error", message: `Crash: ${simulatedLeakSecret}` }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });

        const reqC = new Request("http://localhost:3000/api/admin/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.103",
          },
          body: JSON.stringify({ email: "existing-admin@falkenrestaurang.se" }),
        });

        const resC = await forgotPasswordPost(reqC);
        const dataC = await resC.json();

        assert.equal(resC.status, 200, "Case C must return HTTP 200");
        assert.deepEqual(
          dataC,
          {
            ok: true,
            message: "Om e-postadressen finns i vårt system har en återställningslänk skickats.",
          },
          "Case C must return identical Swedish anti-enumeration message",
        );

        // Verify exact cross-case response equivalence (prevent timing/content enumeration)
        assert.deepEqual(dataA, dataB, "Case A and Case B responses must be indistinguishable");
        assert.deepEqual(dataB, dataC, "Case B and Case C responses must be indistinguishable");

        // Verify Case C logged the failure safely with bounded code and zero leak
        const allErrors = c.errors.join("\n");
        assert.ok(
          allErrors.includes("[AUTH] Password reset email failed to deliver to existing-admin@falkenrestaurang.se"),
          "stderr must log delivery failure",
        );
        assert.ok(
          allErrors.includes("code: brevo_http_error_500"),
          "stderr must log bounded error code brevo_http_error_500",
        );
        assert.ok(
          !allErrors.includes(simulatedLeakSecret),
          "stderr must NOT contain the simulated upstream leak secret",
        );
      } finally {
        Object.defineProperty(mongoose.connection, "readyState", {
          value: origReadyState,
          configurable: true,
          writable: true,
        });
        StaffUserModel.findOne = origFindOne;
        StaffPasswordResetModel.updateMany = origUpdateMany;
        StaffPasswordResetModel.create = origCreate;
        c.restore();
      }
    },
  );
});
