"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminOrderDetail, AdminOrderSummary } from "@/server/admin-orders";

type ListResponse = { orders: AdminOrderSummary[]; total: number; page: number; limit: number };
type Status = "ALL" | "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP";
const filters: { value: Status; label: string }[] = [
  { value: "ALL", label: "Alla" }, { value: "CONFIRMED", label: "Nya" },
  { value: "ACKNOWLEDGED", label: "Mottagna" }, { value: "PREPARING", label: "Tillagas" },
  { value: "READY_FOR_PICKUP", label: "Redo" }, { value: "PICKED_UP", label: "Uthämtade" },
];
const statusLabels: Record<string, string> = { CONFIRMED: "Ny", ACKNOWLEDGED: "Mottagen", PREPARING: "Tillagas", READY_FOR_PICKUP: "Redo för avhämtning", PICKED_UP: "Uthämtad" };
const nextActions: Record<string, { to: string; label: string }[]> = {
  CONFIRMED: [{ to: "ACKNOWLEDGED", label: "Bekräfta mottagning" }, { to: "PREPARING", label: "Börja tillaga" }],
  ACKNOWLEDGED: [{ to: "PREPARING", label: "Börja tillaga" }],
  PREPARING: [{ to: "READY_FOR_PICKUP", label: "Markera som redo" }],
  READY_FOR_PICKUP: [{ to: "PICKED_UP", label: "Markera som uthämtad" }],
};
const sek = (amount: number) => `${amount} kr`;
const time = (value: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const csrf = () => decodeURIComponent(document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("falken_admin_csrf="))?.split("=")[1] ?? "");

