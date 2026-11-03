// Menu data transcribed from FALKEN_PROJECT_MASTER_PLAN.md §4.
// Prices are SEK and still need owner sign-off. Items carrying `review` are the ones the plan flags as unconfirmed.

export type CategoryId =
  | "pizza"
  | "kebabpizza"
  | "kebab"
  | "hamburgare"
  | "sallader"
  | "alacarte"
  | "barn"
  | "lunch"
  | "dryck";

export type Variant = { id: string; label: string; price: number };

export type Product = {
  id: string;
  /** Number printed on the physical menu (1–91). */
  number?: number;
  name: string;
  category: CategoryId;
  /** Sub-heading inside a category, e.g. "Klass 2". */
  group?: string;
  ingredients: string[];
  /** Used when the dish has no ingredient list worth showing. */
  description?: string;
  /** Shown in the customiser when the dish needs a choice the form doesn't model yet. */
  choiceHint?: string;
  variants: Variant[];
  glutenFreeOption?: boolean;
  featured?: boolean;
  /** Path under /public, e.g. "/images/dishes/pizza/vesuvio.webp". Falls back to illustrated placeholder. */
  image?: string;
  /** Internal note for the owner review pass; never rendered. */
  review?: string;
  /**
   * Variant ids whose price the owner has not confirmed (plan §4 and §11).
   * The server refuses to sell these until the owner approves them; see priceStatus in the database.
   */
  unconfirmedVariants?: string[];
};

export type Category = {
  id: CategoryId;
  name: string;
  blurb: string;
  /** Whether the customer may untick ingredients. */
  removable: boolean;
};

