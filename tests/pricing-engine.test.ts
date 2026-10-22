import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cartSchema, orderRequestSchema } from "../src/server/cart-schema.ts";
import { priceCart, sanitizeNote, type Catalog, type CatalogProduct } from "../src/server/pricing-engine.ts";

// Pure tests: an in-memory catalog, no database.

const ok = (id: string, label: string, priceSek: number) => ({ id, label, priceSek, available: true, priceStatus: "confirmed" });

const vesuvio: CatalogProduct = {
  slug: "vesuvio",
  nameSv: "Vesuvio",
  categorySlug: "pizza",
  ingredients: ["Tomatsås", "Ost", "Skinka"],
  variants: [ok("normal", "Normal", 110), ok("familj", "Familj", 265)],
  modifierSlugs: ["extra-ost"],
  glutenFreeOption: true,
  active: true,
};
const tallrik: CatalogProduct = {
  slug: "kebabtallrik",
  nameSv: "Kebabtallrik",
  categorySlug: "kebab",
  ingredients: ["Kebabkött", "Lök"],
  variants: [ok("standard", "Standard", 125)],
  modifierSlugs: [],
  glutenFreeOption: false,
  active: true,
};
const burger: CatalogProduct = {
  slug: "burger",
  nameSv: "Hamburgare",
  categorySlug: "hamburgare",
  ingredients: [],
  variants: [ok("standard", "Standard", 90)],
  modifierSlugs: [],
  glutenFreeOption: false,
  active: true,
};

function catalog(over: Partial<Catalog> = {}): Catalog {
  return {
    products: new Map([vesuvio, tallrik, burger].map((p) => [p.slug, p])),
    categories: new Map([
      ["pizza", { slug: "pizza", removable: true, active: true }],
      ["kebab", { slug: "kebab", removable: true, active: true }],
      ["hamburgare", { slug: "hamburgare", removable: false, active: true }],
    ]),
    modifiers: new Map([
      [
        "glutenfri-deg",
        { slug: "glutenfri-deg", labelSv: "Glutenfri pizzadeg", priceByVariantSek: { normal: 30, familj: 30 }, maxQty: 1, compatibleCategories: ["pizza", "kebabpizza"], active: true, priceStatus: "confirmed" },
      ],
      [
        // An owner-defined extra, used only to exercise the engine. Not real menu data.
        "extra-ost",
        { slug: "extra-ost", labelSv: "Extra ost", priceByVariantSek: { normal: 20, familj: 35 }, maxQty: 2, compatibleCategories: ["pizza"], active: true, priceStatus: "confirmed" },
      ],
    ]),
    ...over,
  };
}

const item = (over: object = {}) => ({
  productSlug: "vesuvio",
  variantId: "normal",
  quantity: 1,
  removedIngredients: [],
  modifiers: [],
  note: "",
  ...over,
});
const cart = (...items: object[]) => cartSchema.parse({ items });
const price = (c: ReturnType<typeof cart>, cat = catalog()) => priceCart(c, cat);
const issues = (r: ReturnType<typeof price>) => (r.ok ? [] : r.issues.map((i) => i.code));

describe("sizes and totals", () => {
  test("Normal and Familj use their own catalog prices", () => {
    const r = price(cart(item(), item({ variantId: "familj" })));
    assert.ok(r.ok);
    assert.deepEqual(r.lines.map((l) => l.lineTotalSek), [110, 265]);
    assert.equal(r.totalSek, 375);
  });

  test("quantity multiplies the line", () => {
    const r = price(cart(item({ quantity: 3 })));
    assert.ok(r.ok && r.totalSek === 330);
  });

  test("paid extras are priced per size and per unit", () => {
    const normal = price(cart(item({ modifiers: [{ slug: "extra-ost", quantity: 2 }] })));
    assert.ok(normal.ok && normal.totalSek === 110 + 40);
    const familj = price(cart(item({ variantId: "familj", quantity: 2, modifiers: [{ slug: "extra-ost", quantity: 1 }] })));
    assert.ok(familj.ok && familj.totalSek === (265 + 35) * 2);
  });

  test("gluten-free adds 30 kr on a pizza that offers it", () => {
    const r = price(cart(item({ modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] })));
    assert.ok(r.ok && r.totalSek === 140);
    assert.deepEqual(r.lines[0].modifiersSnapshot, [{ modifierSlug: "glutenfri-deg", labelSv: "Glutenfri pizzadeg", priceSek: 30, quantity: 1 }]);
  });

  test("the snapshot carries names and prices from the catalog", () => {
    const r = price(cart(item({ variantId: "familj" })));
    assert.ok(r.ok);
    assert.equal(r.lines[0].productNameSnapshot, "Vesuvio");
    assert.equal(r.lines[0].variantNameSnapshot, "Familj");
    assert.equal(r.lines[0].basePriceSek, 265);
  });
});

