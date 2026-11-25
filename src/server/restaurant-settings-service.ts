import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import {
  galleryHeroImage,
  heroImage,
  LAST_PICKUP_BEFORE_CLOSE,
  mapsUrl as defaultMapsUrl,
  menuHeroImage,
  PREP_MINUTES,
  site as defaultSite,
} from "../data/site.ts";
import { AuditLogModel } from "./models/events.ts";
import { RestaurantSettingsModel, type RestaurantSettingsDoc } from "./models/restaurant-settings.ts";

/* -------------------------------------------------------------------------------------------------
 * SERVER-OWNED ASSET ALLOWLISTS
 * Only approved, verified assets under /public/images/ may be selected.
 * ------------------------------------------------------------------------------------------------- */

export const ALLOWED_HERO_IMAGES = [
  "/images/hero/menuhero.webp",
  "/images/hero/Hero-image.webp",
  "/images/gallery/restaurant1.webp",
  "/images/gallery/matsalen.webp",
  "/images/gallery/inside.webp",
] as const;

export const ALLOWED_MENU_HERO_IMAGES = [
  "/images/menu/menu-hero.webp",
  "/images/hero/menuhero.webp",
  "/images/dishes/pizza/falken-special.webp",
  "/images/dishes/pizza/margherita.webp",
] as const;

export const ALLOWED_GALLERY_HERO_IMAGES = [
  "/images/gallery/gallery-hero.webp",
  "/images/gallery/matsalen.webp",
  "/images/gallery/inside.webp",
] as const;

export const ALLOWED_CONTACT_HERO_IMAGES = [
  "/images/gallery/restaurant1.webp",
  "/images/hero/falken-kontakt-hero.webp",
  "/images/hero/falken-kontakt.webp",
] as const;

// These were the original defaults before the homepage and menu hero assets
// were intentionally swapped. Treat only those exact legacy defaults as
// defaults on read; all other saved administrator selections remain intact.
function resolveHeroImage(path: string | null | undefined) {
  return path === "/images/hero/Hero-image.webp" ? "/images/hero/menuhero.webp" : path;
}

function resolveMenuHeroImage(path: string | null | undefined) {
  return path === "/images/menu/menu-hero.webp" ? "/images/hero/Hero-image.webp" : path;
}

export type ImageSlot = "hero" | "menuHero" | "galleryHero" | "contactHero";

export function isAllowedImageForSlot(slot: ImageSlot, path: string): boolean {
  if (slot === "hero") return (ALLOWED_HERO_IMAGES as readonly string[]).includes(path);
  if (slot === "menuHero") return (ALLOWED_MENU_HERO_IMAGES as readonly string[]).includes(path);
  if (slot === "galleryHero") return (ALLOWED_GALLERY_HERO_IMAGES as readonly string[]).includes(path);
  if (slot === "contactHero") return (ALLOWED_CONTACT_HERO_IMAGES as readonly string[]).includes(path);
  return false;
}

/* -------------------------------------------------------------------------------------------------
 * VALIDATION AND DERIVATION HELPERS
 * ------------------------------------------------------------------------------------------------- */

/** Normalizes and formats Swedish phone numbers to tel: URI server-side. Never accepts tel: from client. */
export function derivePhoneHref(phone: string): string {
  const digitsOnly = phone.replace(/[\s\-_().]/g, "");
  if (!digitsOnly) return "tel:+4619294898";
  if (digitsOnly.startsWith("+")) {
    return `tel:${digitsOnly}`;
  }
  if (digitsOnly.startsWith("00")) {
    return `tel:+${digitsOnly.slice(2)}`;
  }
  if (digitsOnly.startsWith("0")) {
    return `tel:+46${digitsOnly.slice(1)}`;
  }
  return `tel:+46${digitsOnly}`;
}

export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-_().]/g, "");
  return /^\+?[0-9]{6,16}$/.test(cleaned);
}

const ALLOWED_DIRECT_MAPS_HOSTS = new Set([
  "maps.google.com",
  "maps.google.se",
  "www.google.com",
  "google.com",
  "www.google.se",
  "google.se",
]);

export function isValidMapsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_DIRECT_MAPS_HOSTS.has(host)) return false;
    // Require direct /maps path if hosted on generic google domain to prevent redirectors
    if (host === "google.com" || host === "www.google.com" || host === "google.se" || host === "www.google.se") {
      return url.pathname.startsWith("/maps");
    }
    return true;
  } catch {
    return false;
  }
}

export function isValidFacebookUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === "facebook.com" || host === "www.facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export function isValidInstagramUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === "instagram.com" || host === "www.instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------------------------------
 * SCHEMAS AND TYPES
 * ------------------------------------------------------------------------------------------------- */