export function AdminOrdersView({ displayName, embedded = false }: { displayName: string; embedded?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("ALL");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", status, q: search });
      const response = await fetch(`/api/admin/orders?${params}`, { cache: "no-store" });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) throw new Error("Kunde inte hämta beställningar.");
      setList(await response.json() as ListResponse);
      setError("");
    } catch (cause) { if (!silent) setError(cause instanceof Error ? cause.message : "Ett fel uppstod."); }
    finally { if (!silent) setLoading(false); }
  }, [page, status, search, router]);

  useEffect(() => { const initial = window.setTimeout(() => void refresh(), 0); const id = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 5000); return () => { window.clearTimeout(initial); window.clearInterval(id); }; }, [refresh]);
  useEffect(() => { const id = window.setTimeout(() => { setPage(1); setSearch(query.trim()); }, 300); return () => window.clearTimeout(id); }, [query]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const controls = [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [selected]);

  async function openOrder(publicId: string) {
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte öppna beställningen.");
      const data = await response.json() as { order: AdminOrderDetail };
      setSelected(data.order);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ett fel uppstod."); }
  }

  async function transition(to: string) {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${selected.publicId}/transition`, {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ to, expectedStatus: selected.fulfillmentStatus }),
      });
      if (!response.ok) {
        if (response.status === 409) await openOrder(selected.publicId);
        throw new Error(response.status === 409 ? "Beställningen ändrades av en annan medarbetare. Kontrollera aktuell status." : "Det gick inte att ändra status.");
      }
      const result = await response.json() as { order: AdminOrderDetail };
      setSelected(result.order);
      await refresh(true);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ett fel uppstod."); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf() } });
      if (!response.ok) throw new Error("Kunde inte logga ut.");
      router.replace("/admin/login");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Ett fel uppstod."); setBusy(false); }
  }

  return <div className={embedded ? "min-w-0 text-[#20232a]" : "min-h-dvh bg-[#faf8f3] text-[#20232a] lg:flex"}>
    {!embedded && <aside className="border-b border-[#e8e1d3] bg-white px-5 py-5 lg:min-h-dvh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <Link href="/" className="font-serif text-3xl tracking-[.22em] text-[#a3884b]">FALKEN</Link>
      <p className="mt-1 text-[10px] tracking-[.25em] text-[#8b8272]">RESTAURANG & PIZZERIA</p>
      <nav aria-label="Administration" className="mt-6 flex gap-2 lg:block">
        <Link aria-current="page" href="/admin/orders" className="block rounded-xl bg-[#a68b50] px-4 py-3 font-semibold text-white">Beställningar</Link>
      </nav>
    </aside>}
    <main className={embedded ? "min-w-0" : "min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10"}>
      {!embedded && <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#a3884b]">Falken Admin</p><h1 className="font-serif text-4xl">Beställningar</h1><p className="text-sm text-[#6f7480]">Inloggad som {displayName}</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/" className="rounded-full border border-[#dfd6c4] px-4 py-2 text-sm">Till webbplatsen</Link><button type="button" onClick={() => void logout()} disabled={busy} className="rounded-full border border-[#dfd6c4] bg-white px-4 py-2 text-sm disabled:opacity-50">Logga ut</button></div>
      </header>}
      <section aria-label="Sök och filtrera beställningar" className="mb-5 rounded-2xl border border-[#e5ddce] bg-white p-4 shadow-sm">
        <label htmlFor="order-search" className="mb-2 block text-sm font-semibold">Sök efter ordernummer, namn eller telefon</label>
        <input id="order-search" type="search" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} placeholder="Sök beställning" className="w-full rounded-xl border border-[#ddd5c7] px-4 py-3 outline-offset-2 focus:outline-[#a68b50]" />
        <div className="mt-4 flex flex-wrap gap-2">{filters.map((filter) => <button key={filter.value} type="button" onClick={() => { setPage(1); setStatus(filter.value); }} aria-pressed={status === filter.value} className={`rounded-full px-3 py-2 text-sm ${status === filter.value ? "bg-[#20232a] text-white" : "border border-[#e5ddce] bg-white"}`}>{filter.label}</button>)}</div>
      </section>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      {loading && <p role="status">Laddar beställningar…</p>}
      {!loading && list?.orders.length === 0 && <p className="rounded-2xl border border-[#e5ddce] bg-white p-8 text-center">Inga beställningar hittades.</p>}
      {!loading && !!list?.orders.length && <div className="overflow-hidden rounded-2xl border border-[#e5ddce] bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_1.4fr_1fr_1fr_1fr_1fr] gap-3 border-b bg-[#f5f1e9] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-[#676b72] md:grid"><span>Order</span><span>Kund</span><span>Avhämtning</span><span>Status</span><span>Betalning</span><span>Totalt</span></div>
        {list.orders.map((order) => <button key={order.publicId} type="button" onClick={() => void openOrder(order.publicId)} className="block w-full border-b border-[#eee8dc] px-5 py-4 text-left transition hover:bg-[#faf7f0] focus-visible:outline-2 focus-visible:outline-[#a68b50] md:grid md:grid-cols-[1fr_1.4fr_1fr_1fr_1fr_1fr] md:items-center md:gap-3">
          <span className="block font-semibold">#{order.publicId}</span><span className="block truncate">{order.customerName}<small className="block text-[#747982]">{order.items.map((item) => `${item.quantity}× ${item.name}${item.variant ? ` (${item.variant})` : ""}`).join(", ")}</small></span>
          <span className="block text-sm">{time(order.pickupAt)}</span><span className="block text-sm">{statusLabels[order.fulfillmentStatus]}</span><span className="block text-sm">{order.paymentMethod === "card" ? "Stripe" : "Betala på plats"} · {order.paymentStatus === "paid" ? "Betald" : "Obetald"}</span><span className="block font-semibold">{sek(order.totalSek)} <span className="text-xs font-normal text-[#967941]">Visa detaljer →</span></span>
        </button>)}
      </div>}
      {!!list?.total && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>{list.total} beställningar · sida {page} av {Math.ceil(list.total / list.limit)}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Föregående</button><button disabled={page * list.limit >= list.total} onClick={() => setPage(page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Nästa</button></div></div>}
    </main>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} onKeyDown={(event) => { if (event.key === "Escape") setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="order-title" className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-[#faf8f3] p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#a3884b]">Orderdetaljer</p><h2 id="order-title" className="font-serif text-3xl">Beställning #{selected.publicId}</h2><p className="text-sm text-[#68707b]">{statusLabels[selected.fulfillmentStatus]} · Avhämtning {time(selected.pickupAt)}</p></div><button ref={closeRef} type="button" onClick={() => setSelected(null)} aria-label="Stäng orderdetaljer" className="rounded-full border px-3 py-1 text-2xl">×</button></div>
        <div className="mt-5 grid gap-3 rounded-xl border border-[#e5ddce] bg-white p-4 sm:grid-cols-2"><div><h3 className="font-semibold">Kund</h3><p>{selected.customerName}</p><a href={`tel:${selected.phone}`} className="text-[#967941] underline">{selected.phone}</a></div><div><h3 className="font-semibold">Betalning</h3><p>{selected.paymentMethod === "card" ? "Stripe · kort" : "Betala på plats"}</p><p>{selected.paymentStatus === "paid" ? "Betald" : "Obetald"}</p></div></div>
        <h3 className="mt-6 font-serif text-2xl">Din beställning</h3>
        <div className="mt-3 space-y-3">{selected.items.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-xl border border-[#e5ddce] bg-white p-4"><div className="flex justify-between gap-3 font-semibold"><span>{item.quantity} × {item.name} {item.variant && <small className="font-normal">({item.variant})</small>}</span><span>{sek(item.lineTotalSek)}</span></div><p className="mt-1 text-sm text-[#69707b]">Grundpris {sek(item.basePriceSek)} / st</p>{item.modifiers.map((modifier, i) => <p key={i} className="text-sm text-[#806b3f]">+ {modifier.quantity} × {modifier.label} ({sek(modifier.priceSek)})</p>)}{item.removedIngredients.map((ingredient, i) => <p key={i} className="text-sm font-semibold text-[#a3463b]">Utan: {ingredient}</p>)}{item.note && <p className="mt-2 rounded-lg bg-[#fff4dc] p-2 text-sm"><strong>Obs:</strong> {item.note}</p>}</div>)}</div>
        <div className="mt-4 rounded-xl border border-[#e5ddce] bg-white p-4 text-sm"><div className="flex justify-between"><span>Delsumma</span><span>{sek(selected.subtotalSek)}</span></div>{selected.discountSek > 0 && <div className="flex justify-between"><span>Rabatt</span><span>−{sek(selected.discountSek)}</span></div>}<div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold"><span>Totalt</span><span>{sek(selected.totalSek)}</span></div></div>
        <div className="mt-5 flex flex-wrap gap-2">{(nextActions[selected.fulfillmentStatus] ?? []).map((action) => <button key={action.to} disabled={busy || (action.to === "PICKED_UP" && selected.paymentMethod === "pay_on_pickup")} type="button" onClick={() => void transition(action.to)} className="rounded-full bg-[#a68b50] px-5 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50">{action.label}</button>)}</div>
        {selected.fulfillmentStatus === "READY_FOR_PICKUP" && selected.paymentMethod === "pay_on_pickup" && <p className="mt-2 text-sm text-[#86523b]">Uthämtning spärrad tills betalningen registreras i en kommande version.</p>}
      </section>
    </div>}
  </div>;
}
