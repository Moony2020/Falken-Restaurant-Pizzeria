"use client";

import { useEffect, useState } from "react";
import type { AdminCatalogProductsResponse } from "@/server/admin-catalog";
type EditableProduct = {
  slug: string;
  categorySlug: string;
  nameSv: string;
  descriptionSv: string;
  image: string;
  active: boolean;
  sortOrder: number;
  revision: number;
  variants: {
    id: string;
    label: string;
    priceSek: number;
    available: boolean;
    priceStatus: "confirmed" | "needs_review";
  }[];
  ingredients?: string[];
};

type EditPayload = {
  expectedRevision: number;
  nameSv: string;
  descriptionSv: string;
  image: string;
  active: boolean;
  sortOrder: number;
  variants: EditableProduct["variants"];
  ingredients?: string[];
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

const money = (value: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value)} kr`;

const toPayload = (product: EditableProduct): EditPayload => ({
  expectedRevision: product.revision,
  nameSv: product.nameSv,
  descriptionSv: product.descriptionSv,
  image: product.image,
  active: product.active,
  sortOrder: product.sortOrder,
  variants: product.variants,
  ingredients: product.ingredients,
});

const samePayload = (left: EditPayload, right: EditPayload) =>
  JSON.stringify(left) === JSON.stringify(right);

export function AdminProductsTab() {
  const [data, setData] = useState<AdminCatalogProductsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);

  // Ingredient management state
  const [newIngredientInput, setNewIngredientInput] = useState("");
  const [ingredientError, setIngredientError] = useState("");
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [editingIngredientValue, setEditingIngredientValue] = useState("");
  const [confirmEmptyIngredients, setConfirmEmptyIngredients] = useState(false);

  const closeEditor = () => {
    setEditing(null);
    setRetry(null);
    setEditError("");
    setIngredientError("");
    setNewIngredientInput("");
    setEditingIngredientIndex(null);
    setEditingIngredientValue("");
    setConfirmEmptyIngredients(false);
  };

  const updateEditing = (next: EditableProduct) => {
    setEditing(next);
    setRetry(null);
    setEditError("");
  };

  const openEditor = async (slug: string) => {
    setEditError("");
    setRetry(null);
    setIngredientError("");
    setNewIngredientInput("");
    setEditingIngredientIndex(null);
    setEditingIngredientValue("");
    setConfirmEmptyIngredients(false);
    try {
      const response = await fetch(`/api/admin/catalog/products/${slug}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte öppna produkten.");
      const product = (await response.json()) as EditableProduct;
      // Ensure ingredients array is initialized if present
      setEditing({
        ...product,
        ingredients: Array.isArray(product.ingredients) ? product.ingredients : [],
      });
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    }
  };

  const handleAddIngredient = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editing) return;
    const trimmed = newIngredientInput.trim();
    if (!trimmed) {
      setIngredientError("Skriv namnet på ingrediensen.");
      return;
    }
    if (trimmed.length > 60) {
      setIngredientError("Ingrediensen kan max vara 60 tecken.");
      return;
    }
    const currentList = editing.ingredients ?? [];
    if (currentList.length >= 30) {
      setIngredientError("Max 30 ingredienser per produkt.");
      return;
    }
    const normalizedNew = trimmed.toLowerCase();
    if (currentList.some((ing) => ing.trim().toLowerCase() === normalizedNew)) {
      setIngredientError("Ingrediensen finns redan i receptet.");
      return;
    }

    updateEditing({
      ...editing,
      ingredients: [...currentList, trimmed],
    });
    setNewIngredientInput("");
    setIngredientError("");
  };

  const handleRemoveIngredient = (indexToRemove: number) => {
    if (!editing) return;
    const currentList = editing.ingredients ?? [];
    const updated = currentList.filter((_, idx) => idx !== indexToRemove);
    updateEditing({
      ...editing,
      ingredients: updated,
    });
    if (editingIngredientIndex === indexToRemove) {
      setEditingIngredientIndex(null);
      setEditingIngredientValue("");
    }
    setIngredientError("");
  };

  const startInlineEdit = (index: number) => {
    if (!editing) return;
    setEditingIngredientIndex(index);
    setEditingIngredientValue(editing.ingredients?.[index] ?? "");
    setIngredientError("");
  };

  const saveInlineEdit = () => {
    if (!editing || editingIngredientIndex === null) return;
    const trimmed = editingIngredientValue.trim();
    if (!trimmed) {
      setIngredientError("Ingrediensen får inte vara tom.");
      return;
    }
    if (trimmed.length > 60) {
      setIngredientError("Ingrediensen kan max vara 60 tecken.");
      return;
    }
    const currentList = editing.ingredients ?? [];
    const normalizedNew = trimmed.toLowerCase();
    const isDuplicate = currentList.some(
      (ing, idx) => idx !== editingIngredientIndex && ing.trim().toLowerCase() === normalizedNew,
    );
    if (isDuplicate) {
      setIngredientError("Ingrediensen finns redan i receptet.");
      return;
    }

    const updated = currentList.map((item, idx) => (idx === editingIngredientIndex ? trimmed : item));
    updateEditing({
      ...editing,
      ingredients: updated,
    });
    setEditingIngredientIndex(null);
    setEditingIngredientValue("");
    setIngredientError("");
  };

  const moveIngredient = (index: number, direction: "up" | "down") => {
    if (!editing) return;
    const currentList = [...(editing.ingredients ?? [])];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentList.length) return;
    const [moved] = currentList.splice(index, 1);
    currentList.splice(targetIndex, 0, moved);
    updateEditing({
      ...editing,
      ingredients: currentList,
    });
    setIngredientError("");
  };

  const save = async () => {
    if (!editing) return;
    const currentIngredients = editing.ingredients ?? [];
    // If the product currently has 0 ingredients, require explicit admin confirmation to prevent accidental wipe
    if (currentIngredients.length === 0 && !confirmEmptyIngredients) {
      setEditError("Bekräfta att rätten ska sparas helt utan ingredienser genom att bocka i rutan.");
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
      const response = await fetch(`/api/admin/catalog/products/${editing.slug}`, {
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
        product?: EditableProduct;
        issues?: { fieldErrors?: { variants?: string[]; ingredients?: string[]; nameSv?: string[] } };
      };
      if (response.ok) {
        setRetry(null);
        setEditing(null);
        setPage(1);
        return;
      }
      if (response.status === 409 && body.error === "stale_product" && body.product) {
        setRetry(null);
        setEditing(body.product);
        setEditError("Produkten ändrades av en annan användare. Uppdaterad data har laddats.");
        return;
      }
      if (response.status === 409 && body.error === "idempotency_key_reused") {
        setRetry(null);
        setEditError("Sparnyckeln hör till ett annat innehåll. Gör en ny ändring och försök igen.");
        return;
      }
      if (response.status >= 500) {
        setRetry(pending);
        setEditError("Resultatet kunde inte bekräftas. Försök igen med samma innehåll.");
        return;
      }
      setRetry(null);
      const ingredientsError = body.issues?.fieldErrors?.ingredients?.[0];
      const variantsError = body.issues?.fieldErrors?.variants?.[0];
      const messages: Record<string, string> = {
        invalid_image_reference: "Bildreferensen måste redan vara godkänd i katalogen.",
        variant_set_changed: "Produktens storlekar har ändrats. Ladda om och försök igen.",
        transactions_required: "Säker sparning är tillfälligt otillgänglig.",
      };
      setEditError(
        ingredientsError ??
          variantsError ??
          (body.error ? messages[body.error] ?? "Kunde inte spara produkten." : "Kunde inte spara produkten."),
      );
    } catch {
      setRetry(pending);
      setEditError("Anslutningen avbröts innan resultatet kunde bekräftas. Försök igen med samma innehåll.");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20", category, status, q: query.trim() });
        const response = await fetch(`/api/admin/catalog/products?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Kunde inte hämta produkterna från servern.");
        setData(await response.json() as AdminCatalogProductsResponse);
        setError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query ? 200 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [page, category, status, query]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const changeFilter = (next: { category?: string; status?: "ALL" | "ACTIVE" | "INACTIVE"; query?: string }) => {
    if (next.category !== undefined) setCategory(next.category);
    if (next.status !== undefined) setStatus(next.status);
    if (next.query !== undefined) setQuery(next.query);
    setPage(1);
  };

  return (
    <section className="space-y-5" aria-labelledby="products-title">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e2d5] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78347]">Read-only katalog</p>
          <h2 id="products-title" className="mt-1 font-serif text-3xl font-bold text-[#1f2328]">Meny &amp; Produkter</h2>
          <p className="mt-1 text-xs text-[#7c828d]">Visar aktuella produkter från restaurangens katalog. Ändring kommer i en senare, separat fas.</p>
        </div>
        <div className="rounded-2xl border border-[#e4ded2] bg-white px-4 py-3 text-right shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c828d]">Produkter</p>
          <p className="mt-0.5 text-2xl font-bold text-[#1f2328]">{data?.total ?? "—"}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs sm:grid-cols-2 lg:flex lg:items-start lg:pb-0 lg:pt-8">
        <label className="relative block sm:col-span-2 lg:min-w-0 lg:flex-1 lg:-translate-y-2">
          <span className="sr-only">Sök produkt</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c827a]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={query} onChange={(event) => changeFilter({ query: event.target.value })} placeholder="Sök produktnamn eller slug…" className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] py-2.5 pl-10 pr-3 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white" />
        </label>
        <label className="relative block lg:w-44 lg:shrink-0 lg:-translate-y-2">
          <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-[#5f625f] lg:absolute lg:-top-5 lg:left-0">Kategori</span>
          <select value={category} onChange={(event) => changeFilter({ category: event.target.value })} className="block w-full appearance-none rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 pr-10 text-sm font-normal text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:ring-1 focus:ring-[#b88e4d]">
            <option value="ALL">Alla kategorier</option>
            {data?.categories.map((item) => <option key={item.slug} value={item.slug}>{item.nameSv}</option>)}
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-[calc(50%+0.625rem)] h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a] lg:top-1/2" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" /></svg>
        </label>
        <label className="relative block lg:w-36 lg:shrink-0 lg:-translate-y-2">
          <span className="mb-1 block whitespace-nowrap text-xs font-semibold text-[#5f625f] lg:absolute lg:-top-5 lg:left-0">Status</span>
          <select value={status} onChange={(event) => changeFilter({ status: event.target.value as "ALL" | "ACTIVE" | "INACTIVE" })} className="block w-full appearance-none rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 pr-10 text-sm font-normal text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:ring-1 focus:ring-[#b88e4d]">
            <option value="ALL">Alla statusar</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="INACTIVE">Inaktiv</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-[calc(50%+0.625rem)] h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a] lg:top-1/2" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" /></svg>
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-[#e7e1d5] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left">
            <thead className="bg-[#f4f0e6] text-xs font-bold uppercase tracking-wide text-[#5f625f]">
              <tr><th className="px-5 py-3">Produkt</th><th className="px-5 py-3">Kategori</th><th className="px-5 py-3">Pris</th><th className="px-5 py-3">Tillgänglighet</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Åtgärd</th></tr>
            </thead>
            <tbody className="divide-y divide-[#eee9df] text-sm">
              {loading && <tr><td colSpan={6} className="px-5 py-10 text-center text-[#7c828d]">Laddar produkter…</td></tr>}
              {!loading && data?.products.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-[#7c828d]">Inga produkter matchar ditt filter.</td></tr>}
              {!loading && data?.products.map((product) => (
                <tr key={product.slug} className="hover:bg-[#fcfaf6]">
                  <td className="px-5 py-4"><p className="font-semibold text-[#1f2328]">{product.nameSv}</p><p className="mt-0.5 font-mono text-[11px] text-[#8c827a]">{product.slug}</p></td>
                  <td className="px-5 py-4 text-[#555a64]">{product.categoryName}</td>
                  <td className="px-5 py-4"><div className="space-y-1">{product.variants.map((variant) => <p key={variant.id} className="whitespace-nowrap text-[#1f2328]"><span className="text-[#7c828d]">{variant.label}:</span> {money(variant.priceSek)}</p>)}</div></td>
                  <td className="px-5 py-4 text-[#555a64]">{product.availableVariantCount} av {product.variantCount} storlekar tillgängliga</td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}><span className={`size-1.5 rounded-full ${product.active ? "bg-emerald-500" : "bg-stone-400"}`} />{product.active ? "Aktiv" : "Inaktiv"}</span></td>
                    <td className="px-5 py-4"><button type="button" onClick={() => void openEditor(product.slug)} className="rounded-lg border border-[#b88e4d] px-3 py-1.5 text-xs font-bold text-[#765521] hover:bg-[#fbf4e7]">Redigera</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && <footer className="flex items-center justify-between gap-4 border-t border-[#eee9df] bg-[#fbf9f4] px-5 py-3 text-xs text-[#7c828d]"><span>{data.total} produkter · sida {data.page} av {totalPages}</span><div className="flex gap-2"><button type="button" disabled={data.page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-[#e4ded2] bg-white px-3 py-1.5 font-semibold text-[#555a64] disabled:opacity-40">Föregående</button><button type="button" disabled={data.page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-[#e4ded2] bg-white px-3 py-1.5 font-semibold text-[#555a64] disabled:opacity-40">Nästa</button></div></footer>}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Redigera ${editing.nameSv}`}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#eee9df] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#a78347]">
                  Redigera befintlig produkt
                </p>
                <h3 className="font-serif text-2xl font-bold text-[#1f2328]">{editing.nameSv}</h3>
                <p className="text-xs text-[#7c828d]">
                  Slug: {editing.slug} · Kategori: {editing.categorySlug}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                aria-label="Stäng redigeringsfönstret"
                className="rounded-lg p-1.5 text-xl text-[#7c828d] hover:bg-stone-100 hover:text-[#1f2328]"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-[#5f625f]">Produktnamn</span>
                <input
                  value={editing.nameSv}
                  onChange={(e) => updateEditing({ ...editing, nameSv: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#e4ded2] p-2.5 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-[#5f625f]">Beskrivning</span>
                <textarea
                  value={editing.descriptionSv}
                  onChange={(e) => updateEditing({ ...editing, descriptionSv: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[#e4ded2] p-2.5 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                />
              </label>

              {/* Originalingredienser (Recept) */}
              <div className="rounded-2xl border border-[#e4ded2] bg-[#faf8f4] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-[#1f2328]">Originalingredienser (Recept)</h4>
                    <p className="text-xs text-[#7c828d]">
                      Grundrecept för rätten. Kunder kan välja bort ingredienser (t.ex. &quot;Utan lök&quot;) om kategorin tillåter det.
                    </p>
                  </div>
                  <span className="rounded-full border border-[#e4ded2] bg-white px-2.5 py-0.5 text-xs font-semibold text-[#555a64]">
                    {(editing.ingredients ?? []).length} / 30 ingredienser
                  </span>
                </div>

                {/* Chips List */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(editing.ingredients ?? []).length === 0 ? (
                    <p className="text-xs italic text-[#8c827a]">Inga ingredienser angivna ännu.</p>
                  ) : (
                    (editing.ingredients ?? []).map((ing, idx) => (
                      <div
                        key={`${ing}-${idx}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#d8d0c2] bg-white py-1 pl-3 pr-1.5 text-xs font-medium text-[#1f2328] shadow-2xs"
                      >
                        {editingIngredientIndex === idx ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editingIngredientValue}
                              onChange={(e) => setEditingIngredientValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveInlineEdit();
                                } else if (e.key === "Escape") {
                                  setEditingIngredientIndex(null);
                                  setEditingIngredientValue("");
                                }
                              }}
                              className="w-28 rounded border border-[#b88e4d] bg-[#fdfcf9] px-1.5 py-0.5 text-xs outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={saveInlineEdit}
                              className="rounded bg-[#a78347] px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-[#8f6d35]"
                            >
                              Spara
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIngredientIndex(null);
                                setEditingIngredientValue("");
                              }}
                              className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-700 hover:bg-stone-300"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => startInlineEdit(idx)}
                              title="Klicka för att redigera"
                              className="hover:text-[#a78347] hover:underline"
                            >
                              {ing}
                            </button>
                            <div className="flex items-center gap-0.5 border-l border-[#ece6db] pl-1">
                              {idx > 0 && (
                                <button
                                  type="button"
                                  onClick={() => moveIngredient(idx, "up")}
                                  aria-label={`Flytta upp ${ing}`}
                                  className="px-0.5 text-[11px] text-[#8c827a] hover:text-[#1f2328]"
                                >
                                  ↑
                                </button>
                              )}
                              {idx < (editing.ingredients ?? []).length - 1 && (
                                <button
                                  type="button"
                                  onClick={() => moveIngredient(idx, "down")}
                                  aria-label={`Flytta ned ${ing}`}
                                  className="px-0.5 text-[11px] text-[#8c827a] hover:text-[#1f2328]"
                                >
                                  ↓
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveIngredient(idx)}
                                aria-label={`Ta bort ${ing}`}
                                className="rounded-full p-0.5 text-[#8c827a] hover:bg-red-50 hover:text-red-700"
                              >
                                <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Add Input */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Lägg till ingrediens (t.ex. Tomatsås, Ost, Skinka)..."
                    value={newIngredientInput}
                    onChange={(e) => {
                      setNewIngredientInput(e.target.value);
                      if (ingredientError) setIngredientError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddIngredient();
                      }
                    }}
                    className="flex-1 rounded-xl border border-[#e4ded2] bg-white px-3 py-2 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddIngredient()}
                    className="rounded-xl border border-[#b88e4d] bg-[#fcf8f0] px-3 py-2 text-xs font-bold text-[#765521] hover:bg-[#faeed7]"
                  >
                    + Lägg till
                  </button>
                </div>

                {ingredientError && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                    {ingredientError}
                  </p>
                )}

                {/* Empty Confirmation Guard */}
                {(editing.ingredients ?? []).length === 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold">⚠️ Rätten har inga ingredienser i receptet.</p>
                    <p className="mt-0.5 text-amber-800">
                      Detta är normalt för dryck eller enkla tillbehör, men pizzor och rätter bör normalt ha sina grundingredienser angivna.
                    </p>
                    <label className="mt-2 flex items-center gap-2 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmEmptyIngredients}
                        onChange={(e) => {
                          setConfirmEmptyIngredients(e.target.checked);
                          if (editError) setEditError("");
                        }}
                        className="rounded border-[#b88e4d]"
                      />
                      Jag bekräftar att rätten ska sparas helt utan ingredienser
                    </label>
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-bold text-[#5f625f]">Bildreferens</span>
                <input
                  value={editing.image}
                  onChange={(e) => updateEditing({ ...editing, image: e.target.value })}
                  aria-describedby="image-reference-help"
                  className="mt-1 w-full rounded-xl border border-[#e4ded2] p-2.5 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                />
                <span id="image-reference-help" className="mt-1 block text-xs text-[#7c828d]">
                  Använd produktens nuvarande referens eller en referens som redan finns i katalogen.
                </span>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-[#5f625f]">Sortering</span>
                <input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => updateEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-[#e4ded2] p-2.5 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d]"
                />
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-[#1f2328]">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => updateEditing({ ...editing, active: e.target.checked })}
                  className="rounded border-[#b88e4d]"
                />
                Aktiv produkt i menyn
              </label>

              <div className="rounded-2xl border border-[#e4ded2] bg-[#faf8f4] p-4">
                <p className="font-bold text-[#1f2328]">Storlekar och priser</p>
                <div className="mt-3 space-y-2">
                  {editing.variants.map((item, index) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-[#e4ded2] bg-white p-3 text-sm sm:grid-cols-5 sm:items-center"
                    >
                      <span className="font-medium text-[#1f2328]">{item.id}</span>
                      <input
                        value={item.label}
                        aria-label={`Namn för ${item.id}`}
                        onChange={(e) =>
                          updateEditing({
                            ...editing,
                            variants: editing.variants.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)),
                          })
                        }
                        className="rounded-lg border border-[#e4ded2] p-1.5 text-xs text-[#1f2328] outline-none focus:border-[#b88e4d]"
                      />
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        aria-label={`Pris för ${item.id}`}
                        value={item.priceSek}
                        onChange={(e) =>
                          updateEditing({
                            ...editing,
                            variants: editing.variants.map((v, i) =>
                              i === index ? { ...v, priceSek: Number(e.target.value) } : v,
                            ),
                          })
                        }
                        className="rounded-lg border border-[#e4ded2] p-1.5 text-xs text-[#1f2328] outline-none focus:border-[#b88e4d]"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-[#555a64]">
                        <input
                          type="checkbox"
                          checked={item.available}
                          onChange={(e) =>
                            updateEditing({
                              ...editing,
                              variants: editing.variants.map((v, i) =>
                                i === index ? { ...v, available: e.target.checked } : v,
                              ),
                            })
                          }
                          className="rounded border-[#b88e4d]"
                        />
                        Tillgänglig
                      </label>
                      <label className="block">
                        <span className="sr-only">Prisstatus</span>
                        <select
                          value={item.priceStatus}
                          aria-label={`Prisstatus för ${item.id}`}
                          onChange={(e) =>
                            updateEditing({
                              ...editing,
                              variants: editing.variants.map((v, i) =>
                                i === index ? { ...v, priceStatus: e.target.value as "confirmed" | "needs_review" } : v,
                              ),
                            })
                          }
                          className="w-full rounded-lg border border-[#e4ded2] p-1.5 text-xs text-[#1f2328] outline-none focus:border-[#b88e4d]"
                        >
                          <option value="confirmed">Bekräftat pris</option>
                          <option value="needs_review">Behöver granskas</option>
                        </select>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {editError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <p>{editError}</p>
                  {retry && (
                    <button type="button" onClick={() => void save()} className="mt-2 font-semibold underline">
                      Försök igen med samma sparning
                    </button>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-[#eee9df] pt-4">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-xl border border-[#e4ded2] px-4 py-2 text-sm font-semibold text-[#555a64] hover:bg-stone-50"
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-xl bg-[#a78347] px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#8f6d35] disabled:opacity-50"
                >
                  {saving ? "Sparar…" : retry ? "Försök igen" : "Spara"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