export const categories: Category[] = [
  {
    id: "pizza",
    name: "Pizza",
    blurb:
      "Våra pizzor bakas med tomatsås och ost. Välj Normal eller Familj och ta bort det du inte vill ha.",
    removable: true,
  },
  {
    id: "kebabpizza",
    name: "Kebabpizza",
    blurb: "Pizzan med kebab – fyra varianter, från mild till mäktig.",
    removable: true,
  },
  {
    id: "kebab",
    name: "Kebab & Rullar",
    blurb: "Kebab, gyros och kyckling i bröd, rulle eller på tallrik.",
    removable: true,
  },
  {
    id: "hamburgare",
    name: "Hamburgare",
    blurb: "Saftiga hamburgare i två storlekar – med eller utan pommes.",
    removable: false,
  },
  {
    id: "sallader",
    name: "Sallader",
    blurb: "Serveras med isbergssallad, tomat, gurka, bröd, majs och dressing.",
    removable: true,
  },
  {
    id: "alacarte",
    name: "À la carte",
    blurb: "Grillat och tillagat från grunden – för dig som vill sitta ner och njuta.",
    removable: false,
  },
  {
    id: "barn",
    name: "Barnmeny",
    blurb: "Lagom portioner för de minsta.",
    removable: false,
  },
  {
    id: "lunch",
    name: "Dagens lunch",
    blurb: "Vardagar hela lunchen – ett fast pris med kaffe och dricka.",
    removable: false,
  },
  {
    id: "dryck",
    name: "Dryck",
    blurb: "Läsk, vatten, juice, kaffe och te.",
    removable: false,
  },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (s: string) => s.split(",").map((x) => cap(x.trim()));
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const single = (price: number): Variant[] => [{ id: "standard", label: "Standard", price }];
const sizes = (normal: number, familj: number): Variant[] => [
  { id: "normal", label: "Normal", price: normal },
  { id: "familj", label: "Familj", price: familj },
];

// ---- Pizza -----------------------------------------------------------------

const TIERS = {
  k1: ["Klass 1", 110, 265],
  k2: ["Klass 2", 120, 275],
  k3: ["Klass 3", 130, 285],
  lyx: ["Lyxpizzor", 135, 310],
  k4: ["Klass 4", 140, 325],
  k5: ["Klass 5", 150, 345],
  premium: ["Premium pizza", 170, 380],
  k6: ["Klass 6", 145, 340],
  k7: ["Klass 7", 155, 350],
  k8: ["Klass 8", 160, 370],
} as const;

type Tier = keyof typeof TIERS;

function getDishImage(category: CategoryId, slugId: string, name: string, ingredients: string): string | undefined {
  const s = slugId.toLowerCase();
  const ing = ingredients.toLowerCase();

  if (category === "pizza") {
    if (s.includes("falken-special")) return "/images/dishes/pizza/falken-special.webp";
    if (s.includes("calzone")) return "/images/dishes/pizza/calzone.webp";
    if (s.includes("margherita")) return "/images/dishes/pizza/margherita.webp";
    if (s.includes("cacciatora") || ing.includes("salami") || ing.includes("pepperoni")) {
      return "/images/dishes/pizza/cacciatora.webp";
    }
    if (s.includes("hawaii") || ing.includes("ananas") || ing.includes("banan")) {
      return "/images/dishes/pizza/hawaii.webp";
    }
    if (
      s.includes("quattro-stagioni") ||
      ing.includes("räkor") ||
      ing.includes("musslor") ||
      ing.includes("tonfisk") ||
      ing.includes("scampi")
    ) {
      return "/images/dishes/pizza/quattro-stagioni.webp";
    }
    if (
      ing.includes("oxfilé") ||
      ing.includes("fläskfilé") ||
      ing.includes("bacon") ||
      ing.includes("bearnaisesås")
    ) {
      return "/images/dishes/pizza/oxfilepizza.webp";
    }
    if (
      s.includes("vegetariana") ||
      s.includes("quattro-formaggi") ||
      s.includes("grekisk") ||
      ing.includes("mozzarella") ||
      ing.includes("fetaost")
    ) {
      return "/images/dishes/pizza/margherita.webp";
    }
    return "/images/dishes/pizza/vesuvio.webp";
  }

  if (category === "kebabpizza") {
    return "/images/dishes/kebab/kebabpizza.webp";
  }

  if (category === "kebab") {
    if (s.includes("rulle") || s.includes("brod") || s.includes("bröd")) {
      return "/images/dishes/kebab/kebabrulle.webp";
    }
    return "/images/dishes/kebab/kebabtallrik.webp";
  }

  if (category === "hamburgare") {
    return "/images/dishes/burgers/hamburgare.webp";
  }

  if (category === "sallader") {
    if (s.includes("rak") || ing.includes("räkor") || s.includes("tonfisk") || ing.includes("tonfisk")) {
      return "/images/dishes/salads/raksallad.webp";
    }
    return "/images/dishes/salads/grekisk-sallad.webp";
  }

  if (category === "barn") {
    if (s.includes("pannkaka")) return "/images/dishes/alacarte/pannkaka.webp";
    return "/images/dishes/alacarte/falken-oxfile-planka.webp";
  }

  if (category === "alacarte") {
    if (s.includes("schnitzel") || s.includes("rodspatta") || s.includes("spätta") || s.includes("salmone") || s.includes("lax")) {
      return "/images/dishes/alacarte/schnitzel.webp";
    }
    return "/images/dishes/alacarte/falken-oxfile-planka.webp";
  }

  return undefined;
}

function pizza(
  number: number,
  name: string,
  ing: string,
  tier: Tier,
  opts: { noBase?: boolean; review?: string; featured?: boolean; unconfirmed?: string[]; singleSize?: boolean; image?: string } = {},
): Product {
  const [group, normal, familj] = TIERS[tier];
  const unconfirmed = new Set(opts.unconfirmed);
  if (tier === "k3") unconfirmed.add("normal"); // 130 kr or 125 kr: the two menus disagree
  // Family size of the other closed pizzas is unconfirmed. A calzone has no family size at all (owner, 2026-10-22).
  if (opts.review === closedReview && !opts.singleSize) unconfirmed.add("familj");
  const own = list(ing);
  const house = own[0].toLowerCase().startsWith("husets tomatsås");
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "pizza",
    group,
    ingredients: house || opts.noBase ? own : ["Tomatsås", "Ost", ...own],
    variants: opts.singleSize ? sizes(normal, familj).slice(0, 1) : sizes(normal, familj),
    glutenFreeOption: true,
    featured: opts.featured,
    image: opts.image ?? getDishImage("pizza", id, name, ing),
    review: opts.review,
    unconfirmedVariants: unconfirmed.size > 0 ? [...unconfirmed] : undefined,
  };
}