describe("ingredient removal", () => {
  test("removal is free and recorded with the catalog's spelling", () => {
    const r = price(cart(item({ removedIngredients: ["skinka", "SKINKA"] })));
    assert.ok(r.ok);
    assert.deepEqual(r.lines[0].removedIngredients, ["Skinka"]);
    assert.equal(r.totalSek, 110);
  });

  test("unknown ingredient is refused", () => {
    assert.deepEqual(issues(price(cart(item({ removedIngredients: ["Ananas"] })))), ["unknown_ingredient"]);
  });

  test("categories that don't allow removal refuse it", () => {
    assert.deepEqual(issues(price(cart(item({ productSlug: "burger", variantId: "standard", removedIngredients: ["Sallad"] })))), ["removal_not_allowed"]);
  });
});

describe("things that must never be sold", () => {
  test("a needs_review size is refused, its confirmed sibling is not", () => {
    const flagged: CatalogProduct = { ...vesuvio, variants: [{ ...vesuvio.variants[0], priceStatus: "needs_review" }, vesuvio.variants[1]] };
    const cat = catalog({ products: new Map([[flagged.slug, flagged]]) });
    assert.deepEqual(issues(price(cart(item()), cat)), ["price_unconfirmed"]);
    assert.ok(price(cart(item({ variantId: "familj" })), cat).ok);
  });

  test("an unavailable size, inactive product or inactive category is refused", () => {
    const off: CatalogProduct = { ...vesuvio, variants: [{ ...vesuvio.variants[0], available: false }, vesuvio.variants[1]] };
    assert.deepEqual(issues(price(cart(item()), catalog({ products: new Map([[off.slug, off]]) }))), ["variant_unavailable"]);
    const inactive = { ...vesuvio, active: false };
    assert.deepEqual(issues(price(cart(item()), catalog({ products: new Map([[inactive.slug, inactive]]) }))), ["product_unavailable"]);
    const cat = catalog();
    cat.categories.set("pizza", { slug: "pizza", removable: true, active: false });
    assert.deepEqual(issues(price(cart(item()), cat)), ["product_unavailable"]);
  });

  test("unknown product or size is refused", () => {
    assert.deepEqual(issues(price(cart(item({ productSlug: "pizza-som-inte-finns" })))), ["unknown_product"]);
    assert.deepEqual(issues(price(cart(item({ variantId: "jumbo" })))), ["unknown_variant"]);
  });

  test("a bad price in the catalog is refused rather than sold", () => {
    const broken: CatalogProduct = { ...vesuvio, variants: [{ ...vesuvio.variants[0], priceSek: 110.5 }] };
    assert.deepEqual(issues(price(cart(item()), catalog({ products: new Map([[broken.slug, broken]]) }))), ["price_unconfirmed"]);
  });
});

describe("modifier rules", () => {
  test("gluten-free is refused for a product without the option", () => {
    assert.deepEqual(issues(price(cart(item({ productSlug: "kebabtallrik", variantId: "standard", modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] })))), ["modifier_not_allowed"]);
  });

  test("an extra the product doesn't list is refused even if it exists", () => {
    assert.deepEqual(issues(price(cart(item({ productSlug: "kebabtallrik", variantId: "standard", modifiers: [{ slug: "extra-ost", quantity: 1 }] })))), ["modifier_not_allowed"]);
  });

  test("unknown, inactive, over-quantity, duplicate and unpriced modifiers are refused", () => {
    assert.deepEqual(issues(price(cart(item({ modifiers: [{ slug: "extra-skinka", quantity: 1 }] })))), ["unknown_modifier"]);
    assert.deepEqual(issues(price(cart(item({ modifiers: [{ slug: "extra-ost", quantity: 3 }] })))), ["modifier_quantity"]);
    assert.deepEqual(issues(price(cart(item({ modifiers: [{ slug: "extra-ost", quantity: 1 }, { slug: "extra-ost", quantity: 1 }] })))), ["duplicate_modifier"]);

    const cat = catalog();
    cat.modifiers.set("extra-ost", { ...cat.modifiers.get("extra-ost")!, active: false });
    assert.deepEqual(issues(price(cart(item({ modifiers: [{ slug: "extra-ost", quantity: 1 }] })), cat)), ["modifier_unavailable"]);

    const cat2 = catalog();
    cat2.modifiers.set("extra-ost", { ...cat2.modifiers.get("extra-ost")!, priceStatus: "needs_review" });
    assert.deepEqual(issues(price(cart(item({ modifiers: [{ slug: "extra-ost", quantity: 1 }] })), cat2)), ["modifier_price_unconfirmed"]);

    const cat3 = catalog();
    cat3.modifiers.set("extra-ost", { ...cat3.modifiers.get("extra-ost")!, priceByVariantSek: { normal: 20 } });
    assert.deepEqual(issues(price(cart(item({ variantId: "familj", modifiers: [{ slug: "extra-ost", quantity: 1 }] })), cat3)), ["modifier_price_unconfirmed"]);
  });

  test("one bad line blocks the whole cart and reports its index", () => {
    const r = price(cart(item(), item({ variantId: "jumbo" })));
    assert.equal(r.ok, false);
    assert.deepEqual(!r.ok && r.issues.map((i) => i.index), [1]);
  });
});