export const restaurantSettingsEditSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    name: z.string().trim().min(1, "Restaurangnamn krävs").max(60).optional(),
    legalName: z.string().trim().min(1, "Juridiskt namn krävs").max(100).optional(),
    tagline: z.string().trim().min(1).max(100).optional(),
    phone: z
      .string()
      .trim()
      .min(5, "Telefonnumret är för kort")
      .max(30)
      .refine(isValidPhoneNumber, { message: "Ogiltigt telefonnummerformat" })
      .optional(),
    email: z
      .string()
      .trim()
      .email("Ogiltig e-postadress")
      .max(100)
      .optional(),
    address: z
      .object({
        street: z.string().trim().min(1, "Gatuadress krävs").max(100),
        zip: z.string().trim().min(1, "Postnummer krävs").max(20),
        city: z.string().trim().min(1, "Postort krävs").max(50),
        country: z.string().trim().min(1).max(50).optional(),
      })
      .optional(),
    mapsUrl: z
      .string()
      .trim()
      .max(500)
      .refine((val) => !val || isValidMapsUrl(val), {
        message: "Ogiltig Google Maps-länk. Måste använda https och en godkänd Google Maps-domän.",
      })
      .optional(),
    social: z
      .object({
        facebook: z
          .string()
          .trim()
          .max(300)
          .refine((val) => !val || isValidFacebookUrl(val), {
            message: "Ogiltig Facebook-länk. Måste använda https://www.facebook.com/...",
          })
          .optional(),
        instagram: z
          .string()
          .trim()
          .max(300)
          .refine((val) => !val || isValidInstagramUrl(val), {
            message: "Ogiltig Instagram-länk. Måste använda https://www.instagram.com/...",
          })
          .optional(),
      })
      .optional(),
    heroImage: z
      .string()
      .trim()
      .refine((val) => !val || isAllowedImageForSlot("hero", val), {
        message: "Bilden för startsidan finns inte i listan över godkända bilder.",
      })
      .optional(),
    menuHeroImage: z
      .string()
      .trim()
      .refine((val) => !val || isAllowedImageForSlot("menuHero", val), {
        message: "Bilden för menyn finns inte i listan över godkända bilder.",
      })
      .optional(),
    contactHeroImage: z
      .string()
      .trim()
      .refine((val) => !val || isAllowedImageForSlot("contactHero", val), {
        message: "Bilden för kontaktsidan finns inte i listan över godkända bilder.",
      })
      .optional(),
    galleryHeroImage: z
      .string()
      .trim()
      .refine((val) => !val || isAllowedImageForSlot("galleryHero", val), {
        message: "Bilden för galleriet finns inte i listan över godkända bilder.",
      })
      .optional(),
    prepMinutes: z.number().int().min(5, "Minst 5 minuter").max(60, "Max 60 minuter").optional(),
    lastPickupBeforeClose: z.number().int().min(0, "Minst 0 minuter").max(60, "Max 60 minuter").optional(),
  })
  .strict();

export type RestaurantSettingsEdit = z.infer<typeof restaurantSettingsEditSchema>;

export type EffectiveRestaurantSettings = {
  name: string;
  legalName: string;
  tagline: string;
  phone: string;
  phoneHref: string;
  email: string;
  address: {
    street: string;
    zip: string;
    city: string;
    country: string;
  };
  mapsUrl: string;
  social: {
    facebook: string;
    instagram: string;
  };
  heroImage: string;
  menuHeroImage: string;
  contactHeroImage: string;
  galleryHeroImage: string;
  prepMinutes: number;
  lastPickupBeforeClose: number;
  revision: number;
  updatedAt: string | null;
};

export type SettingsUpdateResult =
  | { status: "ok"; settings: EffectiveRestaurantSettings; replayed: boolean }
  | { status: "stale"; settings: EffectiveRestaurantSettings }
  | { status: "idempotency_conflict" }
  | { status: "transactions_required" };

/* -------------------------------------------------------------------------------------------------
 * CANONICAL FINGERPRINTING & AUDIT REPLAY
 * ------------------------------------------------------------------------------------------------- */

function canonicalSettingsRequest(input: RestaurantSettingsEdit): string {
  return JSON.stringify({
    op: "restaurant_settings_edit",
    expectedRevision: input.expectedRevision,
    name: input.name ?? "",
    legalName: input.legalName ?? "",
    tagline: input.tagline ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address
      ? {
          street: input.address.street,
          zip: input.address.zip,
          city: input.address.city,
          country: input.address.country ?? "Sverige",
        }
      : null,
    mapsUrl: input.mapsUrl ?? "",
    social: input.social
      ? {
          facebook: input.social.facebook ?? "",
          instagram: input.social.instagram ?? "",
        }
      : null,
    heroImage: input.heroImage ?? "",
    menuHeroImage: input.menuHeroImage ?? "",
    contactHeroImage: input.contactHeroImage ?? "",
    galleryHeroImage: input.galleryHeroImage ?? "",
    prepMinutes: input.prepMinutes ?? null,
    lastPickupBeforeClose: input.lastPickupBeforeClose ?? null,
  });
}

