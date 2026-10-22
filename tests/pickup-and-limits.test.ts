import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isValidPickupTime } from "../src/lib/hours.ts";
import { clientIp, readJsonBody, sameOrigin, serverError } from "../src/server/http.ts";
import { rateLimit, resetRateLimits } from "../src/server/rate-limit.ts";

const rules = { prepMinutes: 25, lastBeforeClose: 15, step: 15, graceMinutes: 5, maxAheadHours: 24 };
// Thursday 22 Oct 2026, 12:00 Stockholm (UTC+2). Winter hours: Mon–Thu 11–21, Fri 11–22.
const NOW = new Date("2026-10-22T10:00:00Z");
const valid = (iso: string, now = NOW) => isValidPickupTime(new Date(iso), now, "vinter", rules);

describe("pickup time validation", () => {
  test("accepts a slot after the prep time, inside opening hours, on the 15-minute grid", () => {
    assert.equal(valid("2026-10-22T11:00:00Z"), true); // 13:00
    assert.equal(valid("2026-10-22T10:30:00Z"), true); // 12:30 = now + 30 min
  });

  test("rejects times that give the kitchen too little time", () => {
    assert.equal(valid("2026-10-22T10:00:00Z"), false);
    assert.equal(valid("2026-10-22T10:15:00Z"), false); // 15 min < 25 - 5 grace
    assert.equal(valid("2026-10-21T10:00:00Z"), false); // the past
  });

  test("allows the small clock-drift grace", () => {
    assert.equal(valid("2026-10-22T10:30:00Z", new Date("2026-10-22T10:09:00Z")), true); // 21 min lead >= 20
  });

  test("rejects off-grid minutes and non-zero seconds", () => {
    assert.equal(valid("2026-10-22T11:07:00Z"), false);
    assert.equal(valid("2026-10-22T11:00:30Z"), false);
  });

  test("rejects times outside opening hours or after the last pickup", () => {
    assert.equal(valid("2026-10-22T18:45:00Z"), true); // 20:45 local = close 21:00 - 15
    assert.equal(valid("2026-10-22T19:00:00Z"), false); // 21:00
    assert.equal(valid("2026-10-22T19:30:00Z"), false); // 21:30
    assert.equal(valid("2026-10-23T07:00:00Z"), false); // Fri 09:00, before opening
  });

  test("Friday closes an hour later", () => {
    const friday = new Date("2026-10-23T12:00:00Z"); // Fri 14:00 local
    assert.equal(valid("2026-10-23T19:45:00Z", friday), true); // Fri 21:45 local
    assert.equal(valid("2026-10-23T20:00:00Z", friday), false); // 22:00
  });

  test("rejects pickups too far ahead and invalid dates", () => {
    assert.equal(valid("2026-10-24T11:00:00Z"), false);
    assert.equal(isValidPickupTime(new Date("nonsense"), NOW, "vinter", rules), false);
  });
});

describe("rate limiter", () => {
  test("allows up to the limit then blocks with a retry hint", () => {
    resetRateLimits();
    const o = { limit: 3, windowMs: 60_000, now: 1_000 };
    for (let i = 0; i < 3; i++) assert.equal(rateLimit("ip-a", o).allowed, true);
    const blocked = rateLimit("ip-a", o);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });

  test("keys are independent and the window resets", () => {
    resetRateLimits();
    const o = { limit: 1, windowMs: 1_000, now: 0 };
    assert.equal(rateLimit("ip-a", o).allowed, true);
    assert.equal(rateLimit("ip-a", o).allowed, false);
    assert.equal(rateLimit("ip-b", o).allowed, true);
    assert.equal(rateLimit("ip-a", { ...o, now: 1_500 }).allowed, true);
  });
});

describe("http helpers", () => {
  const req = (headers: Record<string, string>, body = "{}") =>
    new Request("http://shop.test/api/orders", { method: "POST", headers, body });

  test("same-origin check", () => {
    assert.equal(sameOrigin(req({})), true);
    assert.equal(sameOrigin(req({ origin: "http://shop.test" })), true);
    assert.equal(sameOrigin(req({ origin: "https://evil.example" })), false);
    assert.equal(sameOrigin(req({ origin: "not a url" })), false);
  });

  test("JSON body guards", async () => {
    const wrongType = await readJsonBody(req({ "content-type": "text/plain" }));
    assert.ok(!wrongType.ok && wrongType.response.status === 415);
    const bad = await readJsonBody(req({ "content-type": "application/json" }, "{nope"));
    assert.ok(!bad.ok && bad.response.status === 400);
    const big = await readJsonBody(req({ "content-type": "application/json" }, JSON.stringify({ x: "y".repeat(25_000) })));
    assert.ok(!big.ok && big.response.status === 413);
    const fine = await readJsonBody(req({ "content-type": "application/json" }, '{"a":1}'));
    assert.ok(fine.ok);
  });

  test("client ip comes from the first forwarded address", () => {
    assert.equal(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
    assert.equal(clientIp(req({})), "unknown");
  });

  test("server errors never leak internals; a missing database is a 503", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const leak = serverError(new Error("E11000 duplicate key on mongodb://user:secret@host"));
      assert.equal(leak.status, 500);
      assert.ok(!JSON.stringify(await leak.json()).includes("secret"));
      const down = serverError(new Error("Invalid server environment: MONGODB_URI: not set"));
      assert.equal(down.status, 503);
      assert.deepEqual(await down.json(), { error: "service_unavailable" });
    } finally {
      console.error = original;
    }
  });
});
