import { EXTRAS, extraSlug } from "../data/extras.ts";
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

  // Gluten-free dough, +30 kr on pizza (plan §4), plus the opening list of extras from src/data/extras.ts
  // (provisional prices, editable in the database; the insert-only seed never overwrites an edit).
  const extraOps = EXTRAS.map((e) => ({
    updateOne: {
      filter: { slug: extraSlug(e.label) },
      update: {
        $setOnInsert: {
          slug: extraSlug(e.label),
          labelSv: e.label,
          groupSlug: e.group,
          priceByVariantSek: { normal: e.priceSek, familj: e.priceSek },
          maxQty: 1,
          compatibleCategories: e.categories,
          active: true,
          priceStatus: "confirmed",
        },
      },
      upsert: true,
    },
  }));
  const modifierOps = [
    ...extraOps,
    {
      updateOne: {
        filter: { slug: "glutenfri-deg" },
        update: {
          $setOnInsert: {
            slug: "glutenfri-deg",
            labelSv: "Glutenfri pizzadeg",
            groupSlug: "glutenfri",
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
