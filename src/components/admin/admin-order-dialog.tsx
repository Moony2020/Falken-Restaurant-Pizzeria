"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AdminOrderDetail } from "@/server/admin-orders";
import { AdminCancelDialog } from "./admin-cancel-dialog";
import { AdminRefundDialog } from "./admin-refund-dialog";

const labels: Record<string, string> = {
  CONFIRMED: "Ny",
  ACKNOWLEDGED: "Mottagen",
  PREPARING: "Tillagas",
  READY_FOR_PICKUP: "Redo för avhämtning",
  PICKED_UP: "Uthämtad",
  CANCELLED: "Avbruten",
};
const nextActions: Record<string, { to: string; label: string }[]> = {
  CONFIRMED: [{ to: "ACKNOWLEDGED", label: "Bekräfta mottagning" }, { to: "PREPARING", label: "Börja tillaga" }],
  ACKNOWLEDGED: [{ to: "PREPARING", label: "Börja tillaga" }],
  PREPARING: [{ to: "READY_FOR_PICKUP", label: "Markera som klar" }],
  READY_FOR_PICKUP: [{ to: "PICKED_UP", label: "Markera som hämtad" }],
};
const money = (value: number) => `${value} kr`;
const date = (value: string) => new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(value));

export function AdminOrderDialog({
  order,
  busy,
  onClose,
  onTransition,
  onCollectPayment,
  onViewReceipt,
  onCancelOrder,
  onRecordRefund,
}: {
  order: AdminOrderDetail;
  busy: boolean;
  onClose: () => void;
  onTransition: (to: string) => void;
  onCollectPayment: (method: "cash" | "card_terminal") => void;
  onViewReceipt?: (order: AdminOrderDetail) => void;
  onCancelOrder?: (reasonCategory: string, reasonNote?: string) => Promise<{ ok: boolean; error?: string }>;
  onRecordRefund?: (data: {
    amountSek: number;
    reasonCategory: string;
    reasonNote?: string;
    method?: string;
    externalReference: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const paymentDialogRef = useRef<HTMLElement>(null);
  const [collectionMethod, setCollectionMethod] = useState<"cash" | "card_terminal">("cash");
  const [paymentConfirmationOpen, setPaymentConfirmationOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (cancelDialogOpen || refundDialogOpen || document.getElementById("payment-confirmation-title")) return;
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const buttons = [...(closeRef.current?.closest('[role="dialog"]')?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])];
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose, cancelDialogOpen, refundDialogOpen]);

  useEffect(() => {
    if (!paymentConfirmationOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = paymentDialogRef.current;
    const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    buttons[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setPaymentConfirmationOpen(false); }
      if (event.key !== "Tab" || buttons.length === 0) return;
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [paymentConfirmationOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !cancelDialogOpen && !refundDialogOpen) onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="admin-order-title" inert={paymentConfirmationOpen} className="relative my-auto max-h-[82dvh] w-full max-w-2xl space-y-4 sm:space-y-5 overflow-y-auto rounded-2xl sm:rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-4 sm:p-8 text-[#1f2328] shadow-2xl">
        {/* Close button top-right: perfectly circular, touch-friendly, aspect-square with SVG icon */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng orderdetaljer"
          style={{ borderRadius: "50%" }}
          className="absolute top-3.5 right-3.5 sm:top-5 sm:right-5 flex h-7 w-7 sm:h-8 sm:w-8 aspect-square p-0 items-center justify-center border border-[#e2dbce] bg-white text-[#7c828d] shadow-2xs hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer z-20 shrink-0 before:absolute before:-inset-2 before:content-['']"
        >
          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="border-b border-[#e8e2d5] pb-3 sm:pb-4 pr-12 sm:pr-12">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2">
              <h2 id="admin-order-title" className="font-serif text-base sm:text-2xl font-bold tracking-tight break-words">
                Beställning <span className="font-mono text-sm sm:text-xl font-bold tracking-normal">{order.publicId}</span>
              </h2>
              {(order.paymentStatus === "refunded" || order.fulfillmentStatus === "CANCELLED") && (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {order.paymentStatus === "refunded" && (
                    <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-emerald-800">
                      Återbetald
                    </span>
                  )}
                  {order.fulfillmentStatus === "CANCELLED" && (
                    <span className="rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-red-800">
                      Avbruten
                    </span>
                  )}
                </div>
              )}
            </div>
            <p className="mt-1 text-[11px] sm:text-xs text-[#7c828d]">
              Mottagen: {date(order.createdAt)} · {labels[order.fulfillmentStatus] ?? order.fulfillmentStatus}
            </p>
          </div>
        </div>

        {/* Customer & Payment Info */}
        <div className="grid gap-4 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase text-[#8c827a]">Kunduppgifter</p>
            <p className="mt-1 font-semibold">{order.customerName}</p>
            <a href={`tel:${order.phone}`} className="text-[#a78347] underline">{order.phone}</a>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-[#8c827a]">Avhämtning & betalning</p>
            <p className="mt-1">{date(order.pickupAt)}</p>
            <p>
              {order.paymentMethod === "card" ? "Stripe · kort" : order.paymentMethod === "swish" ? "Swish" : "Betala på plats"} ·{" "}
              <span className={order.paymentStatus === "refunded" ? "font-bold text-emerald-800" : order.paymentStatus === "paid" ? "font-semibold text-[#1f2328]" : "text-amber-800"}>
                {order.paymentStatus === "paid" ? "Betald" : order.paymentStatus === "refunded" ? "Återbetald" : "Obetald"}
              </span>
            </p>
          </div>
        </div>

        {/* Refund Evidence Box (if refunded) */}
        {order.paymentStatus === "refunded" && (
          <section className="space-y-2 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 text-xs text-emerald-950">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-emerald-900">Återbetald</span>
              <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 font-bold text-emerald-950">
                {money(order.totalRefundedSek || order.totalSek)}
              </span>
            </div>
            <div className="space-y-1 text-[#333d36] text-[12px] pt-1">
              <p>
                <strong>Status:</strong> Återbetald
              </p>
              <p>
                <strong>Intygande:</strong>{" "}
                <span className="font-medium text-[#444f47]">
                  Administrativt intygad – ej verifierad hos betalleverantören
                </span>
              </p>
              {order.refundRecord?.externalReference && (
                <p>
                  <strong>Extern referens:</strong>{" "}
                  <code className="rounded bg-white/90 border border-emerald-200 px-1.5 py-0.5 font-mono text-[11px] text-emerald-950">
                    {order.refundRecord.externalReference}
                  </code>
                </p>
              )}
              {order.refundRecord?.reasonCategory && (
                <p>
                  <strong>Orsak:</strong> {order.refundRecord.reasonCategory}
                  {order.refundRecord.reasonNote ? ` (${order.refundRecord.reasonNote})` : ""}
                </p>
              )}
              {order.refundRecord?.recordedAt && (
                <p className="text-[11px] text-[#6b756e]">
                  Registrerad: {date(order.refundRecord.recordedAt)}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Cancelled Unpaid Box (if cancelled and not refunded) */}
        {order.fulfillmentStatus === "CANCELLED" && order.paymentStatus !== "refunded" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
            <p className="font-bold">Avbruten beställning</p>
            <p className="mt-0.5 text-red-700">Beställningen är avbruten i obetalt skick utan ekonomisk återbetalning.</p>
            {order.cancelledAt && <p className="mt-1 text-[11px] text-red-600">Tidpunkt: {date(order.cancelledAt)}</p>}
          </div>
        )}

        {/* Items */}
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#8c827a]">Beställda maträtter & specifikationer</h3>
          <div className="divide-y divide-[#ede7db] overflow-hidden rounded-2xl border border-[#e8e2d5] bg-white">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-bold">{item.quantity} × {item.name}{item.variant ? ` (${item.variant})` : ""}</p>
                  <p className="mt-1 text-xs text-[#7c828d]">Grundpris {money(item.basePriceSek)} / st</p>
                  {item.modifiers.map((modifier, i) => (
                    <p key={i} className="text-xs text-[#8b6f36]">+ {modifier.quantity} × {modifier.label} ({money(modifier.priceSek)})</p>
                  ))}
                  {item.removedIngredients.map((ingredient, i) => (
                    <p key={i} className="text-xs font-semibold text-red-700">Utan: {ingredient}</p>
                  ))}
                  {item.note && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs"><strong>Obs:</strong> {item.note}</p>}
                </div>
                <strong className="shrink-0">{money(item.lineTotalSek)}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-sm">
          <p className="flex justify-between"><span>Delsumma</span><span>{money(order.subtotalSek)}</span></p>
          {order.discountSek > 0 && <p className="flex justify-between"><span>Rabatt</span><span>−{money(order.discountSek)}</span></p>}
          <p className="flex justify-between border-t pt-2 font-bold"><span>Totalt</span><span>{money(order.totalSek)}</span></p>
        </div>

        {/* Counter Collection (Pay on pickup unpaid) */}
        {order.paymentMethod === "pay_on_pickup" && order.paymentStatus === "unpaid" && order.fulfillmentStatus !== "CANCELLED" && (
          <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <div>
              <p className="font-bold text-[#704d20]">Betala vid avhämtning</p>
              <p className="mt-1 text-xs text-[#86523b]">Att betala: <strong>{money(order.totalSek)}</strong>. Kortterminal betyder att personalen bekräftar en redan genomförd extern kortbetalning.</p>
            </div>
            <label className="block text-xs font-semibold text-[#704d20]">Betalsätt
              <span className="relative mt-1 block">
                <select value={collectionMethod} onChange={(event) => setCollectionMethod(event.target.value as "cash" | "card_terminal")} disabled={busy} className="block w-full appearance-none rounded-lg border border-amber-300 bg-white px-3 py-2 pr-10 text-sm text-[#1f2328]">
                  <option value="cash">Kontant</option><option value="card_terminal">Kortterminal</option>
                </select>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#704d20]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7 5 5 5-5" /></svg>
              </span>
            </label>
            <button type="button" disabled={busy} onClick={() => setPaymentConfirmationOpen(true)} className="rounded-xl bg-[#8a7040] px-4 py-2 text-xs font-semibold text-white hover:bg-[#6e5831] disabled:opacity-50 cursor-pointer">
              Markera som betald
            </button>
          </section>
        )}

        {paymentConfirmationOpen && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1f2328]/55 p-4" role="presentation" onMouseDown={(event) => event.stopPropagation()}>
            <section ref={paymentDialogRef} role="alertdialog" aria-modal="true" aria-labelledby="payment-confirmation-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-6 shadow-2xl">
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
        , document.body)}

        {order.onSiteCollection && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            Betalning registrerad: {order.onSiteCollection.method === "cash" ? "Kontant" : "Kortterminal"} · {money(order.onSiteCollection.amountSek)}.
          </p>
        )}

        {/* Footer Actions */}
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

          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Unpaid / Pending Cancellation: Dedicated confirmation modal with mandatory reason */}
            {(order.paymentStatus === "unpaid" || order.paymentStatus === "pending") && order.fulfillmentStatus !== "CANCELLED" && order.fulfillmentStatus !== "PICKED_UP" && onCancelOrder && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setCancelDialogOpen(true)}
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer disabled:opacity-50"
              >
                🚫 Avbryt beställning
              </button>
            )}

            {/* 2. Paid Orders: Dedicated Full Refund registration dialog */}
            {order.paymentStatus === "paid" && onRecordRefund && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setRefundDialogOpen(true)}
                className="rounded-xl border border-[#a78347]/40 bg-[#f7f2e7] px-3.5 py-2 text-xs font-semibold text-[#826430] hover:bg-[#ede5d3] transition cursor-pointer disabled:opacity-50"
              >
                ↩ Registrera återbetalning
              </button>
            )}

            {/* 3. Operational Next Actions (only if not cancelled and not refunded-before-pickup) */}
            {order.fulfillmentStatus !== "CANCELLED" && (nextActions[order.fulfillmentStatus] ?? []).map((action) => (
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

        {order.fulfillmentStatus === "READY_FOR_PICKUP" && order.paymentMethod === "pay_on_pickup" && order.paymentStatus !== "paid" && (
          <p className="text-xs text-[#86523b]">Uthämtning spärrad tills betalning har registrerats av personal.</p>
        )}

        {/* Sub-Dialogs */}
        {cancelDialogOpen && onCancelOrder && (
          <AdminCancelDialog
            order={order}
            busy={busy}
            onClose={() => setCancelDialogOpen(false)}
            onConfirm={async (category, note) => {
              const res = await onCancelOrder(category, note);
              return res;
            }}
          />
        )}

        {refundDialogOpen && onRecordRefund && (
          <AdminRefundDialog
            order={order}
            busy={busy}
            onClose={() => setRefundDialogOpen(false)}
            onConfirm={async (data) => {
              const res = await onRecordRefund(data);
              return res;
            }}
          />
        )}
      </section>
    </div>
  );
}
