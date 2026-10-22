// Opening list of paid extras shown in the product customiser, grouped as in src/data/modifier-groups.ts.
//
// The names follow what the owner asked for (extra cheese, bacon, minced meat, ham, prawns, vegetables, sauces, chips).
// The PRICES are provisional: they copy the reference shop the owner pointed at and are NOT confirmed by the
// restaurant. They live in the database (seeded insert-only), so the owner can change any of them later without a
// code change, and re-running the seed never overwrites an edited price. Confirm them before going live.

export type ExtraSeed = { group: "extra" | "gronsaker" | "saser"; label: string; priceSek: number; categories: string[] };

const PIZZAS = ["pizza", "kebabpizza"];

const row = (group: ExtraSeed["group"], priceSek: number, categories: string[], labels: string[]): ExtraSeed[] =>
  labels.map((label) => ({ group, label, priceSek, categories }));

export const EXTRAS: ExtraSeed[] = [
  ...row("extra", 10, PIZZAS, ["Extra ost"]),
  ...row("extra", 20, PIZZAS, ["Bacon", "Köttfärs", "Skinka", "Räkor", "Tonfisk", "Pepperoni", "Kebabkött", "Pommes", "Pizzasallad"]),
  ...row("gronsaker", 10, PIZZAS, ["Champinjoner", "Lök", "Paprika", "Oliver", "Ananas", "Banan", "Tomat", "Ruccola"]),
  ...row("gronsaker", 15, PIZZAS, ["Fetaost"]),
  ...row("saser", 10, [...PIZZAS, "kebab", "hamburgare"], ["Bearnaisesås", "Vitlökssås", "Mild sås", "Kebabsås", "Stark sås", "Ketchup"]),
];

export const extraSlug = (label: string) =>
  `extra-${label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
