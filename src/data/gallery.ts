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
  aspect: "square" | "portrait" | "landscape";
  src?: string;
};

export const galleryFilters: { id: "alla" | GalleryKind; label: string }[] = [
  { id: "alla", label: "Alla" },
  { id: "mat", label: "Maten" },
  { id: "lokal", label: "Restaurangen" },
];

export const gallery: GalleryItem[] = [
  { id: "falken-special", title: "Falken Special", kind: "mat", art: "pizza", seed: 37, aspect: "square" },
  { id: "matsalen", title: "Matsalen", kind: "lokal", art: "alacarte", seed: 1, aspect: "landscape" },
  { id: "quattro-formaggi", title: "Quattro Formaggi", kind: "mat", art: "pizza", seed: 50, aspect: "portrait" },
  { id: "kebabtallrik", title: "Kebabtallrik", kind: "mat", art: "kebab", seed: 2, aspect: "landscape" },
  { id: "pollo", title: "Pollo à la Falken", kind: "mat", art: "alacarte", seed: 3, aspect: "square" },
  { id: "disken", title: "Vid disken", kind: "lokal", art: "lunch", seed: 4, aspect: "portrait" },
  { id: "hawaii", title: "Hawaii", kind: "mat", art: "pizza", seed: 13, aspect: "landscape" },
  { id: "hamburgare", title: "Hamburgare", kind: "mat", art: "hamburgare", seed: 5, aspect: "square" },
  { id: "utsidan", title: "Utsidan", kind: "lokal", art: "alacarte", seed: 6, aspect: "landscape" },
  { id: "grekisksallad", title: "Grekisk sallad", kind: "mat", art: "sallader", seed: 7, aspect: "portrait" },
  { id: "kebabpizza", title: "Kebabpizza Special", kind: "mat", art: "kebabpizza", seed: 59, aspect: "square" },
  { id: "filemignon", title: "Filé Mignon", kind: "mat", art: "alacarte", seed: 8, aspect: "landscape" },
];
