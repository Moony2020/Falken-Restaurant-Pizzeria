import { CategoryModel, ModifierModel, ProductModel } from "./models/catalog.ts";
import type { Catalog, CatalogCategory, CatalogModifier, CatalogProduct } from "./pricing-engine.ts";

// Reads the catalog from MongoDB. Two shapes: a narrow one for pricing a cart, and a public one for the menu API.

const plain = <T>(v: T) => v;

/** Loads only what a cart touches, so checkout cost doesn't grow with the size of the menu. */
export async function loadCatalogForCart(productSlugs: string[], modifierSlugs: string[]): Promise<Catalog> {
  const products = await ProductModel.find({ slug: { $in: productSlugs } }).lean();
  const categorySlugs = [...new Set(products.map((p) => p.categorySlug))];
  const [categories, modifiers] = await Promise.all([
    CategoryModel.find({ slug: { $in: categorySlugs } }).lean(),
    ModifierModel.find({ slug: { $in: modifierSlugs } }).lean(),
  ]);

  return {
    products: new Map(products.map((p) => [p.slug, plain<CatalogProduct>(p)])),
    categories: new Map(categories.map((c) => [c.slug, plain<CatalogCategory>(c)])),
    modifiers: new Map(
      modifiers.map((m) => [
        m.slug,
        {
          slug: m.slug,
          labelSv: m.labelSv,
          // lean() returns the Map as a plain object.
          priceByVariantSek: (m.priceByVariantSek instanceof Map ? Object.fromEntries(m.priceByVariantSek) : m.priceByVariantSek) as Record<string, number>,
          maxQty: m.maxQty,
          compatibleCategories: m.compatibleCategories,
          active: m.active,
          priceStatus: m.priceStatus,
        } satisfies CatalogModifier,
      ]),
    ),
  };
}

export type PublicVariant = { id: string; label: string; priceSek: number; orderable: boolean };

export type PublicMenu = {
  categories: { slug: string; name: string; blurb: string; removable: boolean }[];
  products: {
    slug: string;
    menuNumber?: number;
    name: string;
    category: string;
    group?: string;
    ingredients: string[];
    description?: string;
    choiceHint?: string;
    variants: PublicVariant[];
    glutenFreeOption: boolean;
    featured: boolean;
    image?: string;
    modifierSlugs: string[];
  }[];
  modifiers: {
    slug: string;
    label: string;
    priceByVariantSek: Record<string, number>;
    maxQty: number;
    compatibleCategories: string[];
  }[];
};

/** Everything a customer-facing menu needs. Internal fields (review notes, status flags) never leave the server. */
export async function getPublicMenu(): Promise<PublicMenu> {
  const [categories, products, modifiers] = await Promise.all([
    CategoryModel.find({ active: true }).sort({ sortOrder: 1 }).lean(),
    ProductModel.find({ active: true }).sort({ sortOrder: 1 }).lean(),
    ModifierModel.find({ active: true, priceStatus: "confirmed" }).lean(),
  ]);
  const activeCategories = new Set(categories.map((c) => c.slug));

  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.nameSv, blurb: c.blurbSv, removable: c.removable })),
    products: products
      .filter((p) => activeCategories.has(p.categorySlug))
      .map((p) => ({
        slug: p.slug,
        menuNumber: p.menuNumber,
        name: p.nameSv,
        category: p.categorySlug,
        group: p.group,
        ingredients: p.ingredients,
        description: p.descriptionSv,
        choiceHint: p.choiceHint,
        // A price is shown, but only confirmed and available sizes can be ordered.
        variants: p.variants.map((v) => ({
          id: v.id,
          label: v.label,
          priceSek: v.priceSek,
          orderable: v.available && v.priceStatus === "confirmed",
        })),
        glutenFreeOption: p.glutenFreeOption,
        featured: p.featured,
        image: p.image,
        modifierSlugs: p.modifierSlugs,
      })),
    modifiers: modifiers.map((m) => ({
      slug: m.slug,
      label: m.labelSv,
      priceByVariantSek: (m.priceByVariantSek instanceof Map ? Object.fromEntries(m.priceByVariantSek) : m.priceByVariantSek) as Record<string, number>,
      maxQty: m.maxQty,
      compatibleCategories: m.compatibleCategories,
    })),
  };
}
