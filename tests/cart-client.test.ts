import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { firstSightings, issueMessageSv, priceChanges, toPayloadItems, validateCart, type PricedLineView } from "../src/lib/cart-api.ts";
import { cartPricingStore, refreshCartPricing } from "../src/lib/cart-pricing-store.ts";
import { cartStore, type CartLine } from "../src/lib/cart-store.ts";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  key: "vesuvio|normal|||",
  productSlug: "vesuvio",
  variantId: "normal",
  removed: [],
  modifiers: [],
  note: "",
  ifUnavailable: "call",
  quantity: 1,
  ...over,
});
const priced = (total: number): PricedLineView => ({
  productSlug: "vesuvio",
  productNameSnapshot: "Vesuvio",
  variantNameSnapshot: "Normal",
  basePriceSek: total,
  removedIngredients: [],
  modifiersSnapshot: [],
  quantity: 1,
  lineTotalSek: total,
});

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers })) as unknown as typeof fetch;

describe("what the browser sends for pricing", () => {
  test("only choices are sent: no price, total, name or seen total", () => {
    const items = toPayloadItems([line({ seenTotalSek: 1, modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] })]);
    assert.deepEqual(Object.keys(items[0]).sort(), ["ifUnavailable", "modifiers", "note", "productSlug", "quantity", "removedIngredients", "variantId"]);
    assert.ok(!/price|total/i.test(JSON.stringify(items)));
  });
});

