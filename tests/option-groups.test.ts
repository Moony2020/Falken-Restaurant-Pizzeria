import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { groupOfModifier, MODIFIER_GROUPS } from "../src/data/modifier-groups.ts";
import { groupsFor, toggleModifier } from "../src/lib/menu-client.ts";
import type { PublicMenu, PublicModifier, PublicProduct } from "../src/lib/menu-types.ts";
import { cartSchema } from "../src/server/cart-schema.ts";
import { priceCart, type Catalog, type CatalogModifier, type CatalogProduct } from "../src/server/pricing-engine.ts";

// ---- browser side: how the customiser builds its groups --------------------------------------------------------

const pizza: PublicProduct = {
  slug: "vesuvio",
  name: "Vesuvio",
  category: "pizza",
  ingredients: ["Tomatsås", "Ost", "Skinka"],
  variants: [{ id: "normal", label: "Normal", priceSek: 110, orderable: true }],
  glutenFreeOption: true,
  featured: false,
  modifierSlugs: [],
};
const plate: PublicProduct = { ...pizza, slug: "kebabtallrik", category: "kebab", glutenFreeOption: false };
const mod = (slug: string, group: string | undefined, cats = ["pizza"], price = 20): PublicModifier =>
  ({ slug, label: slug, group, priceByVariantSek: { normal: price }, maxQty: 1, compatibleCategories: cats }) as PublicModifier;

const menu: PublicMenu = {
  categories: [],
  products: [pizza, plate],
  modifiers: [mod("glutenfri-deg", "glutenfri", ["pizza"], 30), mod("extra-ost", "extra"), mod("bacon", "extra"), mod("vitlokssas", "saser", ["pizza", "kebab"], 10)],
};

describe("option groups in the customiser", () => {
  test("groups come in display order and empty groups are left out", () => {
    assert.deepEqual(groupsFor(pizza, menu).map((g) => g.def.slug), ["glutenfri", "extra", "saser"]);
    assert.deepEqual(groupsFor(plate, menu).map((g) => g.def.slug), ["saser"]);
    assert.deepEqual(groupsFor(pizza, { ...menu, modifiers: [] }), []); // nothing priced by the owner, so no groups
  });

  test("each extra sits in its own group", () => {
    assert.deepEqual(groupsFor(pizza, menu).find((g) => g.def.slug === "extra")?.items.map((m) => m.slug), ["extra-ost", "bacon"]);
  });

  test("a modifier with no group falls back to the gluten group or to extras", () => {
    assert.equal(groupOfModifier("glutenfri-deg"), "glutenfri");
    assert.equal(groupOfModifier("extra-skinka"), "extra");
    assert.equal(groupOfModifier("extra-skinka", "saser"), "saser");
    const legacy: PublicMenu = { ...menu, modifiers: [mod("glutenfri-deg", undefined, ["pizza"], 30), mod("extra-skinka", undefined)] };
    assert.deepEqual(groupsFor(pizza, legacy).map((g) => g.def.slug), ["glutenfri", "extra"]);
  });

  test("a single-choice group swaps its previous choice and a second tap clears it", () => {
    const view = groupsFor(pizza, menu)[0];
    assert.deepEqual(toggleModifier([], "glutenfri-deg", view), ["glutenfri-deg"]);
    assert.deepEqual(toggleModifier(["glutenfri-deg"], "glutenfri-deg", view), []);
  });

  test("a multi-choice group stops at its limit and leaves other groups alone", () => {
    const base = groupsFor(pizza, menu)[1];
    const view = { ...base, def: { ...base.def, max: 1 } };
    assert.deepEqual(toggleModifier(["glutenfri-deg"], "extra-ost", view), ["glutenfri-deg", "extra-ost"]);
    assert.deepEqual(toggleModifier(["extra-ost"], "bacon", view), ["extra-ost"]); // full: refused
    assert.deepEqual(toggleModifier(["extra-ost"], "extra-ost", view), []);
  });

  test("the configured limits match the design: gluten 1, extras 10, vegetables 10, sauces 5", () => {
    assert.deepEqual(MODIFIER_GROUPS.map((g) => [g.slug, g.kind, g.max]), [
      ["glutenfri", "single", 1],
      ["extra", "multi", 10],
      ["gronsaker", "multi", 10],
      ["saser", "multi", 5],
    ]);
  });
});

// ---- server side: the same limits, enforced where they count ---------------------------------------------------

