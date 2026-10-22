// Shapes returned by GET /api/menu. The browser treats these as the only source of names and prices.

export type PublicVariant = { id: string; label: string; priceSek: number; orderable: boolean };

export type PublicCategory = { slug: string; name: string; blurb: string; removable: boolean };

export type PublicProduct = {
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
};

export type PublicModifier = {
  slug: string;
  label: string;
  priceByVariantSek: Record<string, number>;
  maxQty: number;
  compatibleCategories: string[];
};

export type PublicMenu = {
  categories: PublicCategory[];
  products: PublicProduct[];
  modifiers: PublicModifier[];
};

/** Slug of the gluten-free dough modifier. Mirrors the server constant; the server enforces it regardless. */
export const GLUTEN_FREE_SLUG = "glutenfri-deg";
