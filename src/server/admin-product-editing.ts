import mongoose from "mongoose";
import { z } from "zod";
import { AuditLogModel } from "./models/events.ts";
import { ProductModel, type ProductDoc } from "./models/catalog.ts";
import type { AdminPrincipal } from "./admin-auth.ts";

const variant = z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(80), priceSek: z.number().int().min(1, "Priset måste vara större än 0 kr").max(10_000), available: z.boolean(), priceStatus: z.enum(["confirmed", "needs_review"]) }).strict();
export const productEditSchema = z.object({ expectedRevision: z.number().int().min(0), nameSv: z.string().trim().min(1).max(140), descriptionSv: z.string().max(1_500).optional(), image: z.string().max(1_000).optional(), active: z.boolean(), sortOrder: z.number().int().min(-10_000).max(10_000), variants: z.array(variant).min(1) }).strict().superRefine((value, ctx) => {
  if (new Set(value.variants.map((item) => item.id)).size !== value.variants.length) ctx.addIssue({ code: "custom", message: "Variant ids must be unique", path: ["variants"] });
});
export type ProductEdit = z.infer<typeof productEditSchema>;

type ProductLike = Partial<ProductDoc> & {
  slug: string;
  categorySlug: string;
  nameSv: string;
  sortOrder: number;
  active: boolean;
  variants: unknown[];
  __v?: number;
  updatedAt?: Date | string | null;
};
const publicProduct = (product: ProductLike) => ({
  slug: product.slug,
  categorySlug: product.categorySlug,
  nameSv: product.nameSv,
  descriptionSv: product.descriptionSv ?? "",
  image: product.image ?? "",
  active: product.active,
  sortOrder: product.sortOrder,
  variants: product.variants,
  revision: product.__v ?? 0,
  updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : null,
});
export async function getAdminProduct(slug: string) { const product = await ProductModel.findOne({ slug }).lean(); return product ? publicProduct(product) : null; }
export async function updateAdminProduct(slug: string, input: ProductEdit, idempotencyKey: string, actor: AdminPrincipal) {
  const isReplicaSet = await (async () => {
    try {
      const res = await mongoose.connection.db?.admin().command({ hello: 1 });
      return Boolean(res?.setName || res?.msg === "isdbgrid");
    } catch {
      return false;
    }
  })();

  const execute = async (session?: mongoose.ClientSession): Promise<{ status: "ok" | "stale" | "missing"; product?: unknown }> => {
    const deduplicationKey = `catalog-edit:${slug}:${idempotencyKey}`;
    const replayQuery = AuditLogModel.findOne({ deduplicationKey });
    if (session) replayQuery.session(session);
    const replay = await replayQuery.lean();
    if (replay) {
      const curQuery = ProductModel.findOne({ slug });
      if (session) curQuery.session(session);
      const current = await curQuery.lean();
      return current ? { status: "ok", product: publicProduct(current) } : { status: "missing" };
    }
    const currentQuery = ProductModel.findOne({ slug });
    if (session) currentQuery.session(session);
    const current = await currentQuery;
    if (!current) return { status: "missing" };
    if ((current.__v ?? 0) !== input.expectedRevision) return { status: "stale", product: publicProduct(current.toObject()) };
    const currentById = new Map(current.variants.map((item) => [item.id, item]));
    if (currentById.size !== input.variants.length || input.variants.some((item) => !currentById.has(item.id))) throw new Error("variant_set_changed");
    const before = { nameSv: current.nameSv, active: current.active, sortOrder: current.sortOrder, variants: current.variants.map((item) => ({ id: item.id, priceSek: item.priceSek, available: item.available, priceStatus: item.priceStatus })) };
    current.nameSv = input.nameSv; current.descriptionSv = input.descriptionSv || undefined; current.image = input.image || undefined; current.active = input.active; current.sortOrder = input.sortOrder;
    current.variants = input.variants.map((item) => ({ ...currentById.get(item.id)!, label: item.label, priceSek: item.priceSek, available: item.available, priceStatus: item.priceStatus }));
    await current.save(session ? { session } : undefined);
    await AuditLogModel.create([{ at: new Date(), action: "catalog_product_updated", entity: "product", entityId: slug, actorType: "staff", actorId: actor.id, deduplicationKey, detail: { before, after: { nameSv: current.nameSv, active: current.active, sortOrder: current.sortOrder, variants: current.variants.map((item) => ({ id: item.id, priceSek: item.priceSek, available: item.available, priceStatus: item.priceStatus })) } } }], session ? { session } : undefined);
    return { status: "ok", product: publicProduct(current.toObject()) };
  };

  if (!isReplicaSet) {
    return await execute();
  }

  const session = await mongoose.startSession();
  try {
    let result: { status: "ok" | "stale" | "missing"; product?: unknown } = { status: "missing" };
    await session.withTransaction(async () => {
      result = await execute(session);
    }, { writeConcern: { w: "majority" } });
    return result;
  } finally { await session.endSession(); }
}
