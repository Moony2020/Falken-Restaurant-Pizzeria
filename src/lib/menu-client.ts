import { GLUTEN_FREE_SLUG, type PublicMenu, type PublicModifier, type PublicProduct } from "./menu-types.ts";

// Pure helpers for the menu returned by GET /api/menu. No fallback prices exist anywhere in the browser:
// if the menu can't be loaded, the caller shows an error instead of guessing.

export type MenuLoadFailure = "network" | "server" | "invalid";
export type MenuLoad = { ok: true; menu: PublicMenu } | { ok: false; reason: MenuLoadFailure };

const isMenu = (v: unknown): v is PublicMenu => {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return Array.isArray(m.categories) && Array.isArray(m.products) && Array.isArray(m.modifiers);
};

export async function loadMenu(fetchImpl: typeof fetch = fetch): Promise<MenuLoad> {
  let res: Response;
  try {
    res = await fetchImpl("/api/menu", { cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (!res.ok) return { ok: false, reason: "server" };
  try {
    const data: unknown = await res.json();
    return isMenu(data) ? { ok: true, menu: data } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

/** A product can be ordered if at least one size is both available and price-confirmed. */
export const isOrderable = (p: PublicProduct): boolean => p.variants.some((v) => v.orderable);

/** Extras the customer may pick for this product: only ones the server lists (active, price confirmed). */
export function modifiersFor(product: PublicProduct, menu: PublicMenu): PublicModifier[] {
  const allowed = new Set(product.modifierSlugs);
  if (product.glutenFreeOption) allowed.add(GLUTEN_FREE_SLUG);
  return menu.modifiers.filter((m) => allowed.has(m.slug) && m.compatibleCategories.includes(product.category));
}

/** Price of a modifier for one size, or undefined when the owner hasn't priced it for that size. */
export function modifierPrice(modifier: PublicModifier, variantId: string): number | undefined {
  const price = modifier.priceByVariantSek[variantId];
  return Number.isInteger(price) && price >= 0 ? price : undefined;
}

/**
 * Preview shown in the customiser before anything is validated. It uses only prices the server sent;
 * the cart re-prices every line on the server, and that result is the one that counts.
 */
export function previewUnitPrice(
  product: PublicProduct,
  variantId: string,
  selected: { slug: string; quantity: number }[],
  menu: PublicMenu,
): number | null {
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant || !variant.orderable) return null;
  let total = variant.priceSek;
  for (const s of selected) {
    const modifier = menu.modifiers.find((m) => m.slug === s.slug);
    const price = modifier && modifierPrice(modifier, variantId);
    if (price === undefined) return null;
    total += price * s.quantity;
  }
  return total;
}

/** Defaults the customiser to the first size that can actually be ordered. */
export const firstOrderableVariant = (p: PublicProduct) => p.variants.find((v) => v.orderable);
