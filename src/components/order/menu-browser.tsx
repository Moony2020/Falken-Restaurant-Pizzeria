"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { dagensLunch, site } from "@/data/site";
import type { MenuLoadFailure } from "@/lib/menu-client";
import { reloadMenu, useMenu } from "@/lib/menu-store";
import type {
  PublicCategory,
  PublicMenu,
  PublicProduct,
} from "@/lib/menu-types";
import { kr } from "@/lib/pricing";
import { MenuHero } from "@/components/menu-hero";
import {
  ArrowIcon,
  ClockIcon,
  PhoneIcon,
} from "@/components/icons";
import { ProductCard, ingredientText } from "./product-card";

// The active tab lives in the URL hash (#pizza) so it can be linked to without making the page dynamic.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const getHash = () => window.location.hash.slice(1);
const getServerHash = () => "";

function setHash(id: string) {
  window.history.pushState(null, "", `#${id}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function groupProducts(
  items: PublicProduct[],
): { name?: string; items: PublicProduct[] }[] {
  const groups: { name?: string; items: PublicProduct[] }[] = [];
  for (const p of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === p.group) last.items.push(p);
    else groups.push({ name: p.group, items: [p] });
  }
  return groups;
}

/** A shared price line is only printed when every size of every dish in the group is confirmed and orderable. */
function groupPrice(items: PublicProduct[]): string | null {
  const first = items[0];
  if (first.variants.length < 2) return null;
  if (!items.every((p) => p.variants.every((v) => v.orderable))) return null;
  const same = items.every((p) =>
    p.variants.every((v, i) => v.priceSek === first.variants[i]?.priceSek),
  );
  return same
    ? first.variants.map((v) => `${v.label} ${kr(v.priceSek)}`).join("  ·  ")
    : null;
}

export function MenuBrowser() {
  const state = useMenu();
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const [query, setQuery] = useState("");

  const menu = state.status === "ready" ? state.menu : null;
  const active = menu
    ? (menu.categories.find((c) => c.slug === hash) ?? menu.categories[0])
    : undefined;

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2 && !!menu;

  const results = useMemo(() => {
    if (!menu || q.length < 2) return [];
    return menu.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        ingredientText(p).toLowerCase().includes(q) ||
        (p.menuNumber !== undefined &&
          `${p.menuNumber}` === q.replace("#", "")),
    );
  }, [menu, q]);

  const selectTab = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setQuery("");
    setHash(id);
    const panel = document.getElementById("menu-panel");
    if (panel && panel.getBoundingClientRect().top < 150)
      panel.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <MenuHero query={query} setQuery={setQuery} disabled={!menu} />

      <div className="sticky top-16 z-30 border-b border-line bg-ivory/95 backdrop-blur sm:top-20">
        <nav
          aria-label="Menykategorier"
          className="wrap py-3"
          aria-busy={state.status === "loading"}
        >
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {menu
              ? menu.categories.map((c) => {
                  const current = !searching && c.slug === active?.slug;
                  return (
                    <li key={c.slug} className="shrink-0">
                      <a
                        href={`#${c.slug}`}
                        onClick={(e) => selectTab(e, c.slug)}
                        aria-current={current ? "true" : undefined}
                        className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[0.75rem] font-semibold uppercase tracking-[0.06em] transition ${
                          current
                            ? "border-ink bg-ink text-ivory"
                            : "border-line bg-white text-ink hover:border-gold-deep"
                        }`}
                      >
                        {c.name}
                      </a>
                    </li>
                  );
                })
              : state.status === "loading" &&
                Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className="shrink-0" aria-hidden="true">
                    <span className="block h-11 w-24 animate-pulse rounded-full bg-cream" />
                  </li>
                ))}
          </ul>
        </nav>
      </div>

      <div id="menu-panel" className="wrap scroll-mt-44 py-10 sm:py-14">
        {state.status === "loading" && <MenuSkeleton />}
        {state.status === "error" && <MenuError reason={state.reason} />}

        {menu && (
          <>
            {searching ? (
              <SearchResults
                items={results}
                query={query}
                onClear={() => setQuery("")}
              />
            ) : active ? (
              <CategoryPanel category={active} menu={menu} onSelect={setHash} />
            ) : (
              <EmptyMenu />
            )}
          </>
        )}
      </div>
    </>
  );
}

function MenuSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Laddar menyn…</span>
      <div
        className="mb-3 h-12 w-64 animate-pulse rounded-lg bg-cream"
        aria-hidden="true"
      />
      <div
        className="mb-10 h-5 w-96 max-w-full animate-pulse rounded bg-cream"
        aria-hidden="true"
      />
      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li
            key={i}
            className="flex gap-4 rounded-2xl border border-line bg-white p-3"
          >
            <span className="size-28 shrink-0 animate-pulse rounded-xl bg-cream sm:size-32" />
            <span className="flex flex-1 flex-col gap-3 py-1">
              <span className="h-6 w-2/3 animate-pulse rounded bg-cream" />
              <span className="h-4 w-full animate-pulse rounded bg-cream" />
              <span className="h-4 w-1/2 animate-pulse rounded bg-cream" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const errorText: Record<MenuLoadFailure, string> = {
  network:
    "Vi fick ingen kontakt med servern. Kontrollera din uppkoppling och försök igen.",
  server: "Vi har tekniska problem just nu och kan inte visa menyn.",
  invalid: "Menyn kunde inte läsas in korrekt.",
};

function MenuError({ reason }: { reason: MenuLoadFailure }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-xl rounded-2xl border border-line bg-white px-6 py-14 text-center shadow-card"
    >
      <p className="font-display text-3xl font-semibold">
        Menyn kunde inte laddas
      </p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        {errorText[reason]}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reloadMenu}
          className="inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-sm font-semibold text-ink transition hover:bg-gold-light"
        >
          Försök igen
        </button>
        <a
          href={site.phoneHref}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/25 px-7 text-sm font-semibold transition hover:bg-ink hover:text-ivory"
        >
          <PhoneIcon className="size-4" /> Ring {site.phone}
        </a>
      </div>
    </div>
  );
}

function EmptyMenu() {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold">
        Menyn är tom just nu
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Vi uppdaterar menyn. Ring oss på{" "}
        <a
          href={site.phoneHref}
          className="font-semibold text-ink underline underline-offset-2"
        >
          {site.phone}
        </a>{" "}
        så hjälper vi dig.
      </p>
    </div>
  );
}

function CategoryPanel({
  category,
  menu,
  onSelect,
}: {
  category: PublicCategory;
  menu: PublicMenu;
  onSelect: (id: string) => void;
}) {
  const items = menu.products.filter((p) => p.category === category.slug);

  return (
    <section aria-labelledby="panel-title" className="animate-fade">
      <header className="mb-8 max-w-2xl">
        <h2
          id="panel-title"
          className="font-display text-4xl font-semibold uppercase tracking-wide sm:text-5xl"
        >
          {category.name}
        </h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
          {category.blurb}
        </p>
        {category.slug === "pizza" &&
          menu.modifiers.some((m) => m.slug === "glutenfri-deg") && (
            <p className="mt-3 inline-block rounded-full bg-cream px-4 py-1.5 text-xs text-muted">
              Glutenfri deg finns som tillval · Allergi? Meddela oss när du
              beställer
            </p>
          )}
      </header>

      {category.slug === "lunch" ? (
        <LunchPanel onSelect={onSelect} />
      ) : items.length === 0 ? (
        <EmptyCategory category={category} />
      ) : (
        <div className="space-y-12">
          {groupProducts(items).map((group) => {
            const price = groupPrice(group.items);
            return (
              <div key={group.name ?? "all"}>
                {group.name && (
                  <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-2">
                    <h3 className="font-display text-2xl font-semibold text-gold-deep">
                      {group.name}
                    </h3>
                    {price && (
                      <p className="text-sm font-medium tabular-nums text-muted">
                        {price}
                      </p>
                    )}
                  </div>
                )}
                <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {group.items.map((p) => (
                    <ProductCard key={p.slug} product={p} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SearchResults({
  items,
  query,
  onClear,
}: {
  items: PublicProduct[];
  query: string;
  onClear: () => void;
}) {
  return (
    <section aria-live="polite">
      <h2 className="font-display text-3xl font-semibold">
        {items.length > 0
          ? `${items.length} träffar för ”${query.trim()}”`
          : `Inga träffar för ”${query.trim()}”`}
      </h2>
      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-muted">
            Prova ett annat sökord, till exempel ”skinka”, ”kebab” eller ett
            pizzanummer.
          </p>
          <button
            type="button"
            onClick={onClear}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-ivory"
          >
            Rensa sökningen
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {items.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyCategory({ category }: { category: PublicCategory }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold">
        {category.name} uppdateras snart
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Vi lägger upp utbudet här inom kort. Fråga gärna när du hämtar eller
        ring oss på{" "}
        <a
          href={site.phoneHref}
          className="font-semibold text-ink underline underline-offset-2"
        >
          {site.phone}
        </a>
        .
      </p>
    </div>
  );
}

function LunchPanel({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-ink p-8 text-ivory">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
          Vardagar
        </p>
        <p className="mt-3 font-display text-6xl font-semibold text-gold tabular-nums">
          {kr(dagensLunch.price)}
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-ivory/85">
          <ClockIcon className="size-5 text-gold" />
          {dagensLunch.days} · {dagensLunch.time}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-dark">
          {dagensLunch.includes}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-dark">
          {dagensLunch.tuesday}
        </p>
        <a
          href={site.phoneHref}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-6 text-sm font-semibold text-ink transition hover:bg-gold-light"
        >
          <PhoneIcon className="size-4" /> Ring och beställ
        </a>
      </div>
      <div className="rounded-2xl border border-line bg-white p-8">
        <h3 className="font-display text-2xl font-semibold">Välj bland</h3>
        <ul className="mt-4 space-y-2 text-sm">
          {dagensLunch.choices.map((c) => (
            <li key={c} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-deep"
              />
              {c}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => onSelect("pizza")}
          className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-deep underline underline-offset-4"
        >
          Se pizzorna 1–29 <ArrowIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