export function settingsEditFingerprint(input: RestaurantSettingsEdit): string {
  return createHash("sha256").update(canonicalSettingsRequest(input)).digest("hex");
}

function operationKey(idempotencyKey: string, actorId: string): string {
  return createHash("sha256")
    .update(`restaurant-settings-edit\u0000${actorId}\u0000${idempotencyKey}`)
    .digest("hex");
}

/* -------------------------------------------------------------------------------------------------
 * RESOLUTION AND EFFECTIVE VALUES
 * ------------------------------------------------------------------------------------------------- */

export function resolveEffectiveSettings(
  doc?: Partial<RestaurantSettingsDoc> | null,
): EffectiveRestaurantSettings {
  const phone = doc?.phone || defaultSite.phone;
  const phoneHref = derivePhoneHref(phone);

  return {
    name: doc?.name || defaultSite.name,
    legalName: doc?.legalName || defaultSite.legalName,
    tagline: doc?.tagline || defaultSite.tagline,
    phone,
    phoneHref,
    email: doc?.email || defaultSite.email,
    address: {
      street: doc?.address?.street || defaultSite.address.street,
      zip: doc?.address?.zip || defaultSite.address.zip,
      city: doc?.address?.city || defaultSite.address.city,
      country: doc?.address?.country || defaultSite.address.country,
    },
    mapsUrl: doc?.mapsUrl || defaultMapsUrl,
    social: {
      facebook: doc?.social?.facebook || defaultSite.social.facebook,
      instagram: doc?.social?.instagram || defaultSite.social.instagram,
    },
    heroImage: resolveHeroImage(doc?.heroImage) || heroImage || "/images/hero/menuhero.webp",
    menuHeroImage: resolveMenuHeroImage(doc?.menuHeroImage) || menuHeroImage || "/images/hero/Hero-image.webp",
    contactHeroImage: doc?.contactHeroImage || "/images/gallery/restaurant1.webp",
    galleryHeroImage: doc?.galleryHeroImage || galleryHeroImage || "/images/gallery/gallery-hero.webp",
    prepMinutes: typeof doc?.prepMinutes === "number" ? doc.prepMinutes : PREP_MINUTES,
    lastPickupBeforeClose:
      typeof doc?.lastPickupBeforeClose === "number" ? doc.lastPickupBeforeClose : LAST_PICKUP_BEFORE_CLOSE,
    revision: doc?.__v ?? 0,
    updatedAt: doc?.updatedAt instanceof Date
      ? doc.updatedAt.toISOString()
      : typeof doc?.updatedAt === "string"
        ? doc.updatedAt
        : null,
  };
}

/** Queries public settings from database with safe fallback to site defaults. */
export async function getEffectiveRestaurantSettings(): Promise<EffectiveRestaurantSettings> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await RestaurantSettingsModel.findById("restaurant").lean();
      return resolveEffectiveSettings(doc as Partial<RestaurantSettingsDoc> | null);
    }
    return resolveEffectiveSettings(null);
  } catch {
    // Fail-open graceful fallback to compiled defaults
    return resolveEffectiveSettings(null);
  }
}

/** Queries admin settings from database including revision and allowlists. */
export async function getAdminRestaurantSettings() {
  let doc: Partial<RestaurantSettingsDoc> | null = null;
  if (mongoose.connection.readyState === 1) {
    doc = await RestaurantSettingsModel.findById("restaurant").lean();
  }
  const effective = resolveEffectiveSettings(doc);
  return {
    settings: effective,
    allowlists: {
      hero: ALLOWED_HERO_IMAGES,
      menuHero: ALLOWED_MENU_HERO_IMAGES,
      galleryHero: ALLOWED_GALLERY_HERO_IMAGES,
      contactHero: ALLOWED_CONTACT_HERO_IMAGES,
    },
  };
}

/* -------------------------------------------------------------------------------------------------
 * UPDATE WITH ATOMIC TRANSACTION AND AUDIT LOG
 * ------------------------------------------------------------------------------------------------- */

async function isReplicaSet() {
  try {
    const result = await mongoose.connection.db?.admin().command({ hello: 1 });
    return Boolean(result?.setName || result?.msg === "isdbgrid");
  } catch {
    return false;
  }
}

