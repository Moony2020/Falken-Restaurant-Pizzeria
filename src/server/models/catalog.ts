import mongoose, { type Model } from "mongoose";
import { PRICE_STATUS } from "./constants.ts";

// mongoose is CommonJS: named runtime imports fail under plain Node ESM, so destructure the default export.
const { model, models, Schema } = mongoose;

/** Prices are whole SEK. Stored as integers so totals never pick up floating-point error. */
const sek = { type: Number, required: true, min: 0, validate: { validator: Number.isInteger, message: "{PATH} must be a whole number of SEK" } };

const categorySchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    nameSv: { type: String, required: true, trim: true },
    blurbSv: { type: String, default: "" },
    removable: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const variantSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    priceSek: sek,
    available: { type: Boolean, default: true },
    /** needs_review variants are shown but can't be ordered until the owner confirms the price. */
    priceStatus: { type: String, enum: PRICE_STATUS, default: "needs_review" },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    menuNumber: { type: Number, min: 1 },
    nameSv: { type: String, required: true, trim: true },
    categorySlug: { type: String, required: true, index: true },
    group: { type: String },
    ingredients: { type: [String], default: [] },
    allergens: { type: [String], default: [] },
    descriptionSv: { type: String },
    choiceHint: { type: String },
    variants: {
      type: [variantSchema],
      validate: [
        {
          validator: (v: { id: string }[]) => v.length > 0,
          message: "A product needs at least one variant",
        },
        {
          validator: (v: { id: string }[]) => new Set(v.map((x) => x.id)).size === v.length,
          message: "Variant ids must be unique within a product",
        },
      ],
    },
    /** Ids of modifier (extra) groups that apply. Empty until the owner defines extras. */
    modifierSlugs: { type: [String], default: [] },
    glutenFreeOption: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    image: { type: String },
    reviewNote: { type: String },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

/** Paid extras (e.g. extra cheese). Prices are set by the owner per variant; nothing is guessed. */
const modifierSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    labelSv: { type: String, required: true, trim: true },
    /** Which customiser group the extra appears in (see data/modifier-groups.ts). Older documents have none. */
    groupSlug: { type: String },
    priceByVariantSek: {
      type: Map,
      of: sek,
      required: true,
    },
    maxQty: { type: Number, default: 1, min: 1, max: 10 },
    compatibleCategories: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    priceStatus: { type: String, enum: PRICE_STATUS, default: "needs_review" },
  },
  { timestamps: true },
);

export type CategoryDoc = {
  slug: string;
  nameSv: string;
  blurbSv: string;
  removable: boolean;
  sortOrder: number;
  active: boolean;
};

export type ProductDoc = {
  slug: string;
  menuNumber?: number;
  nameSv: string;
  categorySlug: string;
  group?: string;
  ingredients: string[];
  allergens: string[];
  descriptionSv?: string;
  choiceHint?: string;
  variants: { id: string; label: string; priceSek: number; available: boolean; priceStatus: "confirmed" | "needs_review" }[];
  modifierSlugs: string[];
  glutenFreeOption: boolean;
  featured: boolean;
  image?: string;
  reviewNote?: string;
  sortOrder: number;
  active: boolean;
};

export type ModifierDoc = {
  slug: string;
  labelSv: string;
  groupSlug?: string;
  priceByVariantSek: Map<string, number>;
  maxQty: number;
  compatibleCategories: string[];
  active: boolean;
  priceStatus: "confirmed" | "needs_review";
};

export const CategoryModel = (models.Category as Model<CategoryDoc> | undefined) ?? model<CategoryDoc>("Category", categorySchema);
export const ProductModel = (models.Product as Model<ProductDoc> | undefined) ?? model<ProductDoc>("Product", productSchema);
export const ModifierModel = (models.Modifier as Model<ModifierDoc> | undefined) ?? model<ModifierDoc>("Modifier", modifierSchema);
