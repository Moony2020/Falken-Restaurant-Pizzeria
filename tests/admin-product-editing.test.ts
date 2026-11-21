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
