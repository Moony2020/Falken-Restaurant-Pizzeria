// How extras are grouped in the customiser, and how many a customer may pick from each group.
// This is presentation + limits only. The extras themselves (names, prices per size) are data owned by the
// restaurant: none are invented here, and a group with no priced extras is simply not shown.
// Plain TypeScript with no imports so both the server (limits) and the browser (layout) can use it.

export type ModifierGroupDef = {
  slug: string;
  titleSv: string;
  hintSv?: string;
  /** "single": pick at most one. "multi": pick several, up to `max` in total. */
  kind: "single" | "multi";
  max: number;
  /** Show only this many rows first, with a "Visa N till" button for the rest. */
  collapseAfter?: number;
  sortOrder: number;
};

export const MODIFIER_GROUPS: ModifierGroupDef[] = [
  { slug: "glutenfri", titleSv: "Glutenfri?", kind: "single", max: 1, sortOrder: 1 },
  {
    slug: "extra",
    titleSv: "Extra ingredienser",
    hintSv: "Lägg till det du vill ha extra",
    kind: "multi",
    max: 10,
    collapseAfter: 5,
    sortOrder: 2,
  },
  { slug: "gronsaker", titleSv: "Grönsaker", hintSv: "Lägg till det du vill ha extra", kind: "multi", max: 10, collapseAfter: 6, sortOrder: 3 },
  { slug: "saser", titleSv: "Såser & tillbehör", kind: "multi", max: 5, collapseAfter: 6, sortOrder: 4 },
];

export const DEFAULT_MODIFIER_GROUP = "extra";
const GLUTEN_FREE_MODIFIER = "glutenfri-deg";

/** Group of a modifier. Older documents have no `groupSlug`: the gluten-free dough is its own group, the rest are extras. */
export function groupOfModifier(slug: string, groupSlug?: string | null): string {
  if (groupSlug) return groupSlug;
  return slug === GLUTEN_FREE_MODIFIER ? "glutenfri" : DEFAULT_MODIFIER_GROUP;
}

export const IF_UNAVAILABLE = ["call", "remove_item", "cancel_order"] as const;
export type IfUnavailable = (typeof IF_UNAVAILABLE)[number];

/** What the customer wants if something in the dish can't be made. Shown to the kitchen with the order. */
export const IF_UNAVAILABLE_LABELS_SV: Record<IfUnavailable, string> = {
  call: "Ring mig",
  remove_item: "Ta bort från min beställning",
  cancel_order: "Avbryt hela beställningen",
};