const ok = (id: string, label: string, priceSek: number) => ({ id, label, priceSek, available: true, priceStatus: "confirmed" });
const dbPizza: CatalogProduct = {
  slug: "vesuvio",
  nameSv: "Vesuvio",
  categorySlug: "pizza",
  ingredients: ["Tomatsås", "Ost", "Skinka"],
  variants: [ok("normal", "Normal", 110)],
  modifierSlugs: [],
  glutenFreeOption: true,
  active: true,
};
const dbMod = (slug: string, over: Partial<CatalogModifier> = {}): CatalogModifier => ({
  slug,
  labelSv: slug,
  priceByVariantSek: { normal: 20 },
  maxQty: 1,
  compatibleCategories: ["pizza"],
  active: true,
  priceStatus: "confirmed",
  ...over,
});
const catalogWith = (mods: CatalogModifier[]): Catalog => ({
  products: new Map([[dbPizza.slug, dbPizza]]),
  categories: new Map([["pizza", { slug: "pizza", removable: true, active: true }]]),
  modifiers: new Map(mods.map((m) => [m.slug, m])),
});
const item = (over: object = {}) => ({ productSlug: "vesuvio", variantId: "normal", quantity: 1, removedIngredients: [], modifiers: [], note: "", ...over });
const run = (cat: Catalog, over: object = {}) => priceCart(cartSchema.parse({ items: [item(over)] }), cat);
const codes = (r: ReturnType<typeof run>) => (r.ok ? [] : r.issues.map((i) => i.code));

describe("group and kitchen-instruction rules on the server", () => {
  test("extras from the extras group add up", () => {
    const r = run(catalogWith([dbMod("bacon"), dbMod("skinka")]), { modifiers: [{ slug: "bacon", quantity: 1 }, { slug: "skinka", quantity: 1 }] });
    assert.ok(r.ok && r.totalSek === 150);
  });

  test("an extra works on every dish of its category, with no per-dish list needed", () => {
    assert.ok(run(catalogWith([dbMod("bacon")]), { modifiers: [{ slug: "bacon", quantity: 1 }] }).ok);
  });

  test("at most 10 extras in total: the request shape caps the list, the group limit caps the quantities", () => {
    const slugs = Array.from({ length: 11 }, (_, i) => `x${i}`);
    const cat = catalogWith(slugs.map((s) => dbMod(s)));
    assert.ok(run(cat, { modifiers: slugs.slice(0, 10).map((slug) => ({ slug, quantity: 1 })) }).ok);
    assert.equal(cartSchema.safeParse({ items: [item({ modifiers: slugs.map((slug) => ({ slug, quantity: 1 })) })] }).success, false);
  });

  test("a quantity above 1 counts towards the group limit", () => {
    const cat = catalogWith([dbMod("ost", { maxQty: 10 }), dbMod("bacon")]);
    assert.ok(run(cat, { modifiers: [{ slug: "ost", quantity: 10 }] }).ok);
    assert.deepEqual(codes(run(cat, { modifiers: [{ slug: "ost", quantity: 10 }, { slug: "bacon", quantity: 1 }] })), ["group_limit"]);
  });

  test("two choices from the single-choice gluten group are refused", () => {
    const cat = catalogWith([dbMod("glutenfri-deg", { priceByVariantSek: { normal: 30 } }), dbMod("glutenfri-botten", { groupSlug: "glutenfri" })]);
    assert.ok(run(cat, { modifiers: [{ slug: "glutenfri-deg", quantity: 1 }] }).ok);
    assert.deepEqual(codes(run(cat, { modifiers: [{ slug: "glutenfri-deg", quantity: 1 }, { slug: "glutenfri-botten", quantity: 1 }] })), ["group_limit"]);
  });

  test("an extra from a category it wasn't assigned to is still refused", () => {
    assert.deepEqual(codes(run(catalogWith([dbMod("pommes", { compatibleCategories: ["kebab"] })]), { modifiers: [{ slug: "pommes", quantity: 1 }] })), ["modifier_not_allowed"]);
  });

  test("the 'if unavailable' choice reaches the order, defaults to 'call' and never changes the price", () => {
    const cat = catalogWith([]);
    const a = run(cat, { ifUnavailable: "cancel_order" });
    const b = run(cat);
    assert.ok(a.ok && b.ok && a.totalSek === b.totalSek);
    assert.equal(a.ok && a.lines[0].ifUnavailable, "cancel_order");
    assert.equal(b.ok && b.lines[0].ifUnavailable, "call");
  });

  test("an unknown 'if unavailable' value is rejected", () => {
    assert.equal(cartSchema.safeParse({ items: [item({ ifUnavailable: "ignore" })] }).success, false);
  });
});
