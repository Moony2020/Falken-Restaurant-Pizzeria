"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { categories, productsIn, products, type Category, type CategoryId, type Product } from "@/data/menu";
import { dagensLunch, site } from "@/data/site";
import { kr } from "@/lib/pricing";
import { ArrowIcon, CartIcon, ClockIcon, PhoneIcon, SearchIcon } from "@/components/icons";
import { useOrder } from "./order-provider";
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

function groupProducts(items: Product[]): { name?: string; items: Product[] }[] {
  const groups: { name?: string; items: Product[] }[] = [];
  for (const p of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === p.group) last.items.push(p);
    else groups.push({ name: p.group, items: [p] });
  }
  return groups;
}

function groupPrice(items: Product[]): string | null {
  const first = items[0];
  if (first.variants.length < 2) return null;
  const same = items.every((p) => p.variants.every((v, i) => v.price === first.variants[i].price));
  if (!same) return null;
  return first.variants.map((v) => `${v.label} ${kr(v.price)}`).join("  ·  ");
}

export function MenuBrowser() {
  const hash = useSyncExternalStore(subscribeHash, getHash, getServerHash);
  const active: CategoryId = categories.some((c) => c.id === hash) ? (hash as CategoryId) : "pizza";
  const [query, setQuery] = useState("");
  const { count, subtotal, openCart } = useOrder();

  const q = query.trim().toLowerCase();
  const searching = q.length >= 2;

  const results = useMemo(() => {
    if (!searching) return [];
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        ingredientText(p).toLowerCase().includes(q) ||
        (p.number !== undefined && `${p.number}` === q.replace("#", "")),
    );
  }, [q, searching]);

  const selectTab = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setQuery("");
    setHash(id);
    const panel = document.getElementById("menu-panel");
    if (panel && panel.getBoundingClientRect().top < 150) panel.scrollIntoView({ block: "start" });
  };

  const category = categories.find((c) => c.id === active) as Category;

  return (
    <>
      <div className="sticky top-20 z-30 border-b border-line bg-ivory/95 backdrop-blur sm:top-24">
        <nav aria-label="Menykategorier" className="wrap py-3">
          <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 lg:flex-wrap lg:overflow-visible lg:pb-0">
            {categories.map((c) => {
              const current = !searching && c.id === active;
              return (
                <li key={c.id} className="shrink-0">
                  <a
                    href={`#${c.id}`}
                    onClick={(e) => selectTab(e, c.id)}
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
            })}
          </ul>
        </nav>
      </div>

      <div id="menu-panel" className="wrap scroll-mt-44 py-10 sm:py-14">
        <div className="relative mb-8 w-full sm:ml-auto sm:max-w-sm">
          <label htmlFor="menu-search" className="sr-only">
            Sök i menyn
          </label>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök rätt, ingrediens eller nummer"
            className="min-h-12 w-full rounded-full border border-line bg-white pl-12 pr-4 text-sm placeholder:text-muted/70"
          />
        </div>
        {searching ? (
          <SearchResults items={results} query={query} onClear={() => setQuery("")} />
        ) : (
          <CategoryPanel category={category} onSelect={(id) => setHash(id)} />
        )}
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 lg:hidden">
          <button
            type="button"
            onClick={openCart}
            className="mx-auto flex min-h-14 w-full max-w-md items-center justify-between rounded-full bg-ink px-6 text-ivory shadow-2xl"
          >
            <span className="flex items-center gap-3 text-sm font-semibold">
              <span className="relative">
                <CartIcon className="size-6" />
                <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[0.7rem] font-bold leading-5 text-ink">
                  {count}
                </span>
              </span>
              Visa varukorg
            </span>
            <span className="font-semibold tabular-nums text-gold">{kr(subtotal)}</span>
          </button>
        </div>
      )}
    </>
  );
}

function CategoryPanel({ category, onSelect }: { category: Category; onSelect: (id: CategoryId) => void }) {
  const items = productsIn(category.id);

  return (
    <section aria-labelledby="panel-title" className="animate-fade">
      <header className="mb-8 max-w-2xl">
        <h2 id="panel-title" className="font-display text-4xl font-semibold uppercase tracking-wide sm:text-5xl">
          {category.name}
        </h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{category.blurb}</p>
        {category.id === "pizza" && (
          <p className="mt-3 inline-block rounded-full bg-cream px-4 py-1.5 text-xs text-muted">
            Glutenfri deg +30 kr · Allergi? Meddela oss när du beställer
          </p>
        )}
      </header>

      {category.id === "lunch" ? (
        <LunchPanel onSelect={onSelect} />
      ) : items.length === 0 ? (
        <EmptyCategory category={category} />
      ) : (
        <div className="space-y-12">
          {groupProducts(items).map((group) => (
            <div key={group.name ?? "all"}>
              {group.name && (
                <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-2">
                  <h3 className="font-display text-2xl font-semibold text-gold-deep">{group.name}</h3>
                  {groupPrice(group.items) && (
                    <p className="text-sm font-medium tabular-nums text-muted">{groupPrice(group.items)}</p>
                  )}
                </div>
              )}
              <ul className="grid gap-4 lg:grid-cols-2">
                {group.items.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SearchResults({ items, query, onClear }: { items: Product[]; query: string; onClear: () => void }) {
  return (
    <section aria-live="polite">
      <h2 className="font-display text-3xl font-semibold">
        {items.length > 0 ? `${items.length} träffar för ”${query.trim()}”` : `Inga träffar för ”${query.trim()}”`}
      </h2>
      {items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-muted">Prova ett annat sökord, till exempel ”skinka”, ”kebab” eller ett pizzanummer.</p>
          <button
            type="button"
            onClick={onClear}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-sm font-semibold text-ivory"
          >
            Rensa sökningen
          </button>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyCategory({ category }: { category: Category }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-14 text-center">
      <p className="font-display text-2xl font-semibold">{category.name} uppdateras snart</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Vi lägger upp vårt dryckesutbud här inom kort. Fråga gärna när du hämtar eller ring oss på{" "}
        <a href={site.phoneHref} className="font-semibold text-ink underline underline-offset-2">
          {site.phone}
        </a>
        .
      </p>
    </div>
  );
}

function LunchPanel({ onSelect }: { onSelect: (id: CategoryId) => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-2xl bg-ink p-8 text-ivory">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Vardagar</p>
        <p className="mt-3 font-display text-6xl font-semibold text-gold tabular-nums">{kr(dagensLunch.price)}</p>
        <p className="mt-4 flex items-center gap-2 text-sm text-ivory/85">
          <ClockIcon className="size-5 text-gold" />
          {dagensLunch.days} · {dagensLunch.time}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-dark">{dagensLunch.includes}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-dark">{dagensLunch.tuesday}</p>
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
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-deep" />
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