describe("tampering is rejected by the schema, not trusted", () => {
  const base = { items: [item()] };

  test("price, total, name and status fields are refused", () => {
    for (const extra of [{ price: 1 }, { totalSek: 1 }, { priceSek: 1 }, { nameSv: "Gratis" }, { status: "PAID" }]) {
      assert.equal(cartSchema.safeParse({ items: [{ ...item(), ...extra }] }).success, false, JSON.stringify(extra));
    }
    assert.equal(cartSchema.safeParse({ ...base, totalSek: 1 }).success, false);
    assert.equal(cartSchema.safeParse({ ...base, discountSek: 100 }).success, false);
  });

  test("bad quantities are refused", () => {
    for (const quantity of [0, -1, 1.5, 21, "2", null, Number.NaN, Infinity]) {
      assert.equal(cartSchema.safeParse({ items: [item({ quantity })] }).success, false, String(quantity));
    }
  });

  test("operator objects and odd identifiers are refused (NoSQL injection)", () => {
    assert.equal(cartSchema.safeParse({ items: [item({ productSlug: { $ne: null } })] }).success, false);
    assert.equal(cartSchema.safeParse({ items: [item({ productSlug: "a$b" })] }).success, false);
    assert.equal(cartSchema.safeParse({ items: [item({ variantId: { $gt: "" } })] }).success, false);
    assert.equal(cartSchema.safeParse({ items: [item({ modifiers: [{ slug: { $ne: 1 }, quantity: 1 }] })] }).success, false);
  });

  test("empty and oversized carts are refused", () => {
    assert.equal(cartSchema.safeParse({ items: [] }).success, false);
    assert.equal(cartSchema.safeParse({ items: Array.from({ length: 31 }, () => item()) }).success, false);
  });

  test("order requests can't carry payment or status fields", () => {
    const req = {
      idempotencyKey: "abcdefghijklmnop",
      items: [item()],
      contact: { name: "Anna", phone: "070-123 45 67" },
      pickupAt: "2026-10-22T11:00:00.000Z",
    };
    assert.equal(orderRequestSchema.safeParse(req).success, true);
    for (const extra of [{ paymentStatus: "paid" }, { fulfillmentStatus: "ACCEPTED" }, { status: "PAID" }, { totalSek: 0 }, { delivery: { address: "x" } }]) {
      assert.equal(orderRequestSchema.safeParse({ ...req, ...extra }).success, false, JSON.stringify(extra));
    }
  });

  test("contact details are validated", () => {
    const base = { idempotencyKey: "abcdefghijklmnop", items: [item()], pickupAt: "2026-10-22T11:00:00.000Z" };
    const withContact = (contact: object) => orderRequestSchema.safeParse({ ...base, contact }).success;
    assert.equal(withContact({ name: "Anna", phone: "070-123 45 67" }), true);
    assert.equal(withContact({ name: "", phone: "070-123 45 67" }), false);
    assert.equal(withContact({ name: "Anna", phone: "abc" }), false);
    assert.equal(withContact({ name: "x".repeat(101), phone: "070-123 45 67" }), false);
  });

  test("short or unsafe idempotency keys are refused", () => {
    const req = { items: [item()], contact: { name: "Anna", phone: "070-123 45 67" }, pickupAt: "2026-10-22T11:00:00.000Z" };
    assert.equal(orderRequestSchema.safeParse({ ...req, idempotencyKey: "short" }).success, false);
    assert.equal(orderRequestSchema.safeParse({ ...req, idempotencyKey: "has spaces and $ symbols!!" }).success, false);
  });
});

test("notes lose control characters and extra whitespace", () => {
  assert.equal(sanitizeNote("  Extra\u0000 krispig\n\n botten\u0007 "), "Extra krispig botten");
});