const closedReview = "Familjestorlek för inbakad/halvinbakad pizza behöver bekräftas.";

const pizzas: Product[] = [
  pizza(1, "Vesuvio", "skinka", "k1"),
  pizza(2, "Calzone", "skinka", "k1", { singleSize: true }),
  pizza(3, "Bolognese", "köttfärs", "k1"),
  pizza(4, "Margherita", "tomat, ost", "k1", { noBase: true }),

  pizza(5, "Capricosa", "skinka, champinjoner", "k2"),
  pizza(6, "La Busola", "skinka, räkor", "k2"),
  pizza(7, "Bari", "skinka, tonfisk", "k2"),
  pizza(8, "Marinara", "musslor, räkor", "k2"),
  pizza(9, "Calzone Special", "skinka, räkor", "k2", { singleSize: true }),
  pizza(10, "La Mafia", "bacon, lök", "k2"),
  pizza(11, "Cacciatora", "pepperoni salami", "k2"),
  pizza(12, "Romana", "räkor, champinjoner", "k2"),
  pizza(13, "Hawaii", "skinka, ananas", "k2"),
  pizza(14, "Disco", "skinka, köttfärs", "k2"),
  pizza(15, "Malo", "tonfisk, räkor", "k2"),
  pizza(16, "Chiquita", "skinka, banan, curry", "k2"),
  pizza(17, "Palermo", "ananas, banan, curry", "k2"),
  pizza(18, "Mrs Lindberg", "bacon, lök, champinjoner, vitlöksolja", "k2"),

  pizza(19, "Vegetariana", "paprika, champinjoner, lök, oliver, ananas", "k3", {
    review: "Klass 3: 130 kr eller 125 kr för Normal? Två menyer säger olika.",
  }),
  pizza(20, "Jamaica", "skinka, räkor, champinjoner", "k3"),
  pizza(21, "Amigo", "köttfärs, champinjoner, lök, paprika", "k3"),
  pizza(22, "Campino", "skinka, räkor, ananas", "k3"),
  pizza(23, "Bambino", "skinka, champinjoner, ananas", "k3"),
  pizza(24, "Favoriten", "bacon, champinjoner, ägg", "k3"),
  pizza(25, "Frutti del Mare", "musslor, tonfisk, räkor", "k3"),
  pizza(26, "Prima", "skinka, tonfisk, räkor", "k3"),
  pizza(27, "Garpen Special", "pepperoni salami, lök, paprika", "k3"),
  pizza(28, "Quattro Stagioni", "skinka, räkor, musslor, champinjoner, oliver", "k3"),
  pizza(29, "Padrino", "musslor, räkor, oliver, paprika", "k3"),

  pizza(30, "Chami", "fläskfilé, lök, champinjoner, ananas, bearnaisesås", "lyx"),
  pizza(31, "Santbar", "fläskfilé, köttfärs, champinjoner, bearnaisesås", "lyx"),
  pizza(32, "Sorella", "skinka, fläskfilé, lök, bearnaisesås", "lyx"),
  pizza(33, "Vintrosa", "fläskfilé, räkor, sparris, bearnaisesås", "lyx", { review: closedReview }),
  pizza(34, "Hidinge", "fläskfilé, lök, färska tomater, bearnaisesås, pepperoni", "lyx", {
    review: closedReview,
  }),
  pizza(35, "Latorp", "fläskfilé, färska tomater, sparris, bearnaisesås", "lyx"),
  pizza(36, "Napoli", "mozzarella, skinka, oliver, tomat, sparris, paprika", "lyx"),
  pizza(37, "Falken Special", "pepperoni salami, köttfärs, räkor, champinjoner", "lyx", {
    review: closedReview,
    featured: true,
  }),
  pizza(38, "Ingela", "skinka, gorgonzola, crème fraîche", "lyx", { review: closedReview }),
  pizza(39, "Kycklingpizza", "kyckling, banan, champinjoner, curry, bearnaisesås", "lyx"),
  pizza(40, "Mexicana", "tacomix, köttfärs, lök, jalapeño, tacosås, cayennepeppar", "lyx"),
  pizza(41, "Azteka", "tacomix, skinka, jalapeño, tacosås, cayennepeppar", "lyx"),

  pizza(42, "Alcapulco", "tacomix, fläskfilé, tacosås, jalapeño, lök, champinjoner", "k4"),
  pizza(43, "San Fransisco", "fläskfilé, lök, färska tomater, gorgonzola, bearnaisesås", "k4"),
  pizza(44, "Garphyttan", "fläskfilé, sparris, paprika, champinjoner, bearnaisesås", "k4"),
  pizza(45, "Empratori", "kebabkött, köttfärs, lök, curry, pepperoni, bacon, dressing", "k4"),
  pizza(46, "Gondola", "kebabkött, champinjoner, paprika, räkor, dressing, pepperoni", "k4", {
    review: closedReview,
  }),
  pizza(47, "Peter Pan", "skinka, fläskfilé, räkor, champinjoner, färska tomater, bearnaisesås", "k4"),
  pizza(48, "Viking", "kebabkött, isbergssallad, färska tomater, gurka, lök, pepperoni, kebabsås", "k4", {
    review: closedReview,
  }),

  pizza(49, "Lanna Special", "fläskfilé, räkor, paprika, färska tomater, strips, bearnaisesås", "k5"),
  pizza(50, "Quattro Formaggi", "husets tomatsås, mozzarella, gorgonzola, hyvlad parmesan, ruccola", "k5", {
    featured: true,
  }),
  pizza(
    51,
    "Alla Diavola",
    "husets tomatsås, mozzarella, pepperoni salami, färsk chili, grillad paprika, vitlök, pinjenötter",
    "k5",
  ),
  pizza(
    52,
    "Ala Vegetariano",
    "husets tomatsås, mozzarella, fetaost, paprika, tomat, ruccola, hyvlad parmesan",
    "k5",
  ),

  pizza(
    53,
    "Italiano De Mare",
    "husets tomatsås, mozzarella, blåmusslor, räkor, scampi, kammusslor, ruccola, vitlök",
    "premium",
  ),
  pizza(
    54,
    "La Oxfilé Pizza",
    "husets tomatsås, oxfilé, mozzarella, grillad paprika, lök, färska tomater, ruccola, bearnaisesås",
    "premium",
  ),
  pizza(55, "Mezza Luna", "husets tomatsås, mozzarella, fetaost, parmaskinka, ruccola", "premium"),
  pizza(
    56,
    "Charbello",
    "husets tomatsås, parmaskinka, mozzarella, soltorkade tomater, pinjenötter, ruccola",
    "premium",
  ),

  pizza(
    61,
    "Grekisk Pizza",
    "mozzarella, oliver, fetaost, sallad, lök, tomat, soltorkade tomater, ruccola, tzatziki",
    "k6",
    { noBase: true },
  ),
  pizza(62, "Lucas Special", "fläskfilé, champinjoner, lök, vitlöksolja", "k6", {
    review: `${closedReview} Kort meny anger 140 kr istället för 145 kr.`,
    unconfirmed: ["normal", "familj"],
  }),

  pizza(63, "David Special", "skinka, fläskfilé, oxfilé, champinjoner, bearnaisesås", "k7"),
  pizza(64, "Båt Pizza", "skinka, oxfilé, champinjoner, bearnaisesås, pommes", "k7"),
  pizza(65, "Kevins Special", "oxfilé, bacon, ägg, lök, cayennepeppar", "k7"),

  pizza(66, "Chris Special", "skinka, fläskfilé, oxfilé, kebabkött, champinjoner, bearnaisesås, kebabsås", "k8"),
  pizza(67, "ÖSK", "oxfilé, mozzarella, gorgonzola, paprika, champinjoner", "k8"),
];