export async function updateAdminRestaurantSettings(
  input: RestaurantSettingsEdit,
  actor: { id: string },
  idempotencyKey: string,
): Promise<SettingsUpdateResult> {
  if (!(await isReplicaSet())) {
    return { status: "transactions_required" };
  }

  const requestFingerprint = settingsEditFingerprint(input);
  const deduplicationKey = operationKey(idempotencyKey, actor.id);
  const session = await mongoose.startSession();

  try {
    let result: SettingsUpdateResult = { status: "transactions_required" };

    await session.withTransaction(
      async () => {
        // 1. Check for idempotent replay
        const replay = await AuditLogModel.findOne({ deduplicationKey }).session(session).lean();
        if (replay) {
          const storedFingerprint = replay.detail && typeof replay.detail === "object"
            ? (replay.detail as Record<string, unknown>).requestFingerprint
            : undefined;
          if (storedFingerprint !== requestFingerprint) {
            result = { status: "idempotency_conflict" };
            return;
          }
          const currentDoc = await RestaurantSettingsModel.findById("restaurant").session(session).lean();
          result = {
            status: "ok",
            settings: resolveEffectiveSettings(currentDoc as Partial<RestaurantSettingsDoc> | null),
            replayed: true,
          };
          return;
        }

        // 2. Fetch current document and check optimistic revision
        let currentDoc = await RestaurantSettingsModel.findById("restaurant").session(session);
        if (!currentDoc) {
          // Initialize if document does not exist yet
          const created = await RestaurantSettingsModel.create(
            [
              {
                _id: "restaurant",
                onlineOrderingEnabled: true,
                __v: 0,
              },
            ],
            { session },
          );
          currentDoc = created[0];
        }

        const currentRevision = currentDoc.__v ?? 0;
        if (currentRevision !== input.expectedRevision) {
          result = {
            status: "stale",
            settings: resolveEffectiveSettings(currentDoc.toObject() as Partial<RestaurantSettingsDoc>),
          };
          return;
        }

        // 3. Prepare update fields (only specified branding/identity fields)
        const updateOps: Record<string, unknown> = {
          updatedBy: actor.id,
          $inc: { __v: 1 },
        };
        const setFields: Record<string, unknown> = {};

        if (input.name !== undefined) setFields.name = input.name;
        if (input.legalName !== undefined) setFields.legalName = input.legalName;
        if (input.tagline !== undefined) setFields.tagline = input.tagline;
        if (input.phone !== undefined) setFields.phone = input.phone;
        if (input.email !== undefined) setFields.email = input.email;
        if (input.address !== undefined) {
          setFields["address.street"] = input.address.street;
          setFields["address.zip"] = input.address.zip;
          setFields["address.city"] = input.address.city;
          if (input.address.country !== undefined) setFields["address.country"] = input.address.country;
        }
        if (input.mapsUrl !== undefined) setFields.mapsUrl = input.mapsUrl;
        if (input.social !== undefined) {
          if (input.social.facebook !== undefined) setFields["social.facebook"] = input.social.facebook;
          if (input.social.instagram !== undefined) setFields["social.instagram"] = input.social.instagram;
        }
        if (input.heroImage !== undefined) setFields.heroImage = input.heroImage;
        if (input.menuHeroImage !== undefined) setFields.menuHeroImage = input.menuHeroImage;
        if (input.contactHeroImage !== undefined) setFields.contactHeroImage = input.contactHeroImage;
        if (input.galleryHeroImage !== undefined) setFields.galleryHeroImage = input.galleryHeroImage;
        if (input.prepMinutes !== undefined) setFields.prepMinutes = input.prepMinutes;
        if (input.lastPickupBeforeClose !== undefined) setFields.lastPickupBeforeClose = input.lastPickupBeforeClose;

        updateOps.$set = setFields;

        // 4. Update settings document
        const updatedDoc = await RestaurantSettingsModel.findByIdAndUpdate(
          "restaurant",
          updateOps,
          {
            new: true,
            session,
            runValidators: true,
          },
        );

        if (!updatedDoc) {
          result = { status: "stale", settings: resolveEffectiveSettings(null) };
          return;
        }

        const effective = resolveEffectiveSettings(updatedDoc.toObject() as Partial<RestaurantSettingsDoc>);

        // 5. Write audit log entry in the same transaction
        await AuditLogModel.create(
          [
            {
              at: new Date(),
              action: "restaurant_settings_updated",
              entity: "RestaurantSettings",
              entityId: "restaurant",
              actorType: "staff",
              actorId: actor.id,
              deduplicationKey,
              detail: {
                requestFingerprint,
                previousRevision: currentRevision,
                newRevision: updatedDoc.__v ?? currentRevision + 1,
                updatedFields: Object.keys(setFields),
              },
            },
          ],
          { session },
        );

        result = {
          status: "ok",
          settings: effective,
          replayed: false,
        };
      },
      {
        writeConcern: { w: "majority" },
      },
    );

    return result;
  } finally {
    await session.endSession();
  }
}
