import { test } from "node:test";
import assert from "node:assert/strict";
import { POST as ordersPost } from "../src/app/api/orders/route.ts";

// No MONGODB_URI and no connection here: these prove bad requests are refused before any database work,
// and that a missing database degrades to a clean 503.
const post = (payload: unknown, ip: string) =>
  ordersPost(
    new Request("http://shop.test/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(payload),
    }),
  );

const valid = {
  idempotencyKey: "abcdefghijklmnop",
  items: [{ productSlug: "vesuvio", variantId: "normal", quantity: 1 }],
  contact: { name: "Anna", phone: "070-123 45 67" },
  pickupAt: "2030-01-01T11:00:00.000Z",
};

test("a forged order is a 400 and never reaches the database", async () => {
  const res = await post({ ...valid, status: "PAID", totalSek: 0 }, "198.51.100.1");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "invalid_request");
});

test("a well-formed order with no database configured is a clean 503", async () => {
  const original = console.error;
  console.error = () => {};
  const saved = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try {
    const res = await post(valid, "198.51.100.2");
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "service_unavailable" });
  } finally {
    console.error = original;
    if (saved !== undefined) process.env.MONGODB_URI = saved;
  }
});
