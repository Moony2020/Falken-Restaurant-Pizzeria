import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { AuditLogModel } from "./models/events.ts";
import { ModifierModel, type ModifierDoc } from "./models/catalog.ts";
import type { AdminPrincipal } from "./admin-auth.ts";
import { groupOfModifier } from "../data/modifier-groups.ts";

/**
 * Strict validation for paid modifier editing.
 * Rules enforced:
 * - Every modifier is paid: integer prices strictly between 1 and 500 SEK.
 * - Zero (0 kr), negatives, fractions, nonnumerics, and > 500 kr are rejected.
 * - Minimum 1 variant price required.
 * - Max quantity must be between 1 and 10.
 * - Slugs and groups are immutable and not accepted in the payload.
 */
export const modifierEditSchema = z
  .object({
    expectedRevision: z.number().int().min(0, "Förväntad revision måste vara >= 0"),
    labelSv: z
      .string()
      .trim()
      .min(1, "Namn på tillägget måste anges")
      .max(100, "Namnet kan max innehålla 100 tecken"),
    maxQty: z
      .number()
      .int("Max antal måste vara ett heltal")
      .min(1, "Max antal måste vara minst 1")
      .max(10, "Max antal kan max vara 10"),
    compatibleCategories: z
      .array(z.string().trim().min(1, "Kategorislug kan inte vara tom").max(80))
      .default([]),
    priceByVariantSek: z
      .record(
        z.string().trim().min(1, "Variant-ID kan inte vara tomt").max(80),
        z
          .number()
          .int("Priset måste vara ett heltalsbelopp i SEK (inga ören eller decimaler)")
          .min(1, "Priset måste vara minst 1 kr (gratis/0 kr är ej tillåtet)")
          .max(500, "Priset kan max vara 500 kr"),
      )
      .refine((prices) => Object.keys(prices).length > 0, {
        message: "Minst en variant måste ha ett prissatt belopp",
      }),
    priceStatus: z.enum(["confirmed", "needs_review"]),
    active: z.boolean(),
  })
  .strict();

export type ModifierEdit = z.infer<typeof modifierEditSchema>;

export type AdminModifier = {
  slug: string;
  labelSv: string;
  groupSlug: string | null;
  priceByVariantSek: Record<string, number>;
  maxQty: number;
  compatibleCategories: string[];
  active: boolean;
  priceStatus: "confirmed" | "needs_review";
  revision: number;
  updatedAt: string | null;
};

export type ModifierEditResult =
  | { status: "ok"; modifier: AdminModifier; replayed: boolean }
  | { status: "stale"; modifier: AdminModifier }
  | { status: "missing" }
  | { status: "idempotency_conflict" }
  | { status: "transactions_required" };

function stableModifierRequest(slug: string, input: ModifierEdit) {
  // Sort variant keys deterministically for canonical JSON representation
  const sortedVariants = Object.keys(input.priceByVariantSek)
    .sort()
    .reduce<Record<string, number>>((acc, key) => {
      acc[key] = input.priceByVariantSek[key];
      return acc;
    }, {});

  const sortedCategories = [...input.compatibleCategories].sort();

  return JSON.stringify({
    operation: "catalog_modifier_edit",
    modifierSlug: slug,
    expectedRevision: input.expectedRevision,
    labelSv: input.labelSv,
    maxQty: input.maxQty,
    compatibleCategories: sortedCategories,
    priceByVariantSek: sortedVariants,
    priceStatus: input.priceStatus,
    active: input.active,
  });
}

/** SHA-256 of the canonical, validated modifier edit request. Exported for testing. */
export function modifierEditFingerprint(slug: string, input: ModifierEdit) {
  return createHash("sha256").update(stableModifierRequest(slug, input)).digest("hex");
}

