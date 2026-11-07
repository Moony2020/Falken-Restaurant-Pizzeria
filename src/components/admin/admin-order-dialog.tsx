"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminOrderDetail } from "@/server/admin-orders";

const labels: Record<string, string> = {
  CONFIRMED: "Ny", ACKNOWLEDGED: "Mottagen", PREPARING: "Tillagas",
  READY_FOR_PICKUP: "Redo för avhämtning", PICKED_UP: "Uthämtad",
};
const nextActions: Record<string, { to: string; label: string }[]> = {
  CONFIRMED: [{ to: "ACKNOWLEDGED", label: "Bekräfta mottagning" }, { to: "PREPARING", label: "Börja tillaga" }],
  ACKNOWLEDGED: [{ to: "PREPARING", label: "Börja tillaga" }],
  PREPARING: [{ to: "READY_FOR_PICKUP", label: "Markera som klar" }],
  READY_FOR_PICKUP: [{ to: "PICKED_UP", label: "Markera som hämtad" }],
};
const money = (value: number) => `${value} kr`;
const date = (value: string) => new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(value));

export function AdminOrderDialog({ order, busy, onClose, onTransition, onCollectPayment, onViewReceipt }: {
  order: AdminOrderDetail;
  busy: boolean;
  onClose: () => void;
  onTransition: (to: string) => void;
  onCollectPayment: (method: "cash" | "card_terminal") => void;
  onViewReceipt?: (order: AdminOrderDetail) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [collectionMethod, setCollectionMethod] = useState<"cash" | "card_terminal">("cash");
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const buttons = [...(closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-xs sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="admin-order-title" className="relative my-auto max-h-[95dvh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-5 text-[#1f2328] shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-3 border-b border-[#e8e2d5] pb-4">
        <div><h2 id="admin-order-title" className="font-serif text-2xl font-bold">Beställning {order.publicId}</h2><p className="mt-1 text-xs text-[#7c828d]">Mottagen: {date(order.createdAt)} · {labels[order.fulfillmentStatus]}</p></div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng orderdetaljer"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e2dbce] bg-white text-xs font-bold text-[#7c828d] shadow-2xs hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer"
        >
          ✕
        </button>
      </div>
      <div className="grid gap-4 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs font-bold uppercase text-[#8c827a]">Kunduppgifter</p><p className="mt-1 font-semibold">{order.customerName}</p><a href={`tel:${order.phone}`} className="text-[#a78347] underline">{order.phone}</a></div>
        <div><p className="text-xs font-bold uppercase text-[#8c827a]">Avhämtning & betalning</p><p className="mt-1">{date(order.pickupAt)}</p><p>{order.paymentMethod === "card" ? "Stripe · kort" : order.paymentMethod === "swish" ? "Swish" : "Betala på plats"} · {order.paymentStatus === "paid" ? "Betald" : "Obetald"}</p></div>
      </div>
      <div><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#8c827a]">Beställda maträtter & specifikationer</h3><div className="divide-y divide-[#ede7db] overflow-hidden rounded-2xl border border-[#e8e2d5] bg-white">
        {order.items.map((item, index) => <div key={index} className="flex justify-between gap-3 p-4 text-sm"><div><p className="font-bold">{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</p><p className="mt-1 text-xs text-[#7c828d]">Grundpris {money(item.basePriceSek)} / st</p>{item.modifiers.map((modifier, i) => <p key={i} className="text-xs text-[#8b6f36]">+ {modifier.quantity} × {modifier.label} ({money(modifier.priceSek)})</p>)}{item.removedIngredients.map((ingredient, i) => <p key={i} className="text-xs font-semibold text-red-700">Utan: {ingredient}</p>)}{item.note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs"><strong>Obs:</strong> {item.note}</p>}</div><strong className="shrink-0">{money(item.lineTotalSek)}</strong></div>)}
      </div></div>
      <div className="space-y-2 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm"><p className="flex justify-between"><span>Delsumma</span><span>{money(order.subtotalSek)}</span></p>{order.discountSek > 0 && <p className="flex justify-between"><span>Rabatt</span><span>−{money(order.discountSek)}</span></p>}<p className="flex justify-between border-t pt-2 font-bold"><span>Totalt</span><span>{money(order.totalSek)}</span></p></div>
      {order.paymentMethod === "pay_on_pickup" && order.paymentStatus === "unpaid" && (
        <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div><p className="font-bold text-[#704d20]">Betala vid avhämtning</p><p className="mt-1 text-xs text-[#86523b]">Att betala: <strong>{money(order.totalSek)}</strong>. Kortterminal betyder att personalen bekräftar en redan genomförd extern kortbetalning.</p></div>
          <label className="block text-xs font-semibold text-[#704d20]">Betalsätt
            <span className="relative mt-1 block">
              <select value={collectionMethod} onChange={(event) => setCollectionMethod(event.target.value as "cash" | "card_terminal")} disabled={busy} className="block w-full appearance-none rounded-lg border border-amber-300 bg-white px-3 py-2 pr-10 text-sm text-[#1f2328]">
                <option value="cash">Kontant</option><option value="card_terminal">Kortterminal</option>
              </select>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#704d20]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7 5 5 5-5" /></svg>
            </span>
          </label>
          <button type="button" disabled={busy} onClick={() => setPaymentConfirmationOpen(true)} className="rounded-xl bg-[#8a7040] px-4 py-2 text-xs font-semibold text-white hover:bg-[#6e5831] disabled:opacity-50">
            Markera som betald
          </button>
        </section>
      )}
      {paymentConfirmationOpen && (
        <div className="absolute inset-0 z-[60] grid place-items-center rounded-3xl bg-[#1f2328]/55 p-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="payment-confirmation-title" className="w-full max-w-md rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a78347]">Betalning vid avhämtning</p>
                <h3 id="payment-confirmation-title" className="mt-1 font-serif text-2xl font-bold text-[#1f2328]">Bekräfta betalning</h3>
              </div>
              <button type="button" aria-label="Stäng bekräftelse" onClick={() => setPaymentConfirmationOpen(false)} className="grid size-9 place-items-center rounded-full border border-[#e2dbce] bg-white text-lg text-[#7c828d] transition hover:bg-[#faf7f2] hover:text-[#1f2328]">×</button>
            </div>
            <p className="mt-5 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm leading-6 text-[#5f625f]">
              Bekräfta att <strong className="text-[#1f2328]">{money(order.totalSek)}</strong> har tagits emot via <strong className="text-[#1f2328]">{collectionMethod === "cash" ? "kontant" : "kortterminal"}</strong>.
              Detta registrerar endast personalens bekräftelse och genomför ingen extern betalning.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPaymentConfirmationOpen(false)} className="min-h-11 rounded-xl border border-[#ded6c8] bg-white px-4 text-sm font-semibold text-[#5f625f] transition hover:bg-[#f6f2ea]">Avbryt</button>
              <button type="button" onClick={() => { setPaymentConfirmationOpen(false); onCollectPayment(collectionMethod); }} className="min-h-11 rounded-xl bg-[#8a7040] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e5831]">Bekräfta betalning</button>
            </div>
          </section>
        </div>
      )}
      {order.onSiteCollection && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Betalning registrerad: {order.onSiteCollection.method === "cash" ? "Kontant" : "Kortterminal"} · {money(order.onSiteCollection.amountSek)}.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8e2d5] pt-4">
        <div>
          {onViewReceipt && (
            <button
              type="button"
              onClick={() => onViewReceipt(order)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition cursor-pointer shadow-2xs"
            >
              <span>📄</span>
              <span>Visa kvitto</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {order.fulfillmentStatus !== "PICKED_UP" && order.fulfillmentStatus !== "CANCELLED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Är du säker på att du vill avbryta beställning ${order.publicId}? Åtgärden kan inte ångras.`)) {
                  onTransition("CANCELLED");
                  onClose();
                }
              }}
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer"
            >
              🚫 Avbryt beställning
            </button>
          )}
          {(nextActions[order.fulfillmentStatus] ?? []).map((action) => (
            <button
              key={action.to}
              type="button"
              disabled={busy || (action.to === "PICKED_UP" && order.paymentMethod === "pay_on_pickup" && order.paymentStatus !== "paid")}
              onClick={() => onTransition(action.to)}
              className="rounded-xl bg-[#a78347] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#72623c] transition shadow-2xs cursor-pointer"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
      {order.fulfillmentStatus === "READY_FOR_PICKUP" && order.paymentMethod === "pay_on_pickup" && order.paymentStatus !== "paid" && <p className="text-xs text-[#86523b]">Uthämtning spärrad tills betalning har registrerats av personal.</p>}
    </section>
  </div>;
}
