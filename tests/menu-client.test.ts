import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { firstOrderableVariant, isOrderable, loadMenu, modifierPrice, modifiersFor, previewUnitPrice } from "../src/lib/menu-client.ts";
import type { PublicMenu, PublicProduct } from "../src/lib/menu-types.ts";

const vesuvio: PublicProduct = {
  slug: "vesuvio",
  name: "Vesuvio",
  category: "pizza",
  ingredients: ["Tomatsås", "Ost", "Skinka"],
  variants: [
    { id: "normal", label: "Normal", priceSek: 110, orderable: true },
    { id: "familj", label: "Familj", priceSek: 265, orderable: true },
  ],
  glutenFreeOption: true,
  featured: false,
  modifierSlugs: [],
};
const vegetariana: PublicProduct = {
  ...vesuvio,
  slug: "vegetariana",
  name: "Vegetariana",
  variants: [
    { id: "normal", label: "Normal", priceSek: 130, orderable: false },
    { id: "familj", label: "Familj", priceSek: 285, orderable: true },
  ],
};
const tallrik: PublicProduct = {
  ...vesuvio,
  slug: "kebabtallrik",
  category: "kebab",
  variants: [{ id: "standard", label: "Standard", priceSek: 125, orderable: true }],
  glutenFreeOption: false,
};
const flagged: PublicProduct = { ...tallrik, slug: "falafel", variants: [{ id: "standard", label: "Standard", priceSek: 125, orderable: false }] };

const menu: PublicMenu = {
  categories: [{ slug: "pizza", name: "Pizza", blurb: "", removable: true }],
  products: [vesuvio, vegetariana, tallrik, flagged],
  modifiers: [
    { slug: "glutenfri-deg", label: "Glutenfri pizzadeg", group: "glutenfri", priceByVariantSek: { normal: 30, familj: 30 }, maxQty: 1, compatibleCategories: ["pizza", "kebabpizza"] },
    // An owner-defined extra priced only for Normal: used to test size-specific availability.
    { slug: "extra-ost", label: "Extra ost", group: "extra", priceByVariantSek: { normal: 20 }, maxQty: 2, compatibleCategories: ["pizza"] },
    { slug: "bacon", label: "Bacon", group: "extra", priceByVariantSek: { normal: 20, familj: 25 }, maxQty: 1, compatibleCategories: ["pizza"] },
    { slug: "vitlokssas", label: "Vitlökssås", group: "saser", priceByVariantSek: { normal: 10, familj: 10 }, maxQty: 1, compatibleCategories: ["pizza", "kebab"] },
  ],
};

const respond = (status: number, body: unknown) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("loading the menu from the API", () => {
  test("returns the menu on success", async () => {
    const r = await loadMenu(respond(200, menu));
    assert.ok(r.ok && r.menu.products.length === 4);
  });

  test("a network failure is reported, with no fallback menu", async () => {
    const r = await loadMenu((async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    assert.deepEqual(r, { ok: false, reason: "network" });
  });

  test("a server error (503, 500) is reported, with no fallback menu", async () => {
    for (const status of [503, 500]) {
      assert.deepEqual(await loadMenu(respond(status, { error: "service_unavailable" })), { ok: false, reason: "server" });
    }
  });

  test("unreadable or wrongly shaped answers are rejected", async () => {
    assert.deepEqual(await loadMenu(respond(200, "<html>oops")), { ok: false, reason: "invalid" });
    assert.deepEqual(await loadMenu(respond(200, { categories: [] })), { ok: false, reason: "invalid" });
    assert.deepEqual(await loadMenu(respond(200, "null")), { ok: false, reason: "invalid" });
  });
});

describe("orderable sizes", () => {
  test("a product is orderable if any size is", () => {
    assert.equal(isOrderable(vesuvio), true);
    assert.equal(isOrderable(vegetariana), true);
    assert.equal(isOrderable(flagged), false);
  });

  test("the customiser starts on the first orderable size, skipping an unconfirmed one", () => {
    assert.equal(firstOrderableVariant(vegetariana)?.id, "familj");
    assert.equal(firstOrderableVariant(flagged), undefined);
  });

  test("an unconfirmed size has no price preview and can't be priced", () => {
    assert.equal(previewUnitPrice(vegetariana, "normal", [], menu), null);
    assert.equal(previewUnitPrice(vegetariana, "familj", [], menu), 285);
    assert.equal(previewUnitPrice(vesuvio, "jumbo", [], menu), null);
  });
});

describe("pizza customisation", () => {
  test("gluten-free is offered only for products that support it", () => {
    assert.ok(modifiersFor(vesuvio, menu).some((m) => m.slug === "glutenfri-deg"));
    assert.ok(!modifiersFor({ ...vesuvio, glutenFreeOption: false }, menu).some((m) => m.slug === "glutenfri-deg"));
    assert.deepEqual(modifiersFor(tallrik, menu).map((m) => m.slug), ["vitlokssas"]); // only what its category allows
  });

  test("extras follow the category the owner assigned them to", () => {
    assert.ok(modifiersFor(vesuvio, menu).some((m) => m.slug === "extra-ost"));
    assert.ok(!modifiersFor(tallrik, menu).some((m) => m.slug === "extra-ost"));
  });

  test("Normal + gluten-free = 140, Familj + gluten-free = 295", () => {
    const gf = [{ slug: "glutenfri-deg", quantity: 1 }];
    assert.equal(previewUnitPrice(vesuvio, "normal", gf, menu), 140);
    assert.equal(previewUnitPrice(vesuvio, "familj", gf, menu), 295);
  });

  test("an extra without a price for the chosen size can't be previewed", () => {
    const extra = menu.modifiers[1];
    assert.equal(modifierPrice(extra, "normal"), 20);
    assert.equal(modifierPrice(extra, "familj"), undefined);
    assert.equal(previewUnitPrice(vesuvio, "familj", [{ slug: "extra-ost", quantity: 1 }], menu), null);
    assert.equal(previewUnitPrice(vesuvio, "normal", [{ slug: "extra-ost", quantity: 2 }], menu), 150);
  });

  test("an extra missing from the menu (inactive or unconfirmed on the server) can't be previewed", () => {
    assert.equal(previewUnitPrice(vesuvio, "normal", [{ slug: "extra-skinka", quantity: 1 }], menu), null);
  });
});