// ---- Kebabpizza ------------------------------------------------------------

function kebabpizza(number: number, name: string, ing: string, normal: number, familj: number): Product {
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "kebabpizza",
    ingredients: ["Tomatsås", "Ost", ...list(ing)],
    variants: sizes(normal, familj),
    glutenFreeOption: true,
    image: getDishImage("kebabpizza", id, name, ing),
  };
}

const kebabpizzas: Product[] = [
  kebabpizza(57, "Kebabpizza", "kebabkött, champinjoner, lök, pepperoni, sås", 125, 285),
  kebabpizza(58, "Kebabpizza Hawaii", "kebabkött, lök, ananas, pepperoni, gurka, tomat, isbergssallad, sås", 130, 310),
  kebabpizza(59, "Kebabpizza Special", "kebabkött, lök, paprika, pepperoni, gurka, tomat, isbergssallad, sås", 130, 310),
  kebabpizza(60, "Kebabpizza Super", "kebabkött, champinjoner, isbergssallad, gurka, tomat, lök, sås, pommes, pepperoni", 150, 350),
];

// ---- Kebab, gyros, kyckling ------------------------------------------------

const kebabBase = "lök, isbergssallad, tomat, pepperoni, sås";
const proteinReview =
  "Plan: välj nötkött / gyros / kyckling kan vara ett val per rätt – restaurangen bekräftar.";

