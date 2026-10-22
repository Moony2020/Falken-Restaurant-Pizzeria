"use client";

import Image from "next/image";
import { useState } from "react";
import { gallery, galleryFilters, type GalleryItem } from "@/data/gallery";
import { DishArt } from "./art";
import { ArrowIcon, CloseIcon, ExpandIcon } from "./icons";
import { Modal } from "./modal";

/** Cell spans of the mosaic on the two-column phone grid and the four-column desktop grid. */
const sizeClass: Record<GalleryItem["size"], string> = {
  normal: "",
  wide: "col-span-2",
  tall: "row-span-2",
  big: "col-span-2 row-span-2",
};

function Visual({ item, className }: { item: GalleryItem; className: string }) {
  if (item.src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={item.src}
          alt={item.title}
          fill
          sizes="(min-width: 1024px) 400px, 50vw"
          className="object-cover"
        />
      </div>
    );
  }
  return <DishArt category={item.art} seed={item.seed} className={className} />;
}

export function GalleryGrid() {
  const [filter, setFilter] =
    useState<(typeof galleryFilters)[number]["id"]>("alla");
  const [openId, setOpenId] = useState<string | null>(null);

  const items =
    filter === "alla" ? gallery : gallery.filter((g) => g.kind === filter);
  const index = items.findIndex((g) => g.id === openId);
  const current = index >= 0 ? items[index] : undefined;

  const step = (delta: number) =>
    setOpenId(items[(index + delta + items.length) % items.length].id);

  return (
    <div>
      <div
        role="group"
        aria-label="Filtrera bilder"
        className="flex flex-wrap gap-2"
      >
        {galleryFilters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-11 rounded-full border px-5 text-[0.8rem] font-semibold uppercase tracking-[0.1em] transition ${
              filter === f.id
                ? "border-ink bg-ink text-ivory"
                : "border-line bg-white hover:border-gold-deep"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul
        className={`mt-8 grid gap-3 sm:gap-4 ${
          filter === "alla"
            ? "auto-rows-[10rem] grid-flow-dense grid-cols-2 sm:auto-rows-[13rem] lg:grid-cols-4"
            : "grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {items.map((item) => (
          <li
            key={item.id}
            className={
              filter === "alla" ? sizeClass[item.size] : "aspect-[4/3]"
            }
          >
            <button
              type="button"
              onClick={() => setOpenId(item.id)}
              aria-label={`Förstora ${item.title}`}
              className="group relative block size-full overflow-hidden rounded-2xl border-2 border-transparent bg-ink text-left shadow-card transition hover:border-gold focus-visible:border-gold"
            >
              <Visual item={item} className="size-full" />
              <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-3 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-gold backdrop-blur">
                {item.kind === "mat" ? "Maten" : "Restaurangen"}
              </span>
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-ink/95 via-ink/60 to-transparent p-4 pt-14 text-ivory">
                <span className="min-w-0">
                  <span className="block font-display text-lg font-semibold leading-tight sm:text-xl">
                    {item.title}
                  </span>
                  <span className="mt-0.5 hidden text-xs text-ivory/75 sm:line-clamp-2 sm:block">
                    {item.caption}
                  </span>
                </span>
                <ExpandIcon className="size-5 shrink-0 text-gold opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Modal
        open={!!current}
        onClose={() => setOpenId(null)}
        label={current ? current.title : "Bild"}
        className="m-auto w-[calc(100%-1.5rem)] max-w-3xl overflow-hidden rounded-2xl bg-ink p-0 text-ivory shadow-2xl open:animate-rise"
      >
        {current && (
          <div>
            <Visual
              item={current}
              className="aspect-[4/3] max-h-[70dvh] w-full"
            />
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="font-display text-2xl font-semibold">
                {current.title}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Föregående bild"
                  className="grid size-11 place-items-center rounded-full hover:bg-ink-3"
                >
                  <ArrowIcon className="size-5 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Nästa bild"
                  className="grid size-11 place-items-center rounded-full hover:bg-ink-3"
                >
                  <ArrowIcon className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Stäng"
                  className="grid size-11 place-items-center rounded-full hover:bg-ink-3"
                >
                  <CloseIcon className="size-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
