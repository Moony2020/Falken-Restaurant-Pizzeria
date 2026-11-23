import assert from "node:assert/strict";
import test from "node:test";
import { productEditFingerprint, productEditSchema } from "../src/server/admin-product-editing.ts";

const validEdit = {
  expectedRevision: 4,
  nameSv: "Vesuvio",
  descriptionSv: "Skinka och ost",
  image: "/images/vesuvio.jpg",
  active: true,
  sortOrder: 10,
  variants: [{ id: "normal", label: "Normal", priceSek: 110, available: true, priceStatus: "confirmed" as const }],
};

test("product edit fingerprint is stable for the same validated request", () => {
  const edit = productEditSchema.parse(validEdit);
  assert.equal(productEditFingerprint("vesuvio", edit), productEditFingerprint("vesuvio", edit));
});

test("product edit fingerprint changes when the save payload changes", () => {
  const first = productEditSchema.parse(validEdit);
  const second = productEditSchema.parse({ ...validEdit, variants: [{ ...validEdit.variants[0], priceSek: 120 }] });
  assert.notEqual(productEditFingerprint("vesuvio", first), productEditFingerprint("vesuvio", second));
});

test("sellable product variants reject zero, fractional, and negative prices", () => {
  for (const priceSek of [0, -1, 99.5]) {
    const parsed = productEditSchema.safeParse({ ...validEdit, variants: [{ ...validEdit.variants[0], priceSek }] });
    assert.equal(parsed.success, false);
  }
});

test("ingredients: omitted field is valid and preserves undefined", () => {
  const parsed = productEditSchema.safeParse(validEdit);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.ingredients, undefined);
  }
});

test("ingredients: valid non-empty array parses and trims values", () => {
  const parsed = productEditSchema.safeParse({
    ...validEdit,
    ingredients: ["  Tomatsås  ", "Ost", "Skinka"],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.ingredients, ["Tomatsås", "Ost", "Skinka"]);
  }
});

test("ingredients: empty array is valid (explicit intentional clearing)", () => {
  const parsed = productEditSchema.safeParse({
    ...validEdit,
    ingredients: [],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.ingredients, []);
  }
});

test("ingredients: rejects empty string or whitespace-only ingredients", () => {
  for (const emptyVal of ["", "   ", "\t"]) {
    const parsed = productEditSchema.safeParse({
      ...validEdit,
      ingredients: ["Ost", emptyVal],
    });
    assert.equal(parsed.success, false);
  }
});

test("ingredients: rejects ingredients longer than 60 characters", () => {
  const tooLong = "a".repeat(61);
  const parsed = productEditSchema.safeParse({
    ...validEdit,
    ingredients: ["Ost", tooLong],
  });
  assert.equal(parsed.success, false);
});

test("ingredients: accepts up to 30 ingredients, rejects 31", () => {
  const exactly30 = Array.from({ length: 30 }, (_, i) => `Ingrediens ${i + 1}`);
  const okParsed = productEditSchema.safeParse({ ...validEdit, ingredients: exactly30 });
  assert.equal(okParsed.success, true);

  const tooMany31 = Array.from({ length: 31 }, (_, i) => `Ingrediens ${i + 1}`);
  const failParsed = productEditSchema.safeParse({ ...validEdit, ingredients: tooMany31 });
  assert.equal(failParsed.success, false);
});

test("ingredients: rejects duplicate ingredients regardless of case or whitespace", () => {
  const duplicates = [
    ["Ost", "ost"],
    ["Skinka", " Skinka "],
    ["Champinjoner", "CHAMPINJONER"],
  ];
  for (const dup of duplicates) {
    const parsed = productEditSchema.safeParse({
      ...validEdit,
      ingredients: dup,
    });
    assert.equal(parsed.success, false);
  }
});

test("ingredients: fingerprint changes when ingredients change", () => {
  const base = productEditSchema.parse({ ...validEdit, ingredients: ["Ost", "Tomatsås"] });
  const modified = productEditSchema.parse({ ...validEdit, ingredients: ["Ost", "Tomatsås", "Skinka"] });
  const omitted = productEditSchema.parse(validEdit);

  assert.notEqual(productEditFingerprint("vesuvio", base), productEditFingerprint("vesuvio", modified));
  assert.notEqual(productEditFingerprint("vesuvio", base), productEditFingerprint("vesuvio", omitted));
});
