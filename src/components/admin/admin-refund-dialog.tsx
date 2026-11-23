"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminOrderDetail } from "@/server/admin-orders";

const refundReasonCategories = [
  { value: "customer_cancellation", label: "Kunden avbokade / ångrade sig" },
  { value: "out_of_stock", label: "Ingrediens / produkt slut" },
  { value: "kitchen_delay", label: "Försening i köket" },
  { value: "quality_issue", label: "Klagomål på maten / kvalitet" },
  { value: "other", label: "Övrigt" },
] as const;

function resolveDisplayProvider(order: AdminOrderDetail): {
  label: string;
  placeholder: string;
  helper: string;
  methodParam?: "stripe" | "swish" | "cash" | "card_terminal";
} {
  if (order.paymentMethod === "card") {
    return {
      label: "Stripe · Kortbetalning",
      placeholder: "re_xxxxxxxxxxxxxxxxxxxxxx",
      helper: "Ange Stripe Refund ID (börjar med re_)",
      methodParam: "stripe",
    };
  }
  if (order.paymentMethod === "swish") {
    return {
      label: "Swish",
      placeholder: "T.ex. 123456789012 eller UUID",
      helper: "Ange Swish återbetalningsreferens från bank / Swish Företag",
      methodParam: "swish",
    };
  }
  if (order.onSiteCollection?.method === "card_terminal") {
    return {
      label: "Betala på plats · Kortterminal",
      placeholder: "T.ex. KASSA-TERM-001",
      helper: "Ange referens från kortterminalens returkvitto",
      methodParam: "card_terminal",
    };
  }
  return {
    label: "Betala på plats · Kontant",
    placeholder: "T.ex. KASSA-KONTANT-001",
    helper: "Ange referens från kassans kontantretur / kvitto",
    methodParam: "cash",
  };
}

