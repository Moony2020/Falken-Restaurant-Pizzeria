import { z } from "zod";
import { CategoryModel, ProductModel, type ProductDoc } from "./models/catalog.ts";

export const adminCatalogProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().trim().min(1).max(80).default("ALL"),
  status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
  q: z.string().trim().max(80).default(""),
}).strict();

function escapeRegex(value: string) {
  return [...value].map((char) => "\\^$.*+?()[]{}|".includes(char) ? `\\${char}` : char).join("");
}

export type AdminCatalogProduct = {
  slug: string;
  nameSv: string;
  categorySlug: string;
  categoryName: string;
  active: boolean;
  variantCount: number;
  availableVariantCount: number;
  variants: { id: string; label: string; priceSek: number; available: boolean; priceStatus: "confirmed" | "needs_review" }[];
};

export type AdminCatalogProductsResponse = {
  products: AdminCatalogProduct[];
  categories: { slug: string; nameSv: string }[];
  total: number;
  page: number;
  limit: number;
};

export async function listAdminCatalogProducts(input: z.infer<typeof adminCatalogProductsQuerySchema>): Promise<AdminCatalogProductsResponse> {
  const filter: Record<string, unknown> = {};
  if (input.category !== "ALL") filter.categorySlug = input.category;
  if (input.status !== "ALL") filter.active = input.status === "ACTIVE";
  if (input.q) {
    const query = new RegExp(escapeRegex(input.q), "i");
    filter.$or = [{ nameSv: query }, { slug: query }];
  }

  const [rows, total, categories] = await Promise.all([
    ProductModel.find(filter)
      .sort({ categorySlug: 1, sortOrder: 1, nameSv: 1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit)
      .select("slug nameSv categorySlug active variants")
      .lean(),
    ProductModel.countDocuments(filter),
    CategoryModel.find({}).sort({ sortOrder: 1, nameSv: 1 }).select("slug nameSv").lean(),
  ]);
  const categoryNames = new Map(categories.map((category) => [category.slug, category.nameSv]));

  return {
    products: (rows as ProductDoc[]).map((product) => ({
      slug: product.slug,
      nameSv: product.nameSv,
      categorySlug: product.categorySlug,
      categoryName: categoryNames.get(product.categorySlug) ?? product.categorySlug,
      active: product.active,
      variantCount: product.variants.length,
      availableVariantCount: product.variants.filter((variant) => variant.available && variant.priceStatus === "confirmed").length,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        label: variant.label,
        priceSek: variant.priceSek,
        available: variant.available,
        priceStatus: variant.priceStatus,
      })),
    })),
    categories: categories.map((category) => ({ slug: category.slug, nameSv: category.nameSv })),
    total,
    page: input.page,
    limit: input.limit,
  };
}
