import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { AuditLogModel } from "./models/events.ts";
import { CategoryModel, ProductModel, type CategoryDoc } from "./models/catalog.ts";
import type { AdminPrincipal } from "./admin-auth.ts";

export const categoryEditSchema = z.object({
  expectedRevision: z.number().int().min(0),
  nameSv: z.string().trim().min(1, "Namn måste anges").max(100, "Namnet kan max innehålla 100 tecken"),
  blurbSv: z.string().trim().max(300, "Beskrivningen kan max innehålla 300 tecken").optional().default(""),
  sortOrder: z.number().int().min(-10_000).max(10_000),
  removable: z.boolean(),
  active: z.boolean(),
}).strict();

export type CategoryEdit = z.infer<typeof categoryEditSchema>;

export type AdminCategory = {
  slug: string;
  nameSv: string;
  blurbSv: string;
  removable: boolean;
  sortOrder: number;
  active: boolean;
  productCount: number;
  activeProductCount: number;
  revision: number;
  updatedAt: string | null;
};

export type CategoryEditResult =
  | { status: "ok"; category: AdminCategory; replayed: boolean }
  | { status: "stale"; category: AdminCategory }
  | { status: "missing" }
  | { status: "idempotency_conflict" }
  | { status: "transactions_required" };

function stableCategoryRequest(slug: string, input: CategoryEdit) {
  return JSON.stringify({
    operation: "catalog_category_edit",
    categorySlug: slug,
    expectedRevision: input.expectedRevision,
    nameSv: input.nameSv,
    blurbSv: input.blurbSv ?? "",
    sortOrder: input.sortOrder,
    removable: input.removable,
    active: input.active,
  });
}

/** SHA-256 of the canonical, validated category edit request. Exported for tests. */
export function categoryEditFingerprint(slug: string, input: CategoryEdit) {
  return createHash("sha256").update(stableCategoryRequest(slug, input)).digest("hex");
}