export function AdminRefundDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: AdminOrderDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: (data: {
    amountSek: number;
    reasonCategory: string;
    reasonNote?: string;
    method?: string;
    externalReference: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const providerInfo = useMemo(() => resolveDisplayProvider(order), [order]);

  // Stable session idempotency key: captured on first submit and reused on retries
  const [sessionKey, setSessionKey] = useState("");

  const [externalReference, setExternalReference] = useState("");
  const [reasonCategory, setReasonCategory] = useState<string>("customer_cancellation");
  const [reasonNote, setReasonNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting && !busy) onClose();
      if (event.key !== "Tab") return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = [...(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onClose, submitting, busy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || busy) return;

    const trimmedRef = externalReference.trim();
    if (!trimmedRef) {
      setErrorMessage("Vänligen ange en extern återbetalningsreferens.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const activeKey = sessionKey || `idemp_ref_${order.publicId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    if (!sessionKey) {
      setSessionKey(activeKey);
    }

    const result = await onConfirm({
      amountSek: order.totalSek,
      reasonCategory,
      reasonNote: reasonNote.trim() || undefined,
      method: providerInfo.methodParam,
      externalReference: trimmedRef,
      idempotencyKey: activeKey,
    });

    if (!result.ok) {
      setErrorMessage(result.error ?? "Kunde inte registrera återbetalningen.");
      setSubmitting(false);
    } else {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="refund-dialog-title"
        className="relative my-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl sm:rounded-3xl border border-[#e4ded2] bg-[#fbf9f4] p-4 sm:p-8 text-[#1f2328] shadow-2xl space-y-4"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          disabled={submitting || busy}
          aria-label="Stäng dialog"
          style={{ borderRadius: "50%" }}
          className="absolute top-3 right-3 sm:top-5 sm:right-5 flex h-7 w-7 sm:h-8 sm:w-8 aspect-square p-0 items-center justify-center border border-[#e2dbce] bg-white text-[#7c828d] shadow-2xs hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer disabled:opacity-50 z-20 shrink-0"
        >
          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="border-b border-[#e8e2d5] pb-3 sm:pb-4 pr-8 sm:pr-10">
          <div>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-[#a78347]">Ekonomisk hantering</p>
            <h2 id="refund-dialog-title" className="mt-1 font-serif text-base sm:text-2xl font-bold">
              Registrera återbetalning
            </h2>
            <p className="mt-0.5 text-[11px] sm:text-xs text-[#7c828d]">
              Beställning <span className="font-mono text-xs sm:text-sm font-bold">{order.publicId}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm">
          {/* Mandatory Explanatory Message */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-[#704d20]">
            <p className="font-semibold text-[#86523b]">Viktigt om återbetalning:</p>
            <p className="mt-1">
              Denna funktion överför inga pengar automatiskt. Genomför återbetalningen hos betalleverantören eller via
              kassan först och registrera sedan referensen här.
            </p>
          </div>

          {/* Read-Only Server-Authoritative Financial Details */}
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#e8e2d5] bg-white p-4 text-xs">
            <div>
              <span className="block text-[11px] font-bold uppercase text-[#8c827a]">Ursprungligt belopp</span>
              <span className="mt-0.5 block text-sm font-semibold text-[#1f2328]">{order.totalSek} kr</span>
            </div>
            <div>
              <span className="block text-[11px] font-bold uppercase text-[#8c827a]">Återbetalas (Fullt)</span>
              <span className="mt-0.5 block text-sm font-semibold text-emerald-800">{order.totalSek} kr</span>
            </div>
            <div className="col-span-2 border-t border-[#f0ece3] pt-2">
              <span className="block text-[11px] font-bold uppercase text-[#8c827a]">Betalsätt</span>
              <span className="mt-0.5 block font-medium text-[#1f2328]">{providerInfo.label}</span>
            </div>
          </div>

          {/* External Reference Input */}
          <div>
            <label htmlFor="refund-external-ref" className="block text-xs font-bold uppercase tracking-wider text-[#8c827a]">
              Extern referens *
            </label>
            <input
              id="refund-external-ref"
              type="text"
              required
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              disabled={submitting || busy}
              placeholder={providerInfo.placeholder}
              className="mt-1.5 block w-full rounded-xl border border-[#d8d0c3] bg-white px-3.5 py-2.5 text-sm text-[#1f2328] shadow-2xs placeholder:text-[#a09a90] focus:border-[#a78347] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[#7c828d]">{providerInfo.helper}</p>
          </div>

          {/* Reason Category Selector */}
          <div>
            <label htmlFor="refund-reason-category" className="block text-xs font-bold uppercase tracking-wider text-[#8c827a]">
              Återbetalningsorsak *
            </label>
            <div className="relative mt-1.5">
              <select
                id="refund-reason-category"
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value)}
                disabled={submitting || busy}
                className="block w-full appearance-none rounded-xl border border-[#d8d0c3] bg-white px-3.5 py-2.5 text-sm text-[#1f2328] shadow-2xs focus:border-[#a78347] focus:outline-none"
              >
                {refundReasonCategories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#7c828d]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m5 7 5 5 5-5" />
              </svg>
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label htmlFor="refund-reason-note" className="block text-xs font-bold uppercase tracking-wider text-[#8c827a]">
              Anteckning (valfritt)
            </label>
            <textarea
              id="refund-reason-note"
              rows={2}
              maxLength={300}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              disabled={submitting || busy}
              placeholder="Beskriv orsak eller kundkontakt..."
              className="mt-1.5 block w-full rounded-xl border border-[#d8d0c3] bg-white p-3 text-sm text-[#1f2328] shadow-2xs focus:border-[#a78347] focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-[#7c828d]">{reasonNote.length} / 300 tecken</p>
          </div>

          {/* Attestation Notice */}
          <p className="text-[11px] text-[#7c828d]">
            Registreringen sparas med status:{" "}
            <span className="font-semibold text-[#555a64]">
              Administrativt intygad – ej verifierad hos betalleverantören
            </span>
          </p>

          {errorMessage && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2.5 border-t border-[#e8e2d5] pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting || busy}
              className="rounded-xl border border-[#ded6c8] bg-white px-4 py-2.5 text-xs font-semibold text-[#5f625f] hover:bg-[#f6f2ea] transition cursor-pointer disabled:opacity-50"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={submitting || busy}
              className="rounded-xl bg-[#a78347] px-5 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#8f6e37] transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Registrerar återbetalning..." : "Bekräfta och registrera"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