function kebabItem(
  number: number,
  name: string,
  ing: string,
  price: number,
  review?: string,
  unconfirmedVariants?: string[],
): Product {
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "kebab",
    group: "Kebab, gyros & kyckling",
    ingredients: list(ing),
    variants: single(price),
    image: getDishImage("kebab", id, name, ing),
    review,
    unconfirmedVariants,
  };
}

const kebabs: Product[] = [
  kebabItem(68, "Kebab med Bröd", `kebabkött, ${kebabBase}`, 115, proteinReview),
  kebabItem(69, "Kebabtallrik", `kebabkött, ${kebabBase}`, 125, proteinReview),
  kebabItem(70, "Kebabrulle", `kebabkött, ${kebabBase}`, 125, proteinReview),
  kebabItem(71, "Megarulle med strips", `kebabkött, strips, ${kebabBase}`, 130),
  kebabItem(72, "Falafelrulle", `falafel, ${kebabBase.replace("pepperoni, ", "")}`, 125, "Kontrollera falafelns innehåll och tillbehör.", ["standard"]),
  kebabItem(73, "Falafeltallrik", `falafel, ${kebabBase.replace("pepperoni, ", "")}`, 125, "Kontrollera falafelns innehåll och tillbehör.", ["standard"]),
  kebabItem(74, "Kyckling med Bröd", `kyckling, ${kebabBase}`, 115),
  kebabItem(75, "Kycklingrulle", `kyckling, ${kebabBase}`, 125),
  kebabItem(76, "Kycklingtallrik", `kyckling, ${kebabBase}`, 125),
  kebabItem(77, "Salladsrulle", "ost, skinka, räkor, grönsaker", 125, "Granska allergeninformation."),
  {
    id: "nachotallrik",
    name: "Nachotallrik",
    category: "kebab",
    group: "Nachos",
    ingredients: list("majschipsgratäng, tacokött, ost, sallad, crème fraîche"),
    variants: single(130),
    image: "/images/dishes/kebab/kebabtallrik.webp",
  },
];

