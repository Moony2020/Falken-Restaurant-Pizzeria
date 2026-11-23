import assert from "node:assert/strict";
import test from "node:test";
import {
  modifierEditFingerprint,
  modifierEditSchema,
} from "../src/server/admin-modifier-editing.ts";

const validEdit = {
  expectedRevision: 1,
  labelSv: "Extra Ost",
  maxQty: 3,
  compatibleCategories: ["pizza", "kebabpizza"],
  priceByVariantSek: {
    normal: 20,
    familj: 35,
  },
  priceStatus: "confirmed" as const,
  active: true,
};

test("modifier edit fingerprint is deterministic regardless of key insertion order", () => {
  const edit1 = modifierEditSchema.parse(validEdit);
  const edit2 = modifierEditSchema.parse({
    ...validEdit,
    priceByVariantSek: {
      familj: 35,
      normal: 20,
    },
    compatibleCategories: ["kebabpizza", "pizza"],
  });

  assert.equal(
    modifierEditFingerprint("extra-ost", edit1),
    modifierEditFingerprint("extra-ost", edit2),
  );
});

test("modifier edit fingerprint changes when any property changes", () => {
  const base = modifierEditSchema.parse(validEdit);

  const changedLabel = modifierEditSchema.parse({ ...validEdit, labelSv: "Extra Mozzarella" });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedLabel));

  const changedPrice = modifierEditSchema.parse({
    ...validEdit,
    priceByVariantSek: { normal: 25, familj: 35 },
  });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedPrice));

  const changedMaxQty = modifierEditSchema.parse({ ...validEdit, maxQty: 5 });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedMaxQty));

  const changedCategories = modifierEditSchema.parse({
    ...validEdit,
    compatibleCategories: ["pizza"],
  });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedCategories));

  const changedStatus = modifierEditSchema.parse({ ...validEdit, priceStatus: "needs_review" });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedStatus));

  const changedActive = modifierEditSchema.parse({ ...validEdit, active: false });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedActive));

  const changedRevision = modifierEditSchema.parse({ ...validEdit, expectedRevision: 2 });
  assert.notEqual(modifierEditFingerprint("extra-ost", base), modifierEditFingerprint("extra-ost", changedRevision));
});

test("modifier price validation enforces strict integer rules between 1 and 500 SEK", () => {
  // Boundary 1 SEK is valid
  const minBoundary = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: 1 },
  });
  assert.equal(minBoundary.success, true);

  // Boundary 500 SEK is valid
  const maxBoundary = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: 500 },
  });
  assert.equal(maxBoundary.success, true);

  // 0 SEK (Free modifier) is strictly rejected
  const zeroPrice = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: 0 },
  });
  assert.equal(zeroPrice.success, false);

  // Negative price is strictly rejected
  const negativePrice = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: -15 },
  });
  assert.equal(negativePrice.success, false);

  // Fractional price (decimals/ören) is strictly rejected
  const fractionalPrice = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: 15.5 },
  });
  assert.equal(fractionalPrice.success, false);

  // Price above 500 SEK is strictly rejected
  const excessivePrice = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: 501 },
  });
  assert.equal(excessivePrice.success, false);

  // Non-numeric price is strictly rejected
  const nonNumericPrice = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: { normal: "20" as unknown as number },
  });
  assert.equal(nonNumericPrice.success, false);

  // Empty variant price map is rejected
  const emptyVariants = modifierEditSchema.safeParse({
    ...validEdit,
    priceByVariantSek: {},
  });
  assert.equal(emptyVariants.success, false);
});

test("modifier schema enforces maxQty bounds (1 to 10)", () => {
  // maxQty = 1 is allowed
  assert.equal(modifierEditSchema.safeParse({ ...validEdit, maxQty: 1 }).success, true);

  // maxQty = 10 is allowed
  assert.equal(modifierEditSchema.safeParse({ ...validEdit, maxQty: 10 }).success, true);

  // maxQty = 0 rejected
  assert.equal(modifierEditSchema.safeParse({ ...validEdit, maxQty: 0 }).success, false);

  // maxQty = 11 rejected
  assert.equal(modifierEditSchema.safeParse({ ...validEdit, maxQty: 11 }).success, false);

  // maxQty fractional rejected
  assert.equal(modifierEditSchema.safeParse({ ...validEdit, maxQty: 2.5 }).success, false);
});

test("modifier schema rejects unauthorized or immutable fields", () => {
  // Attempt to alter immutable slug
  const withSlug = modifierEditSchema.safeParse({ ...validEdit, slug: "hacked-slug" });
  assert.equal(withSlug.success, false);

  // Attempt to alter groupSlug
  const withGroup = modifierEditSchema.safeParse({ ...validEdit, groupSlug: "new-group" });
  assert.equal(withGroup.success, false);

  // Attempt to inject _id or unknown property
  const withId = modifierEditSchema.safeParse({ ...validEdit, _id: "654321" });
  assert.equal(withId.success, false);

  const withUnknown = modifierEditSchema.safeParse({ ...validEdit, extraHacks: true });
  assert.equal(withUnknown.success, false);
});
