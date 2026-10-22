import type { Product } from "../data/menu";

/** Plan §4: gluten-free dough adds 30 kr to the pizza price. */
export const GLUTEN_FREE_SURCHARGE = 30;

export type LineOptions = {
  variantId: string;
  glutenFree?: boolean;
  quantity: number;
};

/** Price for one unit. Throws for an unknown variant so a bad cart line never silently prices at 0. */
export function unitPrice(product: Product, variantId: string, glutenFree = false): number {
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) throw new Error(`Unknown variant "${variantId}" for ${product.id}`);
  const surcharge = glutenFree && product.glutenFreeOption ? GLUTEN_FREE_SURCHARGE : 0;
  return variant.price + surcharge;
}

export function lineTotal(product: Product, { variantId, glutenFree, quantity }: LineOptions): number {
  return unitPrice(product, variantId, glutenFree) * quantity;
}

const nf = new Intl.NumberFormat("sv-SE");

export function kr(amount: number): string {
  return `${nf.format(amount)} kr`;
}
