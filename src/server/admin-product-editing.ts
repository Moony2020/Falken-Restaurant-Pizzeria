import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { AuditLogModel } from "./models/events.ts";
import { ProductModel, type ProductDoc } from "./models/catalog.ts";
import type { AdminPrincipal } from "./admin-auth.ts";

const variant = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  priceSek: z.number().int().min(1, "Priset måste vara större än 0 kr").max(10_000),
  available: z.boolean(),
  priceStatus: z.enum(["confirmed", "needs_review"]),
}).strict();

const ingredient = z
  .string()
  .trim()
  .min(1, "Ingrediens får inte vara tom")
  .max(60, "Ingrediens kan max vara 60 tecken");

export const productEditSchema = z.object({
  expectedRevision: z.number().int().min(0),
  nameSv: z.string().trim().min(1).max(140),
  descriptionSv: z.string().trim().max(1_500).optional(),
  image: z.string().trim().max(1_000).optional(),
  active: z.boolean(),
  sortOrder: z.number().int().min(-10_000).max(10_000),
  variants: z.array(variant).min(1),
  ingredients: z.array(ingredient).max(30, "Max 30 ingredienser per produkt").optional(),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.variants.map((item) => item.id)).size !== value.variants.length) {
    ctx.addIssue({ code: "custom", message: "Variant ids must be unique", path: ["variants"] });
  }
  if (value.ingredients !== undefined) {
    const normalized = value.ingredients.map((ing) => ing.trim().toLowerCase());
    const unique = new Set(normalized);
    if (unique.size !== normalized.length) {
      ctx.addIssue({
        code: "custom",
        message: "Ingredienser kan inte innehålla dubbletter",
        path: ["ingredients"],
      });
    }
  }
});

export type ProductEdit = z.infer<typeof productEditSchema>;

type ProductLike = Partial<ProductDoc> & {
  slug: string;
  categorySlug: string;
  nameSv: string;
  sortOrder: number;
  active: boolean;
  variants: ProductDoc["variants"];
  ingredients?: string[];
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
  ingredients: Array.isArray(product.ingredients) ? product.ingredients : [],
  revision: product.__v ?? 0,
  updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : null,
});

type PublicProduct = ReturnType<typeof publicProduct>;
export type ProductEditResult =
  | { status: "ok"; product: PublicProduct; replayed: boolean }
  | { status: "stale"; product: PublicProduct }
  | { status: "missing" }
  | { status: "idempotency_conflict" }
  | { status: "invalid_image_reference" }
  | { status: "variant_set_changed" }
  | { status: "transactions_required" };

function stableRequest(slug: string, input: ProductEdit) {
  return JSON.stringify({
    operation: "catalog_product_edit",
    productSlug: slug,
    expectedRevision: input.expectedRevision,
    nameSv: input.nameSv,
    descriptionSv: input.descriptionSv ?? "",
    image: input.image ?? "",
    active: input.active,
    sortOrder: input.sortOrder,
    variants: input.variants.map((item) => ({
      id: item.id,
      label: item.label,
      priceSek: item.priceSek,
      available: item.available,
      priceStatus: item.priceStatus,
    })),
    ingredients: input.ingredients !== undefined ? input.ingredients.map((item) => item.trim()) : null,
  });
}

/** SHA-256 of the canonical, validated edit request. Exported for focused tests. */
export function productEditFingerprint(slug: string, input: ProductEdit) {
  return createHash("sha256").update(stableRequest(slug, input)).digest("hex");
}

