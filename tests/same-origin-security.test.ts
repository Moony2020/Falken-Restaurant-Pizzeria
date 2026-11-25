import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sameOrigin } from "../src/server/http.ts";

describe("sameOrigin CSRF and Header-Injection Security Suite (R2 Final Hardened)", () => {
  const envObj = process.env as Record<string, string | undefined>;

  test("allows legitimate local requests in development without proxy headers", () => {
    const originalEnv = envObj.NODE_ENV;
    delete envObj.NODE_ENV;
    try {
      const req = new Request("http://localhost:3000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
        },
      });
      assert.equal(sameOrigin(req), true);
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });

  test("allows legitimate development/test domain (e.g. shop.test) matching request.url", () => {
    const originalEnv = envObj.NODE_ENV;
    delete envObj.NODE_ENV;
    try {
      const req = new Request("http://shop.test/api/orders", {
        method: "POST",
        headers: {
          origin: "http://shop.test",
        },
      });
      assert.equal(sameOrigin(req), true, "Non-production environments must support local test domains like shop.test");
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });

  test("allows legitimate IPv6 loopback in development environment", () => {
    const originalEnv = envObj.NODE_ENV;
    delete envObj.NODE_ENV;
    try {
      const req = new Request("http://[::1]:3000/api/orders", {
        method: "POST",
        headers: {
          origin: "http://[::1]:3000",
        },
      });
      assert.equal(sameOrigin(req), true, "Non-production environments must support IPv6 loopback [::1]");
    } finally {
      envObj.NODE_ENV = originalEnv;
    }
  });

  test("allows legitimate Render proxy requests in production (origin matches x-forwarded-host and deployment origin)", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com",
          "x-forwarded-proto": "https",
          host: "localhost:10000",
        },
      });
      assert.equal(sameOrigin(req), true);
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("allows explicit default HTTPS port 443 in forwarded-host on Render", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com:443",
          "x-forwarded-proto": "https",
          host: "localhost:10000",
        },
      });
      assert.equal(sameOrigin(req), true, "Explicit default port 443 must be equivalent to implicit default port");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  // Edge case 1: Port mismatch
  test("rejects port mismatch: X-Forwarded-Host with non-default port :8443 versus default HTTPS origin", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com:8443",
          "x-forwarded-proto": "https",
          host: "localhost:10000",
        },
      });
      assert.equal(sameOrigin(req), false, "Must reject when forwarded host has a mismatched non-default port");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("handles multi-value x-forwarded-host safely by evaluating the first entry", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com, attacker.com",
          "x-forwarded-proto": "https",
          host: "localhost:10000",
        },
      });
      assert.equal(sameOrigin(req), true, "Must parse the first proxy hop safely");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("allows legitimate Vercel requests in production (origin matches host header and deployment origin)", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalVercel = envObj.VERCEL;
    envObj.NODE_ENV = "production";
    envObj.VERCEL = "1";
    try {
      const req = new Request("https://falken-restaurant-pizzeria.vercel.app/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falken-restaurant-pizzeria.vercel.app",
          host: "falken-restaurant-pizzeria.vercel.app",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), true);
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.VERCEL = originalVercel;
    }
  });

  test("allows legitimate custom domain configured via SITE_URL in production", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.SITE_URL = "https://custom.falkenrestaurant.com";
    try {
      const req = new Request("https://custom.falkenrestaurant.com/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://custom.falkenrestaurant.com",
          host: "custom.falkenrestaurant.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), true);
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.SITE_URL = originalSite;
    }
  });

  // Finding 1: Cross-project domain with spoofed header
  test("rejects cross-deployment spoofing: Render deployment receiving spoofed Vercel x-forwarded-host", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falken-restaurant-pizzeria.vercel.app",
          "x-forwarded-host": "falken-restaurant-pizzeria.vercel.app",
          host: "falkenrestaurant.onrender.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Render deployment must never accept Vercel origin even if x-forwarded-host matches it");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("rejects conflicting Host and X-Forwarded-Host headers", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com",
          host: "evil-attacker.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Must reject when host is a conflicting public domain");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("fails closed when SITE_URL conflicts with deployment platform (Render with Vercel SITE_URL)", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    envObj.SITE_URL = "https://falken-restaurant-pizzeria.vercel.app";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falken-restaurant-pizzeria.vercel.app",
          "x-forwarded-host": "falken-restaurant-pizzeria.vercel.app",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Must fail closed when SITE_URL contradicts detected platform");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
      envObj.SITE_URL = originalSite;
    }
  });

  test("fails closed when SITE_URL conflicts with deployment platform (Vercel with Render SITE_URL)", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalVercel = envObj.VERCEL;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.VERCEL = "1";
    envObj.SITE_URL = "https://falkenrestaurant.onrender.com";
    try {
      const req = new Request("https://falkenrestaurant.onrender.com/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://falkenrestaurant.onrender.com",
          host: "falkenrestaurant.onrender.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Must fail closed when SITE_URL contradicts detected platform");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.VERCEL = originalVercel;
      envObj.SITE_URL = originalSite;
    }
  });

  test("fails closed when SITE_URL is configured to HTTPS localhost in production", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.SITE_URL = "https://localhost:3000";
    try {
      const req = new Request("https://localhost:3000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://localhost:3000",
          host: "localhost:3000",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Production must fail closed if SITE_URL points to localhost");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.SITE_URL = originalSite;
    }
  });

  // Edge case 2: IPv6 loopback configured in Production
  test("fails closed when SITE_URL is configured to IPv6 loopback [::1] in production", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.SITE_URL = "https://[::1]:3000";
    try {
      const req = new Request("https://[::1]:3000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://[::1]:3000",
          host: "[::1]:3000",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Production must fail closed if SITE_URL points to IPv6 loopback [::1]:3000");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.SITE_URL = originalSite;
    }
  });

  test("fails closed when SITE_URL is configured to bare IPv6 loopback [::1] in production", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalSite = envObj.SITE_URL;
    envObj.NODE_ENV = "production";
    envObj.SITE_URL = "https://[::1]";
    try {
      const req = new Request("https://[::1]/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://[::1]",
          host: "[::1]",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Production must fail closed if SITE_URL points to bare IPv6 loopback [::1]");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.SITE_URL = originalSite;
    }
  });

  // Finding 2: Insecure HTTP Origin in production
  test("rejects HTTP origin in production even if request URL is internal HTTP and x-forwarded-proto is absent", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:10000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "http://falkenrestaurant.onrender.com",
          "x-forwarded-host": "falkenrestaurant.onrender.com",
        },
      });
      assert.equal(sameOrigin(req), false, "Must strictly reject any http:// origin in production");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  // Finding 3: Direct request to unapproved domain matching request.url
  test("rejects unapproved direct domain in production even when origin exactly matches request.url", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("https://unapproved-mirror.com/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://unapproved-mirror.com",
          host: "unapproved-mirror.com",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(sameOrigin(req), false, "Must strictly reject unapproved domains even if request.url matches origin");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  // Finding 4: Localhost in production
  test("rejects localhost origin in production even with matching host header", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("http://localhost:3000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
      });
      assert.equal(sameOrigin(req), false, "Must reject localhost in production");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
  });

  test("rejects HTTPS localhost in production", () => {
    const originalEnv = envObj.NODE_ENV;
    const originalRender = envObj.RENDER;
    envObj.NODE_ENV = "production";
    envObj.RENDER = "true";
    try {
      const req = new Request("https://localhost:3000/api/admin/auth/login", {
        method: "POST",
        headers: {
          origin: "https://localhost:3000",
          host: "localhost:3000",
        },
      });
      assert.equal(sameOrigin(req), false, "Must reject HTTPS localhost in production");
    } finally {
      envObj.NODE_ENV = originalEnv;
      envObj.RENDER = originalRender;
    }
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

  test("rejects untrusted origin when attacker injects matching x-forwarded-host", () => {
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

  test("allows requests with no Origin header (non-browser server-to-server or webhooks)", () => {
    const req = new Request("https://falkenrestaurant.onrender.com/api/webhooks/swish", {
      method: "POST",
    });
    assert.equal(sameOrigin(req), true);
  });

  test("rejects malformed origin strings", () => {
    const req = new Request("http://localhost:3000/api/admin/auth/login", {
      method: "POST",
      headers: {
        origin: "not a valid url",
      },
    });
    assert.equal(sameOrigin(req), false);
  });
});
