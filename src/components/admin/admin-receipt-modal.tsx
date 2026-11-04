"use client";

import { useEffect, useRef } from "react";
import { downloadReceiptPdf, printOrderReceipt, type ReceiptPdfInput } from "@/lib/order-receipt-pdf";

export type AdminReceiptModalProps = {
  receipt: ReceiptPdfInput;
  onClose: () => void;
};

export function AdminReceiptModal({ receipt, onClose }: AdminReceiptModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isPaid = receipt.paymentStatus.toLowerCase().includes("betald") || receipt.paymentStatus.toLowerCase() === "paid";
  const docTitle = isPaid ? "Kvitto" : "Orderbekräftelse";
  const vatAmount = Math.round(receipt.totalSek * 0.1071);
  const subtotalExclVat = receipt.totalSek - vatAmount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative my-auto max-h-[95dvh] w-full max-w-[420px] overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fdfbf7] p-5 sm:p-6 text-[#1f2328] shadow-2xl space-y-4 font-sans"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        {/* Close button top-right - smaller and more refined */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Stäng kvitto"
          className="absolute right-3 top-3 sm:right-3.5 sm:top-3.5 flex h-6 w-6 items-center justify-center rounded-full border border-[#e2dbce] bg-white text-[11px] font-bold text-[#7c828d] hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer z-10 shadow-2xs"
        >
          ✕
        </button>

        {/* Receipt Header */}
        <div className="text-center border-b border-dashed border-[#dcd5c7] pb-4 pt-1">
          <p className="text-[10px] sm:text-xs font-semibold tracking-widest text-[#a3884b] uppercase px-8 sm:px-4">
            Falken Restaurang &amp; Pizzeria
          </p>
          <h2 id="receipt-title" className="font-serif text-lg sm:text-xl font-bold text-[#1f2328] mt-0.5 px-8 sm:px-4">
            {docTitle} {receipt.orderNumber.replace(/^#/, "")}
          </h2>
          <p className="text-[11px] text-[#7c828d] mt-0.5">
            Kungsbacka · Tel: 0300-123 45
          </p>
        </div>

        {/* Metadata info */}
        <div className="space-y-1.5 text-xs border-b border-dashed border-[#dcd5c7] pb-3">
          <div className="flex justify-between text-[#555a64]">
            <span>Datum:</span>
            <strong className="text-[#1f2328]">{receipt.date}</strong>
          </div>
          <div className="flex justify-between text-[#555a64]">
            <span>Kund:</span>
            <strong className="text-[#1f2328]">{receipt.customerName}</strong>
          </div>
          {receipt.phone && (
            <div className="flex justify-between text-[#555a64]">
              <span>Telefon:</span>
              <strong className="text-[#1f2328]">{receipt.phone}</strong>
            </div>
          )}
          <div className="flex justify-between text-[#555a64]">
            <span>Betalsätt:</span>
            <strong className="text-[#1f2328]">{receipt.paymentMethod}</strong>
          </div>
          <div className="flex justify-between items-center text-[#555a64]">
            <span>Status:</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                isPaid ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fffbeb] text-[#92400e]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isPaid ? "bg-[#059669]" : "bg-[#d97706]"}`} />
              {isPaid ? "Betald" : "Väntar på betalning"}
            </span>
          </div>
        </div>

        {/* Ordered items */}
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8c827a] mb-2">
            Beställda artiklar
          </p>
          <div className="space-y-2 text-xs">
            {receipt.items.map((it, idx) => (
              <div key={idx} className="flex justify-between gap-3">
                <span className="font-medium text-[#1f2328] leading-tight">
                  {it.quantity}× {it.description}
                </span>
                <span className="font-bold text-[#1f2328] shrink-0">
                  {it.quantity * it.unitPriceSek} kr
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals & VAT breakdown */}
        <div className="py-2.5 space-y-1.5 text-xs border-y border-dashed border-[#dcd5c7]">
          <div className="flex justify-between text-[#7c828d]">
            <span>Delsumma (exkl. moms)</span>
            <span>{subtotalExclVat} kr</span>
          </div>
          <div className="flex justify-between text-[#7c828d]">
            <span>Moms (12%)</span>
            <span>{vatAmount} kr</span>
          </div>
          <div className="flex justify-between items-baseline pt-1.5 font-bold text-[#1f2328] border-t border-[#f0ebe0]">
            <span className="text-sm">Totalt att betala</span>
            <span className="text-lg text-[#837147] font-bold">
              {receipt.totalSek} kr
            </span>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center py-1 text-[11px] text-[#8c827a]">
          <p className="font-serif italic">Tack för din beställning hos Falken!</p>
          <p className="text-[10px] text-[#a09a90] mt-0.5">Godkänd för F-skatt · Org.nr 556123-4567</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#e8e2d5]">
          <button
            type="button"
            onClick={() => printOrderReceipt(receipt)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#e4ded2] bg-white px-3 py-2.5 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition cursor-pointer shadow-2xs"
          >
            <span>🖨️</span>
            <span>Skriv ut</span>
          </button>

          <button
            type="button"
            onClick={() => downloadReceiptPdf(receipt)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#837147] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#72623c] transition shadow-2xs cursor-pointer"
          >
            <span>📥</span>
            <span>Ladda ner PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
