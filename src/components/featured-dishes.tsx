"use client";

import Link from "next/link";
import Image from "next/image";
import { reloadMenu, useMenu } from "@/lib/menu-store";
import { products as menuSeed } from "@/data/menu";
import { ProductCard } from "./order/product-card";

// Keep the original home-page trio visible when an older catalog record has no featured flag.
// Product details and orderability still come from the live menu API.
const HOME_FEATURED_SLUGS = ["falken-special", "quattro-formaggi", "pollo-a-la-falken"];

/** Home-page highlights. Names and prices come from the menu API like everywhere else. */
export function FeaturedDishes() {
  const state = useMenu();

  if (state.status === "loading") {
    return (
      <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3" role="status" aria-busy="true" aria-label="Laddar utvalda rätter">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-line bg-white p-3" aria-hidden="true">
            <span className="size-28 shrink-0 animate-pulse rounded-xl bg-cream sm:size-32" />
            <span className="flex flex-1 flex-col gap-3 py-1">
              <span className="h-6 w-2/3 animate-pulse rounded bg-cream" />
              <span className="h-4 w-full animate-pulse rounded bg-cream" />
              <span className="h-4 w-1/2 animate-pulse rounded bg-cream" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (state.status === "error") {
    return (
      <div role="alert" className="mt-8 rounded-2xl border border-line bg-white px-6 py-10 text-center">
        <p className="font-display text-2xl font-semibold">Rätterna kunde inte laddas just nu</p>
        <button
          type="button"
          onClick={reloadMenu}
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-gold px-6 text-sm font-semibold text-ink transition hover:bg-gold-light"
        >
          Försök igen
        </button>
      </div>
    );
  }

  const flagged = state.menu.products.filter((p) => p.featured);
  const selected = new Set(flagged.map((product) => product.slug));
  const preferredFallback = HOME_FEATURED_SLUGS.flatMap((slug) => {
    const product = state.menu.products.find((item) => item.slug === slug);
    if (!product || selected.has(product.slug)) return [];
    selected.add(product.slug);
    return [product];
  });
  // Catalogs can use different slugs (or have no featured flags); fill any remaining
  // slots from the live, active menu order instead of hiding the whole section.
  const catalogFallback = state.menu.products.filter((product) => !selected.has(product.slug));
  const featured = [...flagged, ...preferredFallback, ...catalogFallback].slice(0, 3);
  if (featured.length === 0) {
    return (
      <ul className="mt-8 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-3 xl:gap-4 xl:overflow-visible xl:pb-0">
        {menuSeed.filter((product) => product.featured).slice(0, 3).map((product) => (
          <li key={product.id} className="flex w-[84vw] min-w-[300px] max-w-[24rem] shrink-0 snap-start gap-4 rounded-2xl border border-line bg-white p-3.5 shadow-card sm:w-[24rem] sm:p-4 xl:w-full xl:max-w-none">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-xl sm:size-28 md:size-32">
              {product.image ? <Image src={product.image} alt={product.name} fill sizes="(max-width: 640px) 96px, 128px" className="object-cover" /> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  {product.number ? <span className="shrink-0 text-xs font-semibold tabular-nums text-gold-deep">{product.number}.</span> : null}
                  <h3 className="font-display text-lg font-semibold leading-tight sm:text-xl">{product.name}</h3>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{product.description ?? product.ingredients.join(", ")}</p>
              </div>
              <Link href={`/meny#${product.category}`} className="mt-3 inline-flex min-h-9 w-fit items-center rounded-full border border-gold-deep/60 px-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink transition hover:bg-gold">
                Se menyn
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-8 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:grid xl:grid-cols-3 xl:gap-5 xl:overflow-visible xl:pb-0">
      {featured.map((p) => (
        <ProductCard key={p.slug} product={p} featured />
      ))}
    </ul>
  );
}
