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
      {/* Filter Tabs Centered with Icons */}
      <div
        role="group"
        aria-label="Filtrera bilder"
        className="flex flex-wrap justify-center items-center gap-2.5 sm:gap-3.5 mb-10"
      >
        {galleryFilters.map((f) => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={isActive}
              className={`min-h-11 rounded-full border px-5 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all flex items-center gap-2.5 cursor-pointer shadow-xs ${
                isActive
                  ? "border-[#b88e4d] bg-[#141210] text-white shadow-sm ring-1 ring-[#b88e4d]/40"
                  : "border-[#e5ded2] bg-white text-[#4a453e] hover:border-[#b88e4d] hover:text-[#1c1917] hover:bg-[#faf8f3]"
              }`}
            >
              {f.id === "alla" && (
                <svg
                  viewBox="0 0 24 24"
                  className={`size-4 shrink-0 ${isActive ? "text-[#b88e4d]" : "text-[#7c828d]"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
              )}
              {f.id === "mat" && (
                <svg
                  viewBox="0 0 24 24"
                  className={`size-4 shrink-0 ${isActive ? "text-[#b88e4d]" : "text-[#7c828d]"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 2v8a3 3 0 0 1-3 3h-1m4 7v-7m-4 0v7" />
                  <path d="M4 2v4a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2M6 8v12" />
                </svg>
              )}
              {f.id === "lokal" && (
                <svg
                  viewBox="0 0 24 24"
                  className={`size-4 shrink-0 ${isActive ? "text-[#b88e4d]" : "text-[#7c828d]"}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              )}
              <span>{f.label}</span>
            </button>
          );
        })}
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
