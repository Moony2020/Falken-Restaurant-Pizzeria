// Single source of truth for restaurant contact info and opening hours.
// Values come from FALKEN_PROJECT_MASTER_PLAN.md §10; the owner must confirm them before launch.

import type { Season } from "../lib/hours";

export const site = {
  name: "Falken",
  legalName: "Restaurang & Pizzeria Falken",
  tagline: "Restaurang & Pizzeria",
  url: "https://restaurangfalken.se",
  phone: "019 29 48 98",
  phoneHref: "tel:+4619294898",
  email: "djan_ibrahim@hotmail.com",
  address: {
    street: "Skolgatan 4",
    zip: "719 30",
    city: "Vintrosa",
    country: "Sverige",
  },
} as const;

export const mapsUrl =
  "https://www.google.com/maps/search/?api=1&query=Restaurang+%26+Pizzeria+Falken%2C+Skolgatan+4%2C+719+30+Vintrosa";

/** Path under /public of a real hero photo, e.g. "/images/hero.jpg". While null, an illustrated pizza is shown. */
export const heroImage: string | null = null;

export const nav = [
  { href: "/", label: "Hem" },
  { href: "/meny", label: "Meny" },
  { href: "/galleri", label: "Galleri" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

/** Which opening-hours set applies today. Season switch dates are an owner decision (plan §10). */
export const CURRENT_SEASON: Season = "vinter";

export type { Season };

/** Minutes the kitchen needs before an order is ready, and how long before closing the last pickup is offered. */
export const PREP_MINUTES = 25;
export const LAST_PICKUP_BEFORE_CLOSE = 15;
export const SLOT_STEP_MINUTES = 15;
/** Clock-drift slack and furthest-ahead pickup the server accepts. */
export const PICKUP_GRACE_MINUTES = 5;
export const PICKUP_MAX_AHEAD_HOURS = 24;

export const dagensLunch = {
  price: 115,
  days: "Måndag–Fredag",
  time: "11:00–14:00",
  includes: "Kaffe, bröd, smör, pizzasallad och dricka ingår.",
  choices: [
    "Pizza nr 1–29",
    "Black and White (fläskfilé, pommes, bearnaise, rödvinssås)",
    "Schnitzel med pommes och bearnaisesås",
    "Mixspett",
    "Rödspätta",
    "Kebabtallrik (gyros eller nötkött)",
    "Kycklingtallrik",
    "Sallader",
    "Hamburgare",
  ],
  tuesday: "På tisdagar serveras även raggmunk med fläsk.",
} as const;

/** Display rows for the contact page and footer. */
export const hoursDisplay: Record<Season, { days: string; time: string }[]> = {
  vinter: [
    { days: "Måndag–Torsdag", time: "11:00–21:00" },
    { days: "Fredag", time: "11:00–22:00" },
    { days: "Lördag", time: "12:00–22:00" },
    { days: "Söndag", time: "12:00–21:00" },
  ],
  sommar: [
    { days: "Måndag–Fredag", time: "11:00–22:00" },
    { days: "Lördag–Söndag", time: "12:00–22:00" },
  ],
};

/** Path under /public of a real photo for the menu page banner (a round crop of a pizza works best). While null, an illustration is shown. */
export const menuHeroImage: string | null = null;
