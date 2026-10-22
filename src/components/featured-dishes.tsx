"use client";

import Link from "next/link";
import { reloadMenu, useMenu } from "@/lib/menu-store";
import { ProductCard } from "./order/product-card";

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

  const featured = state.menu.products.filter((p) => p.featured).slice(0, 3);
  if (featured.length === 0) {
    return (
      <p className="mt-8 text-muted">
        Se hela utbudet i{" "}
        <Link href="/meny" className="font-semibold text-ink underline underline-offset-2">
          menyn
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
      {featured.map((p) => (
        <ProductCard key={p.slug} product={p} />
      ))}
    </ul>
  );
}