// ---- Hamburgare ------------------------------------------------------------

function burger(number: number, name: string, description: string, price: number): Product {
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "hamburgare",
    ingredients: [],
    description,
    variants: single(price),
    image: getDishImage("hamburgare", id, name, description),
  };
}

const burgers: Product[] = [
  burger(78, "Hamburgare 90 g", "90 g hamburgare serverad i bröd.", 90),
  burger(79, "Hamburgare 90 g med pommes", "90 g hamburgare i bröd med pommes.", 105),
  burger(80, "Hamburgare 150 g", "150 g hamburgare serverad i bröd.", 100),
  burger(81, "Hamburgare 150 g med pommes", "150 g hamburgare i bröd med pommes.", 115),
];

// ---- Sallader --------------------------------------------------------------

const saladBase = "isbergssallad, tomat, gurka, bröd, majs, dressing";

function salad(number: number, name: string, ing: string): Product {
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "sallader",
    ingredients: list(`${ing}, ${saladBase}`),
    variants: single(125),
    image: getDishImage("sallader", id, name, ing),
  };
}

const salads: Product[] = [
  salad(82, "Amerikansksallad", "ost, skinka, ananas"),
  salad(83, "Tonfisksallad", "tonfisk, ost, oliver, rödlök"),
  salad(84, "Räksallad", "ost, räkor, svamp"),
  salad(85, "Kycklingsallad", "svamp, rödlök, kyckling"),
  salad(86, "Kebabsallad", "kebabkött, kebabsås, rödlök"),
  salad(87, "Gyrossallad", "gyroskött, kebabsås, rödlök"),
  salad(88, "Grekisksallad", "oliver, fetaost, grönsaker, rödlök"),
];

// ---- Barnmeny --------------------------------------------------------------

function kids(number: number, name: string, ing: string): Product {
  const id = slug(name);
  return {
    id,
    number,
    name,
    category: "barn",
    ingredients: list(ing),
    variants: single(90),
    image: getDishImage("barn", id, name, ing),
  };
}

const kidsMenu: Product[] = [
  kids(89, "Fläskfilé på spett", "fläskfilé, pommes, grönsallad, bearnaisesås"),
  kids(90, "Kycklingfilé på spett", "kycklingfilé, pommes, grönsallad, tzatziki"),
  kids(91, "Pannkaka", "jordgubbssylt, grädde"),
];

// ---- À la carte ------------------------------------------------------------

function carte(
  name: string,
  price: number,
  ing: string,
  extra: { choiceHint?: string; featured?: boolean } = {},
): Product {
  const id = slug(name);
  return {
    id,
    name,
    category: "alacarte",
    ingredients: list(ing),
    variants: single(price),
    image: getDishImage("alacarte", id, name, ing),
    ...extra,
  };
}

const carteMenu: Product[] = [
  carte("Filetto à la Gorgonzola", 259, "grillad oxfilé, ruccolasallad, pommes, gorgonzolasås"),
  carte(
    "Filé Mignon",
    259,
    "grillad oxfilé och fläskfilé, ruccolasallad, grillade/kalla grönsaker, rödvinssås, bearnaisesås",
  ),
  carte("Filé Oscar", 169, "grillad fläskfilé, ruccolasallad, räkor, grillade/kalla grönsaker, bearnaisesås, pommes"),
  carte("Pollo à la Falken", 169, "grillad kyckling på spett, ruccolasallad, tzatziki, pommes", { featured: true }),
  carte("Pepparstek", 259, "grillad oxfilé, ruccolasallad, pepparsås"),
  carte("Rödspätta", 169, "kalla grönsaker, kokt potatis eller pommes, remouladsås", {
    choiceHint: "Skriv i kommentaren om du vill ha kokt potatis eller pommes.",
  }),
  carte("Schnitzel", 169, "kalla grönsaker, stekt potatis eller pommes, bearnaisesås", {
    choiceHint: "Skriv i kommentaren om du vill ha stekt potatis eller pommes.",
  }),
  carte("Oxfilé på planka", 259, "grillad oxfilé, ruccolasallad, grillade/kalla grönsaker, bearnaisesås, rödvinssås"),
  carte("Salmone Delicata", 169, "grillad lax på ruccolasallad, remouladsås, kokt potatis"),
  carte("Mixspett", 169, "grillad kyckling och fläskfilé på spett, ruccolasallad, tzatziki, bearnaisesås, pommes"),
  carte("Fläskfilé på planka", 199, "grillad fläskfilé, ruccolasallad, grillade/kalla grönsaker, bearnaisesås, rödvinssås"),
];

