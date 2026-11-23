"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminOrderDetail } from "@/server/admin-orders";

const reasonCategories = [
  { value: "customer_cancellation", label: "Kunden avbokade / ångrade sig" },
  { value: "out_of_stock", label: "Ingrediens / produkt slut" },
  { value: "kitchen_delay", label: "Försening i köket" },
  { value: "quality_issue", label: "Kvalitetsavvikelse" },
  { value: "other", label: "Övrigt" },
] as const;

export function AdminCancelDialog({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: AdminOrderDetail;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reasonCategory: string, reasonNote?: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
    setSubmitting(true);
    setErrorMessage("");
    const result = await onConfirm(reasonCategory, reasonNote.trim() || undefined);
    if (!result.ok) {
      setErrorMessage(result.error ?? "Kunde inte avbryta beställningen.");
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
        aria-labelledby="cancel-dialog-title"
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
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-red-700">Avbryt beställning</p>
            <h2 id="cancel-dialog-title" className="mt-1 font-serif text-base sm:text-2xl font-bold">
              Beställning <span className="font-mono text-xs sm:text-sm font-bold">{order.publicId}</span>
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-sm">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-[#704d20]">
            <p className="font-semibold text-[#86523b]">Observera – ingen återbetalning</p>
            <p className="mt-1">
              Denna beställning är obetald. Inga pengar dras eller återbetalas. Beställningen markeras permanent som
              avbruten och ett administrativt granskningslogg sparas.
            </p>
          </div>

          <div>
            <label htmlFor="cancel-reason-category" className="block text-xs font-bold uppercase tracking-wider text-[#8c827a]">
              Orsak till avbrytning *
            </label>
            <div className="relative mt-1.5">
              <select
                id="cancel-reason-category"
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value)}
                disabled={submitting || busy}
                className="block w-full appearance-none rounded-xl border border-[#d8d0c3] bg-white px-3.5 py-2.5 text-sm text-[#1f2328] shadow-2xs focus:border-[#a78347] focus:outline-none"
              >
                {reasonCategories.map((c) => (
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

          <div>
            <label htmlFor="cancel-reason-note" className="block text-xs font-bold uppercase tracking-wider text-[#8c827a]">
              Anteckning (valfritt)
            </label>
            <textarea
              id="cancel-reason-note"
              rows={3}
              maxLength={300}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              disabled={submitting || busy}
              placeholder="Beskriv eventuella detaljer om avbokningen..."
              className="mt-1.5 block w-full rounded-xl border border-[#d8d0c3] bg-white p-3 text-sm text-[#1f2328] shadow-2xs focus:border-[#a78347] focus:outline-none"
            />
            <p className="mt-1 text-right text-[11px] text-[#7c828d]">{reasonNote.length} / 300 tecken</p>
          </div>

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
              Tillbaka
            </button>
            <button
              type="submit"
              disabled={submitting || busy}
              className="rounded-xl bg-red-700 px-5 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-red-800 transition cursor-pointer disabled:opacity-50"
            >
              {submitting ? "Avbryter..." : "Bekräfta avbrytning"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