function operationKey(slug: string, idempotencyKey: string, actorId: string) {
  const scope = createHash("sha256")
    .update(`catalog-category-edit\u0000${actorId}\u0000${slug}\u0000${idempotencyKey}`)
    .digest("hex");
  return `category-edit:${scope}`;
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

export async function listAdminCategories(): Promise<{ categories: AdminCategory[]; total: number }> {
  const [categories, productCounts] = await Promise.all([
    CategoryModel.find({}).sort({ sortOrder: 1, nameSv: 1 }).lean(),
    ProductModel.aggregate<{ _id: string; total: number; active: number }>([
      {
        $group: {
          _id: "$categorySlug",
          total: { $sum: 1 },
          active: { $sum: { $cond: ["$active", 1, 0] } },
        },
      },
    ]),
  ]);

  const countMap = new Map(productCounts.map((item) => [item._id, { total: item.total, active: item.active }]));

  const result: AdminCategory[] = (categories as Array<CategoryDoc & { __v?: number; updatedAt?: Date | string }>).map((cat) => {
    const counts = countMap.get(cat.slug) ?? { total: 0, active: 0 };
    return {
      slug: cat.slug,
      nameSv: cat.nameSv,
      blurbSv: cat.blurbSv ?? "",
      removable: Boolean(cat.removable),
      sortOrder: cat.sortOrder ?? 0,
      active: Boolean(cat.active),
      productCount: counts.total,
      activeProductCount: counts.active,
      revision: cat.__v ?? 0,
      updatedAt: cat.updatedAt ? new Date(cat.updatedAt).toISOString() : null,
    };
  });

  return { categories: result, total: result.length };
}

export async function getAdminCategory(slug: string): Promise<AdminCategory | null> {
  const [cat, counts] = await Promise.all([
    CategoryModel.findOne({ slug }).lean(),
    ProductModel.aggregate<{ _id: string; total: number; active: number }>([
      { $match: { categorySlug: slug } },
      {
        $group: {
          _id: "$categorySlug",
          total: { $sum: 1 },
          active: { $sum: { $cond: ["$active", 1, 0] } },
        },
      },
    ]),
  ]);

  if (!cat) return null;
  const count = counts[0] ?? { total: 0, active: 0 };
  const doc = cat as CategoryDoc & { __v?: number; updatedAt?: Date | string };

  return {
    slug: doc.slug,
    nameSv: doc.nameSv,
    blurbSv: doc.blurbSv ?? "",
    removable: Boolean(doc.removable),
    sortOrder: doc.sortOrder ?? 0,
    active: Boolean(doc.active),
    productCount: count.total,
    activeProductCount: count.active,
    revision: doc.__v ?? 0,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export async function updateAdminCategory(
  slug: string,
  input: CategoryEdit,
  idempotencyKey: string,
  actor: AdminPrincipal,
): Promise<CategoryEditResult> {
  // A standalone MongoDB server cannot make the Category update and AuditLog atomic.
  if (!(await isReplicaSet())) return { status: "transactions_required" };

  const requestFingerprint = categoryEditFingerprint(slug, input);
  const deduplicationKey = operationKey(slug, idempotencyKey, actor.id);
  const session = await mongoose.startSession();

  try {
    let result: CategoryEditResult = { status: "missing" };
    await session.withTransaction(async () => {
      const replay = await AuditLogModel.findOne({ deduplicationKey }).session(session).lean();
      if (replay) {
        if (auditRequestFingerprint(replay.detail) !== requestFingerprint) {
          result = { status: "idempotency_conflict" };
          return;
        }
        const current = await CategoryModel.findOne({ slug }).session(session).lean();
        if (!current) {
          result = { status: "missing" };
          return;
        }
        const counts = await ProductModel.aggregate<{ _id: string; total: number; active: number }>([
          { $match: { categorySlug: slug } },
          {
            $group: {
              _id: "$categorySlug",
              total: { $sum: 1 },
              active: { $sum: { $cond: ["$active", 1, 0] } },
            },
          },
        ]).session(session);
        const count = counts[0] ?? { total: 0, active: 0 };
        const doc = current as CategoryDoc & { __v?: number; updatedAt?: Date | string };
        result = {
          status: "ok",
          category: {
            slug: doc.slug,
            nameSv: doc.nameSv,
            blurbSv: doc.blurbSv ?? "",
            removable: Boolean(doc.removable),
            sortOrder: doc.sortOrder ?? 0,
            active: Boolean(doc.active),
            productCount: count.total,
            activeProductCount: count.active,
            revision: doc.__v ?? 0,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
          },
          replayed: true,
        };
        return;
      }

      const current = await CategoryModel.findOne({ slug }).session(session);
      if (!current) {
        result = { status: "missing" };
        return;
      }
      if ((current.__v ?? 0) !== input.expectedRevision) {
        const counts = await ProductModel.aggregate<{ _id: string; total: number; active: number }>([
          { $match: { categorySlug: slug } },
          {
            $group: {
              _id: "$categorySlug",
              total: { $sum: 1 },
              active: { $sum: { $cond: ["$active", 1, 0] } },
            },
          },
        ]).session(session);
        const count = counts[0] ?? { total: 0, active: 0 };
        const doc = current.toObject() as CategoryDoc & { __v?: number; updatedAt?: Date | string };
        result = {
          status: "stale",
          category: {
            slug: doc.slug,
            nameSv: doc.nameSv,
            blurbSv: doc.blurbSv ?? "",
            removable: Boolean(doc.removable),
            sortOrder: doc.sortOrder ?? 0,
            active: Boolean(doc.active),
            productCount: count.total,
            activeProductCount: count.active,
            revision: doc.__v ?? 0,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
          },
        };
        return;
      }

      const before = {
        nameSv: current.nameSv,
        blurbSv: current.blurbSv ?? "",
        sortOrder: current.sortOrder,
        removable: current.removable,
        active: current.active,
      };

      current.nameSv = input.nameSv;
      current.blurbSv = input.blurbSv ?? "";
      current.sortOrder = input.sortOrder;
      current.removable = input.removable;
      current.active = input.active;

      current.increment();
      await current.save({ session });

      await AuditLogModel.create([{
        at: new Date(),
        action: "catalog_category_updated",
        entity: "category",
        entityId: slug,
        actorType: "staff",
        actorId: actor.id,
        deduplicationKey,
        detail: {
          idempotency: { operation: "catalog_category_edit", requestFingerprint },
          before,
          after: {
            nameSv: current.nameSv,
            blurbSv: current.blurbSv ?? "",
            sortOrder: current.sortOrder,
            removable: current.removable,
            active: current.active,
          },
        },
      }], { session });

      const counts = await ProductModel.aggregate<{ _id: string; total: number; active: number }>([
        { $match: { categorySlug: slug } },
        {
          $group: {
            _id: "$categorySlug",
            total: { $sum: 1 },
            active: { $sum: { $cond: ["$active", 1, 0] } },
          },
        },
      ]).session(session);

      const count = counts[0] ?? { total: 0, active: 0 };
      const savedDoc = current.toObject() as CategoryDoc & { __v?: number; updatedAt?: Date | string };

      result = {
        status: "ok",
        category: {
          slug: savedDoc.slug,
          nameSv: savedDoc.nameSv,
          blurbSv: savedDoc.blurbSv ?? "",
          removable: Boolean(savedDoc.removable),
          sortOrder: savedDoc.sortOrder ?? 0,
          active: Boolean(savedDoc.active),
          productCount: count.total,
          activeProductCount: count.active,
          revision: savedDoc.__v ?? 0,
          updatedAt: savedDoc.updatedAt ? new Date(savedDoc.updatedAt).toISOString() : null,
        },
        replayed: false,
      };
    }, { writeConcern: { w: "majority" } });
    return result;
  } finally {
    await session.endSession();
  }
}
