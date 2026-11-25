import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/server/http.ts";

describe("sameOrigin CSRF and Header-Injection Security Suite", () => {
  test("allows legitimate local requests without proxy headers", () => {
    const req = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
      },
    });
    assert.equal(sameOrigin(req), true);
  });

  test("allows legitimate Render proxy requests (origin matches x-forwarded-host and trusted hosts)", () => {
    const req = new Request("http://localhost:10000/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "https://falkenrestaurant.onrender.com",
        "x-forwarded-host": "falkenrestaurant.onrender.com",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(sameOrigin(req), true);
  });

  test("allows legitimate Vercel requests (origin matches host header)", () => {
    const req = new Request("https://falken-restaurant-pizzeria.vercel.app/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "https://falken-restaurant-pizzeria.vercel.app",
        host: "falken-restaurant-pizzeria.vercel.app",
        "x-forwarded-proto": "https",
      },
    });
    assert.equal(sameOrigin(req), true);
  });

  test("rejects untrusted origin (e.g. attacker.com) even if no proxy headers are sent", () => {
    const req = new Request("https://falkenrestaurant.onrender.com/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "https://evil-attacker.com",
      },
    });
    assert.equal(sameOrigin(req), false);
  });

  test("rejects untrusted origin even when attacker injects matching x-forwarded-host", () => {
    const req = new Request("http://localhost:10000/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "https://evil-attacker.com",
        "x-forwarded-host": "evil-attacker.com",
        host: "falkenrestaurant.onrender.com",
      },
    });
    assert.equal(sameOrigin(req), false, "Must reject untrusted origin even if x-forwarded-host matches it");
  });

  test("rejects untrusted origin when attacker injects matching Host header", () => {
    const req = new Request("http://localhost:10000/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "https://evil-attacker.com",
        host: "evil-attacker.com",
        "x-forwarded-host": "falkenrestaurant.onrender.com",
      },
    });
    assert.equal(sameOrigin(req), false, "Must reject untrusted origin even if Host header matches it");
  });

  test("rejects HTTP origin for HTTPS site in production (scheme mismatch)", () => {
    const envObj = process.env as Record<string, string | undefined>;
    const originalEnv = envObj.NODE_ENV;
    envObj.NODE_ENV = "production";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "http://falkenrestaurant.onrender.com", // Insecure HTTP scheme
          "x-forwarded-host": "falkenrestaurant.onrender.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Must reject insecure http origin when server is accessed via https");
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });

  test("allows requests with no Origin header (non-browser server-to-server or webhooks)", () => {
    const req = new Request("https://falkenrestaurant.onrender.com/api/webhooks/swish", {
      method: "POST",
    });
    assert.equal(sameOrigin(req), true);
  });
});
