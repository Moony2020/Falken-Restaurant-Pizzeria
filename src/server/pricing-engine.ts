import type { CartInput } from "./cart-schema.ts";
import { GLUTEN_FREE_SLUG } from "./models/constants.ts";
import type { OrderDoc } from "./models/order.ts";

// Server-side pricing. The browser only says WHAT it wants (slugs, sizes, counts);
// every price, name and total below comes from the catalog, never from the request.

export type CatalogVariant = { id: string; label: string; priceSek: number; available: boolean; priceStatus: string };

export type CatalogProduct = {
  slug: string;
  nameSv: string;
  categorySlug: string;
  ingredients: string[];
  variants: CatalogVariant[];
  modifierSlugs: string[];
  glutenFreeOption: boolean;
  active: boolean;
};

export type CatalogCategory = { slug: string; removable: boolean; active: boolean };

export type CatalogModifier = {
  slug: string;
  labelSv: string;
  priceByVariantSek: Record<string, number>;
  maxQty: number;
  compatibleCategories: string[];
  active: boolean;
  priceStatus: string;
};

export type Catalog = {
  products: Map<string, CatalogProduct>;
  categories: Map<string, CatalogCategory>;
  modifiers: Map<string, CatalogModifier>;
};

export type IssueCode =
  | "unknown_product"
  | "product_unavailable"
  | "unknown_variant"
  | "variant_unavailable"
  | "price_unconfirmed"
  | "removal_not_allowed"
  | "unknown_ingredient"
  | "unknown_modifier"
  | "modifier_unavailable"
  | "modifier_not_allowed"
  | "modifier_price_unconfirmed"
  | "modifier_quantity"
  | "duplicate_modifier";

export type PricingIssue = { index: number; code: IssueCode; message: string };
export type PricedLine = OrderDoc["items"][number];

export type PricingResult =
  | { ok: true; lines: PricedLine[]; subtotalSek: number; totalSek: number }
  | { ok: false; issues: PricingIssue[] };

/** Customer notes go to the kitchen printer: drop control characters, keep readable text. */
export function sanitizeNote(note: string): string {
  return note.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
}

const isWholeSek = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

export function priceCart(cart: CartInput, catalog: Catalog): PricingResult {
  const issues: PricingIssue[] = [];
  const lines: PricedLine[] = [];

  cart.items.forEach((item, index) => {
    const issue = (code: IssueCode, message: string) => issues.push({ index, code, message });

    const product = catalog.products.get(item.productSlug);
    if (!product) return issue("unknown_product", `Unknown product "${item.productSlug}"`);
    const category = catalog.categories.get(product.categorySlug);
    if (!product.active || !category?.active) {
      return issue("product_unavailable", `${product.nameSv} is not available`);
    }

    const variant = product.variants.find((v) => v.id === item.variantId);
    if (!variant) return issue("unknown_variant", `${product.nameSv} has no size "${item.variantId}"`);
    if (!variant.available) return issue("variant_unavailable", `${product.nameSv} (${variant.label}) is not available`);
    // Unconfirmed prices are never sold: the owner must approve them first (plan §4, §11).
    if (variant.priceStatus !== "confirmed" || !isWholeSek(variant.priceSek)) {
      return issue("price_unconfirmed", `The price of ${product.nameSv} (${variant.label}) is not confirmed yet`);
    }

    // Ingredient removal.
    const removed: string[] = [];
    if (item.removedIngredients.length > 0) {
      if (!category.removable) {
        issue("removal_not_allowed", `Ingredients cannot be removed from ${product.nameSv}`);
      } else {
        for (const wanted of item.removedIngredients) {
          const match = product.ingredients.find((i) => i.toLowerCase() === wanted.trim().toLowerCase());
          if (!match) issue("unknown_ingredient", `${product.nameSv} has no ingredient "${wanted}"`);
          else if (!removed.includes(match)) removed.push(match);
        }
      }
    }

    // Paid extras and gluten-free dough.
    const modifiersSnapshot: PricedLine["modifiersSnapshot"] = [];
    const seen = new Set<string>();
    for (const m of item.modifiers) {
      if (seen.has(m.slug)) {
        issue("duplicate_modifier", `"${m.slug}" is listed twice; send one entry with a quantity`);
        continue;
      }
      seen.add(m.slug);

      const modifier = catalog.modifiers.get(m.slug);
      if (!modifier) {
        issue("unknown_modifier", `Unknown extra "${m.slug}"`);
        continue;
      }
      const allowedForProduct =
        product.modifierSlugs.includes(m.slug) || (m.slug === GLUTEN_FREE_SLUG && product.glutenFreeOption);
      if (!allowedForProduct || !modifier.compatibleCategories.includes(product.categorySlug)) {
        issue("modifier_not_allowed", `${modifier.labelSv} is not available for ${product.nameSv}`);
        continue;
      }
      if (!modifier.active) {
        issue("modifier_unavailable", `${modifier.labelSv} is not available`);
        continue;
      }
      const price = modifier.priceByVariantSek[variant.id];
      if (modifier.priceStatus !== "confirmed" || !isWholeSek(price)) {
        issue("modifier_price_unconfirmed", `The price of ${modifier.labelSv} for ${variant.label} is not confirmed yet`);
        continue;
      }
      if (m.quantity > modifier.maxQty) {
        issue("modifier_quantity", `At most ${modifier.maxQty} of ${modifier.labelSv} per item`);
        continue;
      }
      modifiersSnapshot.push({ modifierSlug: modifier.slug, labelSv: modifier.labelSv, priceSek: price, quantity: m.quantity });
    }

    if (issues.some((i) => i.index === index)) return;

    const extras = modifiersSnapshot.reduce((sum, m) => sum + m.priceSek * m.quantity, 0);
    lines.push({
      productSlug: product.slug,
      productNameSnapshot: product.nameSv,
      variantId: variant.id,
      variantNameSnapshot: variant.label,
      basePriceSek: variant.priceSek,
      modifiersSnapshot,
      removedIngredients: removed,
      note: sanitizeNote(item.note),
      quantity: item.quantity,
      lineTotalSek: (variant.priceSek + extras) * item.quantity,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  const subtotalSek = lines.reduce((sum, l) => sum + l.lineTotalSek, 0);
  return { ok: true, lines, subtotalSek, totalSek: subtotalSek };
}
