"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminCategory } from "@/server/admin-category-editing";

type EditPayload = {
  expectedRevision: number;
  nameSv: string;
  blurbSv: string;
  sortOrder: number;
  removable: boolean;
  active: boolean;
};

type RetryState = { idempotencyKey: string; payload: EditPayload };

const csrf = () =>
  decodeURIComponent(
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("falken_admin_csrf="))
      ?.split("=")[1] ?? "",
  );

const toPayload = (category: AdminCategory): EditPayload => ({
  expectedRevision: category.revision,
  nameSv: category.nameSv,
  blurbSv: category.blurbSv,
  sortOrder: category.sortOrder,
  removable: category.removable,
  active: category.active,
});

const samePayload = (left: EditPayload, right: EditPayload) =>
  JSON.stringify(left) === JSON.stringify(right);

export function AdminCategoriesTab() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [sortBy, setSortBy] = useState<"sortOrder" | "nameSv" | "productCount">("sortOrder");

  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);

  const closeEditor = () => {
    setEditing(null);
    setRetry(null);
    setEditError("");
  };

  const updateEditing = (next: AdminCategory) => {
    setEditing(next);
    setRetry(null);
    setEditError("");
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/catalog/categories", { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte hämta kategorierna från servern.");
      const data = (await response.json()) as { categories: AdminCategory[] };
      setCategories(data.categories ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/catalog/categories", { cache: "no-store" });
        if (!response.ok) throw new Error("Kunde inte hämta kategorierna från servern.");
        const data = (await response.json()) as { categories: AdminCategory[] };
        if (!ignore) {
          setCategories(data.categories ?? []);
          setError("");
        }
      } catch (cause) {
        if (!ignore) setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, []);

  const openEditor = async (slug: string) => {
    setEditError("");
    setRetry(null);
    try {
      const response = await fetch(`/api/admin/catalog/categories/${slug}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte öppna kategorin.");
      const data = (await response.json()) as AdminCategory;
      setEditing(data);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    }
  };

  const save = async () => {
    if (!editing) return;

    if (!editing.nameSv.trim()) {
      setEditError("Kategorinamn på svenska är obligatoriskt.");
      return;
    }

    const latestPayload = toPayload(editing);
    const pending =
      retry && samePayload(retry.payload, latestPayload)
        ? retry
        : { idempotencyKey: crypto.randomUUID(), payload: latestPayload };

    setSaving(true);
    setEditError("");

    try {
      const response = await fetch(`/api/admin/catalog/categories/${editing.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf(),
          "idempotency-key": pending.idempotencyKey,
        },
        body: JSON.stringify(pending.payload),
      });

      const body = (await response.json()) as {
        error?: string;
        category?: AdminCategory;
        issues?: { fieldErrors?: Record<string, string[]> };
      };

      if (response.ok && body.category) {
        setRetry(null);
        setEditing(null);
        await loadCategories();
        return;
      }

      if (response.status === 409 && body.error === "stale_category" && body.category) {
        setRetry(null);
        setEditing(body.category);
        setEditError("Kategorin ändrades av en annan användare. Uppdaterad data har laddats.");
        return;
      }

      if (response.status === 409 && body.error === "idempotency_key_reused") {
        setRetry(null);
        setEditError("Sparnyckeln hör till ett annat innehåll. Gör en ny ändring och försök igen.");
        return;
      }

      if (response.status >= 500) {
        setRetry(pending);
        setEditError("Resultatet kunde inte bekräftas av servern. Försök igen med samma innehåll.");
        return;
      }

      setRetry(null);
      const firstIssue = body.issues?.fieldErrors
        ? Object.values(body.issues.fieldErrors)[0]?.[0]
        : undefined;

      const messages: Record<string, string> = {
        transactions_required: "Säker sparning med databastransaktioner är tillfälligt otillgänglig.",
        not_found: "Kategorin hittades inte.",
        forbidden: "Behörighet saknas för att ändra kategorier.",
      };

      setEditError(
        firstIssue ?? (body.error ? messages[body.error] ?? "Kunde inte spara kategorin." : "Kunde inte spara kategorin."),
      );
    } catch {
      setRetry(pending);
      setEditError("Anslutningen avbröts innan resultatet kunde bekräftas. Försök igen med samma innehåll.");
    } finally {
      setSaving(false);
    }
  };

  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => {
        if (statusFilter === "ACTIVE" && !cat.active) return false;
        if (statusFilter === "INACTIVE" && cat.active) return false;
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          return cat.nameSv.toLowerCase().includes(q) || cat.slug.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "sortOrder") return a.sortOrder - b.sortOrder;
        if (sortBy === "nameSv") return a.nameSv.localeCompare(b.nameSv, "sv");
        if (sortBy === "productCount") return b.productCount - a.productCount;
        return 0;
      });
  }, [categories, query, statusFilter, sortBy]);

  return (
    <section className="space-y-5" aria-labelledby="categories-title">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e2d5] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78347]">Kataloghantering</p>
          <h2 id="categories-title" className="mt-1 font-serif text-3xl font-bold text-[#1f2328]">
            Kategorier
          </h2>
          <p className="mt-1 text-xs text-[#7c828d]">
            Hantera restaurangens mat- och dryckeskategorier, ordning, beskrivningar och synlighet i menyn.
          </p>
        </div>
        <div className="rounded-2xl border border-[#e4ded2] bg-white px-4 py-3 text-right shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c828d]">Kategorier</p>
          <p className="mt-0.5 text-2xl font-bold text-[#1f2328]">{categories.length}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs sm:grid-cols-2 lg:flex lg:items-start lg:pb-0 lg:pt-8">
        <label className="relative block sm:col-span-2 lg:min-w-0 lg:flex-1 lg:-translate-y-2">
          <span className="sr-only">Sök kategori</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c827a]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök kategorinamn eller slug…"
            className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] py-2.5 pl-10 pr-3 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
          />
        </label>

        <label className="relative block lg:w-36 lg:shrink-0 lg:-translate-y-2">
          <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-[#5f625f] lg:absolute lg:-top-5 lg:left-0">Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "ALL" | "ACTIVE" | "INACTIVE")}
            className="block w-full appearance-none rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 pr-10 text-sm font-normal text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:ring-1 focus:ring-[#b88e4d]"
          >
            <option value="ALL">Alla statusar</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="INACTIVE">Inaktiv</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-[calc(50%+0.625rem)] h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a] lg:top-1/2" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </label>

        <label className="relative block lg:w-[12.5rem] lg:shrink-0 lg:-translate-y-2">
          <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-[#5f625f] lg:absolute lg:-top-5 lg:left-0">Sortering</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "sortOrder" | "nameSv" | "productCount")}
            className="block w-full appearance-none rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 pr-10 text-sm font-normal text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:ring-1 focus:ring-[#b88e4d]"
          >
            <option value="sortOrder">Menyordning (stigande)</option>
            <option value="nameSv">Namn (A–Ö)</option>
            <option value="productCount">Antal produkter (flest först)</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-[calc(50%+0.625rem)] h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a] lg:top-1/2" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-[#e7e1d5] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-[840px] w-full text-left">
            <thead className="bg-[#f4f0e6] text-xs font-bold uppercase tracking-wide text-[#5f625f]">
              <tr>
                <th className="px-5 py-3 text-center">Ordning</th>
                <th className="px-5 py-3">Kategori</th>
                <th className="px-5 py-3">Beskrivning</th>
                <th className="px-5 py-3">Produkter</th>
                <th className="px-5 py-3">Borttagning av ingredienser</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Åtgärd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee9df] text-sm">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#7c828d]">
                    Laddar kategorier…
                  </td>
                </tr>
              )}
              {!loading && filteredCategories.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[#7c828d]">
                    Inga kategorier matchar ditt filter.
                  </td>
                </tr>
              )}
              {!loading &&
                filteredCategories.map((cat) => (
                  <tr key={cat.slug} className="hover:bg-[#fcfaf6]">
                    <td className="px-5 py-4 text-center font-mono text-sm font-semibold text-[#8c827a]">
                      <span className="inline-block rounded-md bg-[#faf8f4] px-2.5 py-1 border border-[#e8e2d5]">
                        #{cat.sortOrder}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#1f2328]">{cat.nameSv}</p>
                      <span className="mt-1 inline-block rounded bg-[#f4f0e6] px-1.5 py-0.5 font-mono text-[11px] text-[#765521]">
                        {cat.slug}
                      </span>
                    </td>
                    <td className="px-5 py-4 max-w-xs text-xs text-[#555a64]">
                      {cat.blurbSv ? (
                        <p className="line-clamp-2">{cat.blurbSv}</p>
                      ) : (
                        <span className="italic text-[#9ca3af]">Ingen beskrivning angiven</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <span className="font-semibold text-[#1f2328]">{cat.productCount} st</span>
                      {cat.slug === "lunch" ? (
                        <span className="ml-1.5 text-[11px] text-[#a78347]">(Dagens lunch)</span>
                      ) : (
                        <span className="ml-1 text-[#8c827a]">({cat.activeProductCount} aktiva)</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {cat.removable ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Tillåts
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-stone-500">
                          <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Tillåts ej
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          cat.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${cat.active ? "bg-emerald-500" : "bg-stone-400"}`} />
                        {cat.active ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void openEditor(cat.slug)}
                        className="rounded-lg border border-[#b88e4d] px-3 py-1.5 text-xs font-bold text-[#765521] hover:bg-[#fbf4e7]"
                      >
                        Redigera
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <footer className="border-t border-[#eee9df] bg-[#fbf9f4] px-5 py-3 text-xs text-[#7c828d]">
          Totalt {categories.length} kategorier konfigurerade i restaurangens katalog.
        </footer>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Redigera ${editing.nameSv}`}
            className="my-auto w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e8e2d5] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a78347]">Redigera kategori</p>
                <h3 className="font-serif text-2xl font-bold text-[#1f2328]">{editing.nameSv}</h3>
                <div className="mt-1 flex items-center gap-2">
                  <span className="rounded bg-[#f4f0e6] px-2 py-0.5 font-mono text-xs text-[#765521]">
                    slug: {editing.slug}
                  </span>
                  <span className="text-[11px] text-[#7c828d]">(Identifierare · kan inte ändras)</span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Stäng redigeringsfönstret"
                className="text-2xl font-light text-[#7c828d] hover:text-[#1f2328]"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <label className="block">
                <span className="font-semibold text-[#1f2328]">Kategorinamn (Svenska) *</span>
                <input
                  type="text"
                  required
                  value={editing.nameSv}
                  onChange={(e) => updateEditing({ ...editing, nameSv: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2.5 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                  placeholder="t.ex. Pizza"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-[#1f2328]">Beskrivning (Svenska)</span>
                <textarea
                  rows={3}
                  value={editing.blurbSv}
                  onChange={(e) => updateEditing({ ...editing, blurbSv: e.target.value })}
                  className="mt-1 block w-full rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                  placeholder="Kort beskrivning som visas under kategorirubriken i menyn…"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-[#1f2328]">Sorteringsordning i menyn</span>
                <input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => updateEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  className="mt-1 block w-full max-w-xs rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                />
                <span className="mt-1 block text-xs text-[#7c828d]">
                  Lägre siffra visas först i menyflikarna (t.ex. 1 för första fliken).
                </span>
              </label>

              {/* REMOVABLE PROPERTY: Clearly labeled */}
              <div className="rounded-2xl border border-[#e7e1d5] bg-[#faf8f4] p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.removable}
                    onChange={(e) => updateEditing({ ...editing, removable: e.target.checked })}
                    className="mt-1 size-4 rounded border-gray-300 text-[#a78347] focus:ring-[#a78347]"
                  />
                  <div>
                    <span className="font-semibold text-[#1f2328]">Tillåt borttagning av ingredienser</span>
                    <p className="mt-0.5 text-xs text-[#555a64]">
                      Gör det möjligt för kunder att välja bort ingredienser (t.ex. utan lök eller pizzasås) vid anpassning av rätter i denna kategori.
                    </p>
                    <p className="mt-1 text-[11px] text-[#7c828d]">
                      * Obs: Denna inställning påverkar ingrediensval vid beställning och innebär inte borttagning eller radering av kategorin.
                    </p>
                  </div>
                </label>
              </div>

              {/* ACTIVE STATUS */}
              <div className="rounded-2xl border border-[#e7e1d5] p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editing.active}
                    onChange={(e) => updateEditing({ ...editing, active: e.target.checked })}
                    className="mt-1 size-4 rounded border-gray-300 text-[#a78347] focus:ring-[#a78347]"
                  />
                  <div>
                    <span className="font-semibold text-[#1f2328]">Aktiv kategori</span>
                    <p className="mt-0.5 text-xs text-[#555a64]">
                      Styr om kategorin visas på webbplatsen och i den publika menyn.
                    </p>
                  </div>
                </label>

                {/* WARNING BANNER IF INACTIVATING CATEGORY WITH PRODUCTS */}
                {!editing.active && editing.productCount > 0 && (
                  <div
                    role="alert"
                    className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1"
                  >
                    <p className="font-bold flex items-center gap-1.5">
                      <svg className="size-4 shrink-0 text-amber-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Varning vid inaktivering:
                    </p>
                    <p>
                      Om du inaktiverar denna kategori döljs alla kopplade produkter ({editing.productCount} st) från menyn och kan inte beställas av kunder.
                    </p>
                  </div>
                )}

                {/* LUNCH SPECIAL INFO */}
                {editing.slug === "lunch" && (
                  <p className="mt-2 text-xs text-[#a78347]">
                    ℹ Lunchkategorin styr visningen av Dagens lunch-fliken på menyn. Produkterna baseras på ordinarie lunchutbud.
                  </p>
                )}
              </div>

              {editError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <p>{editError}</p>
                  {retry && (
                    <button
                      type="button"
                      onClick={() => void save()}
                      className="mt-2 font-semibold underline text-red-900 block"
                    >
                      Försök igen med samma sparning
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e8e2d5] pt-4">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-xl border border-[#e4ded2] bg-white px-5 py-2.5 text-sm font-semibold text-[#555a64] hover:bg-black/5"
              >
                Avbryt
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl bg-[#a78347] px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-[#96743b] disabled:opacity-50"
              >
                {saving ? "Sparar…" : retry ? "Försök igen" : "Spara ändringar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