function operationKey(slug: string, idempotencyKey: string, actorId: string) {
  const scope = createHash("sha256")
    .update(`catalog-modifier-edit\u0000${actorId}\u0000${slug}\u0000${idempotencyKey}`)
    .digest("hex");
  return `modifier-edit:${scope}`;
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

export function toAdminModifier(
  doc: ModifierDoc & { __v?: number; updatedAt?: Date | string },
): AdminModifier {
  const priceMap: Record<string, number> =
    doc.priceByVariantSek instanceof Map
      ? Object.fromEntries(doc.priceByVariantSek)
      : (doc.priceByVariantSek as Record<string, number>) || {};

  return {
    slug: doc.slug,
    labelSv: doc.labelSv,
    groupSlug: groupOfModifier(doc.slug, doc.groupSlug),
    priceByVariantSek: priceMap,
    maxQty: doc.maxQty ?? 1,
    compatibleCategories: Array.isArray(doc.compatibleCategories) ? [...doc.compatibleCategories] : [],
    active: Boolean(doc.active),
    priceStatus: doc.priceStatus || "needs_review",
    revision: doc.__v ?? 0,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
}

export async function listAdminModifiers(): Promise<{ modifiers: AdminModifier[]; total: number }> {
  const modifiers = (await ModifierModel.find({}).sort({ labelSv: 1 }).lean()) as Array<
    ModifierDoc & { __v?: number; updatedAt?: Date | string }
  >;

  const result: AdminModifier[] = modifiers.map(toAdminModifier);
  return { modifiers: result, total: result.length };
}

export async function getAdminModifier(slug: string): Promise<AdminModifier | null> {
  const mod = (await ModifierModel.findOne({ slug }).lean()) as
    | (ModifierDoc & { __v?: number; updatedAt?: Date | string })
    | null;

  if (!mod) return null;
  return toAdminModifier(mod);
}

export async function updateAdminModifier(
  slug: string,
  input: ModifierEdit,
  idempotencyKey: string,
  actor: AdminPrincipal,
): Promise<ModifierEditResult> {
  // A standalone MongoDB server cannot make the Modifier update and AuditLog atomic. Fail closed.
  if (!(await isReplicaSet())) return { status: "transactions_required" };

  const requestFingerprint = modifierEditFingerprint(slug, input);
  const deduplicationKey = operationKey(slug, idempotencyKey, actor.id);
  const session = await mongoose.startSession();

  try {
    let result: ModifierEditResult = { status: "missing" };
    await session.withTransaction(
      async () => {
        // 1. Idempotency replay check
        const replay = await AuditLogModel.findOne({ deduplicationKey }).session(session).lean();
        if (replay) {
          if (auditRequestFingerprint(replay.detail) !== requestFingerprint) {
            result = { status: "idempotency_conflict" };
            return;
          }
          const current = (await ModifierModel.findOne({ slug }).session(session).lean()) as
            | (ModifierDoc & { __v?: number; updatedAt?: Date | string })
            | null;
          if (!current) {
            result = { status: "missing" };
            return;
          }
          result = {
            status: "ok",
            modifier: toAdminModifier(current),
            replayed: true,
          };
          return;
        }

        // 2. Locate existing modifier
        const current = await ModifierModel.findOne({ slug }).session(session);
        if (!current) {
          result = { status: "missing" };
          return;
        }

        // 3. Optimistic concurrency check
        if ((current.__v ?? 0) !== input.expectedRevision) {
          const doc = current.toObject() as ModifierDoc & { __v?: number; updatedAt?: Date | string };
          result = {
            status: "stale",
            modifier: toAdminModifier(doc),
          };
          return;
        }

        // 4. Capture before state
        const currentPrices: Record<string, number> =
          current.priceByVariantSek instanceof Map
            ? Object.fromEntries(current.priceByVariantSek)
            : (current.priceByVariantSek as Record<string, number>) || {};

        const before = {
          labelSv: current.labelSv,
          maxQty: current.maxQty,
          compatibleCategories: [...current.compatibleCategories],
          priceByVariantSek: { ...currentPrices },
          priceStatus: current.priceStatus,
          active: current.active,
        };

        // 5. Apply validated updates
        current.labelSv = input.labelSv;
        current.maxQty = input.maxQty;
        current.compatibleCategories = [...input.compatibleCategories];
        current.priceByVariantSek = new Map(Object.entries(input.priceByVariantSek));
        current.priceStatus = input.priceStatus;
        current.active = input.active;

        current.increment();
        await current.save({ session });

        // 6. Record AuditLog entry within the same atomic transaction
        await AuditLogModel.create(
          [
            {
              at: new Date(),
              action: "catalog_modifier_updated",
              entity: "modifier",
              entityId: slug,
              actorType: "staff",
              actorId: actor.id,
              deduplicationKey,
              detail: {
                idempotency: { operation: "catalog_modifier_edit", requestFingerprint },
                before,
                after: {
                  labelSv: current.labelSv,
                  maxQty: current.maxQty,
                  compatibleCategories: [...current.compatibleCategories],
                  priceByVariantSek: Object.fromEntries(current.priceByVariantSek),
                  priceStatus: current.priceStatus,
                  active: current.active,
                },
              },
            },
          ],
          { session },
        );

        const savedDoc = current.toObject() as ModifierDoc & {
          __v?: number;
          updatedAt?: Date | string;
        };

        result = {
          status: "ok",
          modifier: toAdminModifier(savedDoc),
          replayed: false,
        };
      },
      { writeConcern: { w: "majority" } },
    );
    return result;
  } finally {
    await session.endSession();
  }
}

