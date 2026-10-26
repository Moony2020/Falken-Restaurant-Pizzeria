import type { CategoryId } from "./menu";

// Gallery entries. Until real photos exist (plan §9, phase 1) tiles render illustrated placeholders.
// To add a photo: put the file in /public/images/gallery and set `src`.

export type GalleryKind = "mat" | "lokal";

export type GalleryItem = {
  id: string;
  title: string;
  kind: GalleryKind;
  /** Which illustration to show while `src` is missing. */
  art: CategoryId;
  seed: number;
  /** Tile size in the "Alla" mosaic: normal 1x1, wide 2x1, tall 1x2, big 2x2. */
  size: "normal" | "wide" | "tall" | "big";
  /** One line shown under the title. */
  caption: string;
  src?: string;
};

export const galleryFilters: { id: "alla" | GalleryKind; label: string }[] = [
  { id: "alla", label: "Alla" },
  { id: "mat", label: "Maten" },
  { id: "lokal", label: "Restaurangen" },
];

// Order and sizes are chosen so the four-column mosaic has no holes (6 rows x 4 columns, packed densely).
export const gallery: GalleryItem[] = [
  {
    id: "falken-special",
    title: "Falken Special",
    kind: "mat",
    art: "pizza",
    seed: 37,
    size: "big",
    caption: "Pizza bakad på beställning.",
    src: "/images/gallery/falken-special.jpg",
  },
  {
    id: "matsalen",
    title: "Matsalen",
    kind: "lokal",
    art: "alacarte",
    seed: 1,
    size: "wide",
    caption: "Vår matsal i Vintrosa.",
    src: "/images/gallery/matsalen.jpg",
  },
  {
    id: "kebabtallrik",
    title: "Kebabtallrik",
    kind: "mat",
    art: "kebab",
    seed: 2,
    size: "normal",
    caption: "Gyros eller nötkött.",
    src: "/images/gallery/kebabtallrik.jpg",
  },
  {
    id: "pollo",
    title: "Pollo à la Falken",
    kind: "mat",
    art: "alacarte",
    seed: 3,
    size: "normal",
    caption: "À la carte.",
  },
  {
    id: "quattro-formaggi",
    title: "Quattro Formaggi",
    kind: "mat",
    art: "pizza",
    seed: 50,
    size: "tall",
    caption: "Fyra sorters ost.",
  },
  {
    id: "hawaii",
    title: "Hawaii",
    kind: "mat",
    art: "pizza",
    seed: 13,
    size: "wide",
    caption: "Skinka och ananas.",
  },
  {
    id: "grekisksallad",
    title: "Grekisk sallad",
    kind: "mat",
    art: "sallader",
    seed: 7,
    size: "tall",
    caption: "Fräsch och mättande.",
    src: "/images/gallery/grekisksallad.jpg",
  },
  {
    id: "hamburgare",
    title: "Hamburgare",
    kind: "mat",
    art: "hamburgare",
    seed: 5,
    size: "normal",
    caption: "Med eller utan pommes.",
    src: "/images/gallery/hamburgare.jpg",
  },
  {
    id: "disken",
    title: "Vid disken",
    kind: "lokal",
    art: "lunch",
    seed: 4,
    size: "normal",
    caption: "Hämta din beställning här.",
  },
  {
    id: "kebabpizza",
    title: "Kebabpizza Special",
    kind: "mat",
    art: "kebabpizza",
    seed: 59,
    size: "big",
    caption: "Kebabpizza.",
    src: "/images/gallery/kebabpizza.jpg",
  },
  {
    id: "utsidan",
    title: "Utsidan",
    kind: "lokal",
    art: "alacarte",
    seed: 6,
    size: "wide",
    caption: "Skolgatan 4, Vintrosa.",
  },
  {
    id: "filemignon",
    title: "Filé Mignon",
    kind: "mat",
    art: "alacarte",
    seed: 8,
    size: "wide",
    caption: "À la carte.",
  },
];
