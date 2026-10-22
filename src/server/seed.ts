import { categories, products } from "../data/menu.ts";
import { GLUTEN_FREE_SURCHARGE } from "../lib/pricing.ts";
import { CategoryModel, ModifierModel, ProductModel } from "./models/catalog.ts";

export type SeedResult = { categories: number; products: number; modifiers: number };

/**
 * Copies the menu from src/data/menu.ts into MongoDB.
 *
 * Insert-only (`$setOnInsert`): re-running never overwrites a price or text the owner has since edited
 * in the admin. Prices the plan marks as unconfirmed are stored as `needs_review`.
 */
export async function seedCatalog(): Promise<SeedResult> {
  const categoryOps = categories.map((c, i) => ({
    updateOne: {
      filter: { slug: c.id },
      update: {
        $setOnInsert: {
          slug: c.id,
          nameSv: c.name,
          blurbSv: c.blurb,
          removable: c.removable,
          sortOrder: i,
          active: true,
        },
      },
      upsert: true,
    },
  }));

  const productOps = products.map((p, i) => {
    const unconfirmed = new Set(p.unconfirmedVariants);
    return {
      updateOne: {
        filter: { slug: p.id },
        update: {
          $setOnInsert: {
            slug: p.id,
            menuNumber: p.number,
            nameSv: p.name,
            categorySlug: p.category,
            group: p.group,
            ingredients: p.ingredients,
            descriptionSv: p.description,
            choiceHint: p.choiceHint,
            variants: p.variants.map((v) => ({
              id: v.id,
              label: v.label,
              priceSek: v.price,
              available: true,
              priceStatus: unconfirmed.has(v.id) ? "needs_review" : "confirmed",
            })),
            glutenFreeOption: !!p.glutenFreeOption,
            featured: !!p.featured,
            image: p.image,
            reviewNote: p.review,
            sortOrder: i,
            active: true,
          },
        },
        upsert: true,
      },
    };
  });

  // The only extra the plan prices: gluten-free dough, +30 kr on pizza (plan §4).
  // Paid extras such as extra cheese are deliberately NOT seeded: the owner sets those prices.
  const modifierOps = [
    {
      updateOne: {
        filter: { slug: "glutenfri-deg" },
        update: {
          $setOnInsert: {
            slug: "glutenfri-deg",
            labelSv: "Glutenfri pizzadeg",
            priceByVariantSek: { normal: GLUTEN_FREE_SURCHARGE, familj: GLUTEN_FREE_SURCHARGE },
            maxQty: 1,
            compatibleCategories: ["pizza", "kebabpizza"],
            active: true,
            priceStatus: "confirmed",
          },
        },
        upsert: true,
      },
    },
  ];

  const [c, p, m] = await Promise.all([
    CategoryModel.bulkWrite(categoryOps),
    ProductModel.bulkWrite(productOps),
    ModifierModel.bulkWrite(modifierOps),
  ]);

  return { categories: c.upsertedCount, products: p.upsertedCount, modifiers: m.upsertedCount };
}