describe("validating the cart on the server", () => {
  test("a good answer is returned as the server's prices", async () => {
    const r = await validateCart([line()], respond(200, { lines: [priced(110)], subtotalSek: 110, totalSek: 110, currency: "SEK" }));
    assert.ok(r.status === "ready" && r.totalSek === 110);
  });

  test("unavailable or unconfirmed items come back as issues", async () => {
    const r = await validateCart([line()], respond(422, { error: "pricing", issues: [{ index: 0, code: "price_unconfirmed", message: "x" }] }));
    assert.ok(r.status === "issues" && r.issues[0].code === "price_unconfirmed");
  });

  test("an offline browser is an error, never an invented price", async () => {
    const r = await validateCart([line()], (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    assert.deepEqual(r, { status: "error", reason: "network" });
  });

  test("429, 500 and malformed answers are errors", async () => {
    assert.deepEqual(await validateCart([line()], respond(429, { error: "rate_limited" })), { status: "error", reason: "rate_limited" });
    assert.deepEqual(await validateCart([line()], respond(500, { error: "internal_error" })), { status: "error", reason: "server" });
    assert.deepEqual(await validateCart([line()], respond(200, "<html>")), { status: "error", reason: "server" });
    assert.deepEqual(await validateCart([line()], respond(200, { lines: [], subtotalSek: 0, totalSek: 0 })), { status: "error", reason: "server" });
    assert.deepEqual(await validateCart([line()], respond(200, { lines: [priced(1)], subtotalSek: "1", totalSek: 1 })), { status: "error", reason: "server" });
  });
});

describe("price changes", () => {
  test("a changed line total is reported with before and after", () => {
    assert.deepEqual(priceChanges([line({ seenTotalSek: 110 })], [priced(115)]), [{ key: line().key, from: 110, to: 115 }]);
  });

  test("an unchanged total or a line never priced before is not a change", () => {
    assert.deepEqual(priceChanges([line({ seenTotalSek: 110 })], [priced(110)]), []);
    assert.deepEqual(priceChanges([line()], [priced(110)]), []);
  });

  test("first sightings are remembered without a warning", () => {
    assert.deepEqual(firstSightings([line()], [priced(110)]), { [line().key]: 110 });
    assert.deepEqual(firstSightings([line({ seenTotalSek: 110 })], [priced(115)]), {});
  });
});

describe("Swedish messages", () => {
  test("every refusal code has a Swedish customer message", () => {
    const codes = ["unknown_product", "product_unavailable", "unknown_variant", "variant_unavailable", "price_unconfirmed", "removal_not_allowed", "unknown_ingredient", "unknown_modifier", "modifier_unavailable", "modifier_not_allowed", "modifier_price_unconfirmed", "modifier_quantity", "duplicate_modifier", "something_new"];
    for (const code of codes) {
      const text = issueMessageSv(code);
      assert.match(text, /[a-zåäö]/);
      assert.ok(!/unconfirmed|unavailable|unknown|not allowed/i.test(text), `English leaked for ${code}: ${text}`);
    }
    assert.match(issueMessageSv("price_unconfirmed", "Vegetariana"), /^Vegetariana: priset är inte bekräftat/);
  });
});

describe("pricing store (no React)", () => {
  const realFetch = globalThis.fetch;
  const realWindow = (globalThis as { window?: unknown }).window;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let calls: { items: unknown[] }[] = [];
  let nextTotal = 110;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = {
      addEventListener() {},
      removeEventListener() {},
      localStorage: { getItem: () => null, setItem() {} },
    };
    calls = [];
    nextTotal = 110;
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { items: { quantity: number }[] };
      calls.push(body);
      return new Response(
        JSON.stringify({ lines: body.items.map((i) => priced(nextTotal * i.quantity)), subtotalSek: nextTotal, totalSek: nextTotal, currency: "SEK" }),
        { status: 200 },
      );
    }) as typeof fetch;
    cartStore.clear();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    (globalThis as { window?: unknown }).window = realWindow;
  });

  test("prices the cart on the server, remembers the first price, then flags a later change", async () => {
    cartStore.add({ productSlug: "vesuvio", variantId: "normal", removed: [], modifiers: [], note: "", ifUnavailable: "call" as const, quantity: 1 });
    const stop = cartPricingStore.subscribe(() => {});
    try {
      await sleep(400);
      const first = cartPricingStore.getSnapshot();
      assert.ok(first.status === "ready" && first.totalSek === 110);
      assert.equal(cartStore.getSnapshot()[0].seenTotalSek, 110, "first price is remembered");
      assert.equal(calls.length, 1, "remembering a price must not trigger another request");

      // The menu price changes on the server while the customer keeps the same cart.
      nextTotal = 125;
      refreshCartPricing();
      await sleep(100);
      const second = cartPricingStore.getSnapshot();
      assert.ok(second.status === "ready" && second.totalSek === 125);
      assert.deepEqual(priceChanges(cartStore.getSnapshot(), second.lines).map((c) => [c.from, c.to]), [[110, 125]], "the change is flagged");

      // The customer approves the new total: no more warning.
      cartStore.setSeen({ [cartStore.getSnapshot()[0].key]: 125 });
      assert.deepEqual(priceChanges(cartStore.getSnapshot(), second.lines), []);
    } finally {
      stop();
    }
  });

  test("re-prices when the cart changes, and only once per burst of changes", async () => {
    cartStore.add({ productSlug: "vesuvio", variantId: "normal", removed: [], modifiers: [], note: "", ifUnavailable: "call" as const, quantity: 1 });
    const stop = cartPricingStore.subscribe(() => {});
    try {
      await sleep(400);
      const before = calls.length;
      cartStore.add({ productSlug: "hawaii", variantId: "normal", removed: [], modifiers: [], note: "", ifUnavailable: "call" as const, quantity: 1 });
      cartStore.add({ productSlug: "disco", variantId: "normal", removed: [], modifiers: [], note: "", ifUnavailable: "call" as const, quantity: 1 });
      await sleep(450);
      assert.equal(calls.length, before + 1);
      assert.equal(calls.at(-1)?.items.length, 3);
    } finally {
      stop();
    }
  });

  test("an empty cart makes no request", async () => {
    const stop = cartPricingStore.subscribe(() => {});
    try {
      await sleep(350);
      assert.equal(calls.length, 0);
      assert.equal(cartPricingStore.getSnapshot().status, "idle");
    } finally {
      stop();
    }
  });
});