// ---- Dryck -----------------------------------------------------------------

function drink(name: string, price: number, group: string, description: string): Product {
  return {
    id: slug(name),
    name,
    category: "dryck",
    group,
    ingredients: [],
    description,
    variants: single(price),
  };
}

const drinks: Product[] = [
  drink("Coca-Cola Original 33 cl", 25, "Läsk 33 cl", "Klassisk Coca-Cola på burk (33 cl)."),
  drink("Coca-Cola Zero 33 cl", 25, "Läsk 33 cl", "Sockerfri Coca-Cola Zero på burk (33 cl)."),
  drink("Fanta Orange 33 cl", 25, "Läsk 33 cl", "Fanta med frisk apelsinsmak på burk (33 cl)."),
  drink("Fanta Exotic 33 cl", 25, "Läsk 33 cl", "Fanta Exotic med tropisk fruktsmak på burk (33 cl)."),
  drink("Sprite 33 cl", 25, "Läsk 33 cl", "Klassisk Sprite på burk (33 cl)."),
  drink("Trocadero 33 cl", 25, "Läsk 33 cl", "Norrlands nationaldryck med smak av äpple och apelsin (33 cl)."),
  drink("Trocadero Zero 33 cl", 25, "Läsk 33 cl", "Sockerfri Trocadero Zero på burk (33 cl)."),

  drink("Loka Naturell 33 cl", 25, "Vatten & Juice", "Kolsyrat mineralvatten från Bergslagen (33 cl)."),
  drink("Loka Citron 33 cl", 25, "Vatten & Juice", "Kolsyrat mineralvatten med frisk citronsmak (33 cl)."),
  drink("Mer Apelsin 20 cl", 20, "Vatten & Juice", "Fruktdryck utan kolsyra med smak av apelsin (20 cl)."),
  drink("Mer Päron 20 cl", 20, "Vatten & Juice", "Fruktdryck utan kolsyra med smak av päron (20 cl)."),

  drink("Coca-Cola Original 1.5 L", 45, "Läsk 1.5 L", "Klassisk Coca-Cola i stor flaska (1.5 liter)."),
  drink("Coca-Cola Zero 1.5 L", 45, "Läsk 1.5 L", "Sockerfri Coca-Cola Zero i stor flaska (1.5 liter)."),
  drink("Fanta Orange 1.5 L", 45, "Läsk 1.5 L", "Fanta med frisk apelsinsmak i stor flaska (1.5 liter)."),

  drink("Kaffe", 25, "Varma drycker", "Nybryggt kaffe."),
  drink("Te", 25, "Varma drycker", "Varmt te."),
];

export const products: Product[] = [
  ...pizzas,
  ...kebabpizzas,
  ...kebabs,
  ...burgers,
  ...salads,
  ...kidsMenu,
  ...carteMenu,
  ...drinks,
];

const byId = new Map(products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

export function productsIn(category: CategoryId): Product[] {
  return products.filter((p) => p.category === category);
}

export function getCategory(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function lowestPrice(product: Product): number {
  return Math.min(...product.variants.map((v) => v.price));
}
