"use client";

import { useEffect, useState } from "react";
import type { AdminCatalogProductsResponse } from "@/server/admin-catalog";
type EditableProduct = { slug: string; categorySlug: string; nameSv: string; descriptionSv: string; image: string; active: boolean; sortOrder: number; revision: number; variants: { id: string; label: string; priceSek: number; available: boolean; priceStatus: "confirmed" | "needs_review" }[] };
const csrf = () => decodeURIComponent(document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("falken_admin_csrf="))?.split("=")[1] ?? "");

const money = (value: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value)} kr`;

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
  const openEditor = async (slug: string) => { setEditError(""); try { const response = await fetch(`/api/admin/catalog/products/${slug}`, { cache: "no-store" }); if (!response.ok) throw new Error("Kunde inte öppna produkten."); setEditing(await response.json() as EditableProduct); } catch (cause) { setEditError(cause instanceof Error ? cause.message : "Ett fel uppstod."); } };
  const save = async () => { if (!editing) return; setSaving(true); setEditError(""); try { const response = await fetch(`/api/admin/catalog/products/${editing.slug}`, { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": csrf(), "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ expectedRevision: editing.revision, nameSv: editing.nameSv, descriptionSv: editing.descriptionSv, image: editing.image, active: editing.active, sortOrder: editing.sortOrder, variants: editing.variants }) }); const body = await response.json(); if (response.status === 409) { setEditing(body.product); throw new Error("Produkten ändrades av en annan användare. Uppdaterad data har laddats."); } if (!response.ok) throw new Error(body.issues?.fieldErrors?.variants?.[0] ?? "Kunde inte spara produkten."); setEditing(null); setPage(1); } catch (cause) { setEditError(cause instanceof Error ? cause.message : "Ett fel uppstod."); } finally { setSaving(false); } };

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

      <div className="grid gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs md:grid-cols-[minmax(0,1fr)_12rem_10rem]">
        <label className="relative block">
          <span className="sr-only">Sök produkt</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c827a]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input value={query} onChange={(event) => changeFilter({ query: event.target.value })} placeholder="Sök produktnamn eller slug…" className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] py-2.5 pl-10 pr-3 text-sm text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white" />
        </label>
        <label className="text-xs font-semibold text-[#5f625f]">Kategori
          <select value={category} onChange={(event) => changeFilter({ category: event.target.value })} className="mt-1 block w-full rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 text-sm font-normal text-[#1f2328]">
            <option value="ALL">Alla kategorier</option>
            {data?.categories.map((item) => <option key={item.slug} value={item.slug}>{item.nameSv}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-[#5f625f]">Status
          <select value={status} onChange={(event) => changeFilter({ status: event.target.value as "ALL" | "ACTIVE" | "INACTIVE" })} className="mt-1 block w-full rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 text-sm font-normal text-[#1f2328]">
            <option value="ALL">Alla statusar</option>
            <option value="ACTIVE">Aktiv</option>
            <option value="INACTIVE">Inaktiv</option>
          </select>
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
      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4"><div role="dialog" aria-modal="true" aria-label={`Redigera ${editing.nameSv}`} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#a78347]">Redigera befintlig produkt</p><h3 className="font-serif text-2xl">{editing.nameSv}</h3><p className="text-xs text-[#7c828d]">Slug: {editing.slug} · Kategori: {editing.categorySlug}</p></div><button type="button" onClick={() => setEditing(null)} className="text-xl text-[#7c828d]">×</button></div><div className="mt-5 grid gap-3"><label>Namn<input value={editing.nameSv} onChange={(e) => setEditing({ ...editing, nameSv: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label><label>Beskrivning<textarea value={editing.descriptionSv} onChange={(e) => setEditing({ ...editing, descriptionSv: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label><label>Bildreferens<input value={editing.image} onChange={(e) => setEditing({ ...editing, image: e.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label><label>Sortering<input type="number" value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2" /></label><label className="flex gap-2"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> Aktiv produkt</label><div className="rounded-xl border p-3"><p className="font-bold">Storlekar</p>{editing.variants.map((item, index) => <div key={item.id} className="mt-2 grid grid-cols-4 gap-2 text-sm"><span>{item.id}</span><input value={item.label} onChange={(e) => setEditing({ ...editing, variants: editing.variants.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} className="rounded border p-1" /><input type="number" min="1" max="10000" value={item.priceSek} onChange={(e) => setEditing({ ...editing, variants: editing.variants.map((v, i) => i === index ? { ...v, priceSek: Number(e.target.value) } : v) })} className="rounded border p-1" /><label><input type="checkbox" checked={item.available} onChange={(e) => setEditing({ ...editing, variants: editing.variants.map((v, i) => i === index ? { ...v, available: e.target.checked } : v) })} /> Tillgänglig</label></div>)}</div>{editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2">Avbryt</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[#a78347] px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? "Sparar…" : "Spara"}</button></div></div></div></div>}
    </section>
  );
}
