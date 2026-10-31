"use client";

import { useEffect, useRef } from "react";
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

export function AdminOrderDialog({ order, busy, onClose, onTransition }: {
  order: AdminOrderDetail;
  busy: boolean;
  onClose: () => void;
  onTransition: (to: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
    <section role="dialog" aria-modal="true" aria-labelledby="admin-order-title" className="my-auto max-h-[95dvh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-5 text-[#1f2328] shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-3 border-b border-[#e8e2d5] pb-4">
        <div><h2 id="admin-order-title" className="font-serif text-2xl font-bold">Beställning #{order.publicId}</h2><p className="mt-1 text-xs text-[#7c828d]">Mottagen: {date(order.createdAt)} · {labels[order.fulfillmentStatus]}</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Stäng orderdetaljer" className="rounded-full px-3 py-1 text-xl hover:bg-black/5">×</button>
      </div>
      <div className="grid gap-4 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm sm:grid-cols-2">
        <div><p className="text-xs font-bold uppercase text-[#8c827a]">Kunduppgifter</p><p className="mt-1 font-semibold">{order.customerName}</p><a href={`tel:${order.phone}`} className="text-[#a78347] underline">{order.phone}</a></div>
        <div><p className="text-xs font-bold uppercase text-[#8c827a]">Avhämtning & betalning</p><p className="mt-1">{date(order.pickupAt)}</p><p>{order.paymentMethod === "card" ? "Stripe · kort" : "Betala på plats"} · {order.paymentStatus === "paid" ? "Betald" : "Obetald"}</p></div>
      </div>
      <div><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#8c827a]">Beställda maträtter & specifikationer</h3><div className="divide-y divide-[#ede7db] overflow-hidden rounded-2xl border border-[#e8e2d5] bg-white">
        {order.items.map((item, index) => <div key={index} className="flex justify-between gap-3 p-4 text-sm"><div><p className="font-bold">{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</p><p className="mt-1 text-xs text-[#7c828d]">Grundpris {money(item.basePriceSek)} / st</p>{item.modifiers.map((modifier, i) => <p key={i} className="text-xs text-[#8b6f36]">+ {modifier.quantity} × {modifier.label} ({money(modifier.priceSek)})</p>)}{item.removedIngredients.map((ingredient, i) => <p key={i} className="text-xs font-semibold text-red-700">Utan: {ingredient}</p>)}{item.note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs"><strong>Obs:</strong> {item.note}</p>}</div><strong className="shrink-0">{money(item.lineTotalSek)}</strong></div>)}
      </div></div>
      <div className="space-y-2 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm"><p className="flex justify-between"><span>Delsumma</span><span>{money(order.subtotalSek)}</span></p>{order.discountSek > 0 && <p className="flex justify-between"><span>Rabatt</span><span>−{money(order.discountSek)}</span></p>}<p className="flex justify-between border-t pt-2 font-bold"><span>Totalt</span><span>{money(order.totalSek)}</span></p></div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-[#e8e2d5] pt-4"><button type="button" onClick={onClose} className="rounded-xl border border-[#e4ded2] bg-white px-4 py-2 text-xs font-semibold">Stäng</button>{(nextActions[order.fulfillmentStatus] ?? []).map((action) => <button key={action.to} type="button" disabled={busy || (action.to === "PICKED_UP" && order.paymentMethod === "pay_on_pickup")} onClick={() => onTransition(action.to)} className="rounded-xl bg-[#a78347] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{action.label}</button>)}</div>
      {order.fulfillmentStatus === "READY_FOR_PICKUP" && order.paymentMethod === "pay_on_pickup" && <p className="text-xs text-[#86523b]">Uthämtning spärrad tills betalning kan registreras av personal i A5.</p>}
    </section>
  </div>;
}