function operationKey(slug: string, idempotencyKey: string, actorId: string) {
  const scope = createHash("sha256")
    .update(`catalog-product-edit\u0000${actorId}\u0000${slug}\u0000${idempotencyKey}`)
    .digest("hex");
  return `catalog-edit:${scope}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function auditRequestFingerprint(detail: unknown): string | null {
  if (!isRecord(detail) || !isRecord(detail.idempotency)) return null;
  const fingerprint = detail.idempotency.requestFingerprint;
  return typeof fingerprint === "string" ? fingerprint : null;
}

async function isReplicaSet() {
  try {
    const result = await mongoose.connection.db?.admin().command({ hello: 1 });
    return Boolean(result?.setName || result?.msg === "isdbgrid");
  } catch {
    return false;
  }
}

export async function getAdminProduct(slug: string) {
  const product = await ProductModel.findOne({ slug }).lean();
  return product ? publicProduct(product) : null;
}

export async function updateAdminProduct(
  slug: string,
  input: ProductEdit,
  idempotencyKey: string,
  actor: AdminPrincipal,
): Promise<ProductEditResult> {
  // A standalone MongoDB server cannot make the Product update and AuditLog atomic.
  if (!(await isReplicaSet())) return { status: "transactions_required" };

  const requestFingerprint = productEditFingerprint(slug, input);
  const deduplicationKey = operationKey(slug, idempotencyKey, actor.id);
  const session = await mongoose.startSession();

  try {
    let result: ProductEditResult = { status: "missing" };
    await session.withTransaction(async () => {
      const replay = await AuditLogModel.findOne({ deduplicationKey }).session(session).lean();
      if (replay) {
        if (auditRequestFingerprint(replay.detail) !== requestFingerprint) {
          result = { status: "idempotency_conflict" };
          return;
        }
        const current = await ProductModel.findOne({ slug }).session(session).lean();
        result = current
          ? { status: "ok", product: publicProduct(current), replayed: true }
          : { status: "missing" };
        return;
      }

      const current = await ProductModel.findOne({ slug }).session(session);
      if (!current) {
        result = { status: "missing" };
        return;
      }
      if ((current.__v ?? 0) !== input.expectedRevision) {
        result = { status: "stale", product: publicProduct(current.toObject()) };
        return;
      }

      const currentById = new Map(current.variants.map((item) => [item.id, item]));
      if (currentById.size !== input.variants.length || input.variants.some((item) => !currentById.has(item.id))) {
        result = { status: "variant_set_changed" };
        return;
      }

      const requestedImage = input.image ?? "";
      const currentImage = current.image ?? "";
      if (requestedImage !== currentImage) {
        const approvedImage = requestedImage
          ? await ProductModel.exists({ image: requestedImage }).session(session)
          : null;
        if (!approvedImage) {
          result = { status: "invalid_image_reference" };
          return;
        }
      }

      const before = {
        nameSv: current.nameSv,
        descriptionSv: current.descriptionSv ?? "",
        image: current.image ?? "",
        active: current.active,
        sortOrder: current.sortOrder,
        variants: current.variants.map((item) => ({
          id: item.id,
          label: item.label,
          priceSek: item.priceSek,
          available: item.available,
          priceStatus: item.priceStatus,
        })),
        ingredients: Array.isArray(current.ingredients) ? [...current.ingredients] : [],
      };

      current.nameSv = input.nameSv;
      current.descriptionSv = input.descriptionSv || undefined;
      current.image = input.image || undefined;
      current.active = input.active;
      current.sortOrder = input.sortOrder;
      // Preserve each existing subdocument's unknown fields and original order.
      const existingVariants = current.toObject().variants as Array<
        ProductDoc["variants"][number] & Record<string, unknown>
      >;
      current.variants = existingVariants.map((existing) => {
        const edited = input.variants.find((item) => item.id === existing.id)!;
        return {
          ...existing,
          label: edited.label,
          priceSek: edited.priceSek,
          available: edited.available,
          priceStatus: edited.priceStatus,
        };
      });

      // CRITICAL A6.3b SAFETY:
      // An omitted ingredients field MUST preserve existing product ingredients unchanged.
      // An explicitly submitted array (including empty array) updates the recipe.
      if (input.ingredients !== undefined) {
        current.ingredients = input.ingredients.map((item) => item.trim());
      }

      await current.save({ session });

      await AuditLogModel.create([{
        at: new Date(),
        action: "catalog_product_updated",
        entity: "product",
        entityId: slug,
        actorType: "staff",
        actorId: actor.id,
        deduplicationKey,
        detail: {
          idempotency: { operation: "catalog_product_edit", requestFingerprint },
          before,
          after: {
            nameSv: current.nameSv,
            descriptionSv: current.descriptionSv ?? "",
            image: current.image ?? "",
            active: current.active,
            sortOrder: current.sortOrder,
            variants: current.variants.map((item) => ({
              id: item.id,
              label: item.label,
              priceSek: item.priceSek,
              available: item.available,
              priceStatus: item.priceStatus,
            })),
            ingredients: Array.isArray(current.ingredients) ? [...current.ingredients] : [],
          },
        },
      }], { session });
      result = { status: "ok", product: publicProduct(current.toObject()), replayed: false };
    }, { writeConcern: { w: "majority" } });
    return result;
  } finally {
    await session.endSession();
  }
}
