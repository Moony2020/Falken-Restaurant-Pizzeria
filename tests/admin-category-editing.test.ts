import assert from "node:assert/strict";
import test from "node:test";
import { categoryEditFingerprint, categoryEditSchema } from "../src/server/admin-category-editing.ts";

const validEdit = {
  expectedRevision: 1,
  nameSv: "Pizza",
  blurbSv: "Klassiska och moderna pizzor bakade med omsorg",
  sortOrder: 1,
  removable: true,
  active: true,
};

test("category edit fingerprint is stable for the same validated request", () => {
  const edit = categoryEditSchema.parse(validEdit);
  assert.equal(
    categoryEditFingerprint("pizza", edit),
    categoryEditFingerprint("pizza", edit),
  );
});

test("category edit fingerprint changes when any save payload property changes", () => {
  const base = categoryEditSchema.parse(validEdit);

  const changedName = categoryEditSchema.parse({ ...validEdit, nameSv: "Special Pizza" });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedName));

  const changedBlurb = categoryEditSchema.parse({ ...validEdit, blurbSv: "Annan beskrivning" });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedBlurb));

  const changedSort = categoryEditSchema.parse({ ...validEdit, sortOrder: 99 });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedSort));

  const changedRemovable = categoryEditSchema.parse({ ...validEdit, removable: false });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedRemovable));

  const changedActive = categoryEditSchema.parse({ ...validEdit, active: false });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedActive));

  const changedRevision = categoryEditSchema.parse({ ...validEdit, expectedRevision: 2 });
  assert.notEqual(categoryEditFingerprint("pizza", base), categoryEditFingerprint("pizza", changedRevision));
});

test("category schema validation rejects invalid inputs and unauthorized fields", () => {
  // Empty nameSv
  const emptyName = categoryEditSchema.safeParse({ ...validEdit, nameSv: "   " });
  assert.equal(emptyName.success, false);

  // nameSv too long (> 100)
  const longName = categoryEditSchema.safeParse({ ...validEdit, nameSv: "a".repeat(101) });
  assert.equal(longName.success, false);

  // blurbSv too long (> 300)
  const longBlurb = categoryEditSchema.safeParse({ ...validEdit, blurbSv: "a".repeat(301) });
  assert.equal(longBlurb.success, false);

  // Negative revision
  const negativeRev = categoryEditSchema.safeParse({ ...validEdit, expectedRevision: -1 });
  assert.equal(negativeRev.success, false);

  // Strict schema: rejects attempt to alter slug or _id
  const withSlug = categoryEditSchema.safeParse({ ...validEdit, slug: "new-slug" });
  assert.equal(withSlug.success, false);

  const withId = categoryEditSchema.safeParse({ ...validEdit, _id: "new-id" });
  assert.equal(withId.success, false);

  const withUnknown = categoryEditSchema.safeParse({ ...validEdit, customHack: true });
  assert.equal(withUnknown.success, false);
});
