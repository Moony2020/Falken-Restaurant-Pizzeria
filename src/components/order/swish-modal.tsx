"use client";

import { useEffect, useState, useRef } from "react";
import { SwishLogo } from "../icons.tsx";
import { generateQrSvg } from "../../lib/qr.ts";

export type SwishModalProps = {
  isOpen: boolean;
  publicId: string;
  totalSek: number;
  accessToken?: string;
  onClose: () => void;
  onSuccess: (publicId: string) => void;
};

export function SwishModal({
  isOpen,
  publicId,
  totalSek,
  accessToken,
  onClose,
  onSuccess,
}: SwishModalProps) {
  const [loading, setLoading] = useState(true);
  const [swishUrl, setSwishUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [status, setStatus] = useState<"initiating" | "waiting" | "paid" | "failed">("initiating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize or retry Swish payment
  useEffect(() => {
    if (!isOpen) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    let active = true;

    async function load() {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers["x-order-token"] = accessToken;

        const res = await fetch(`/api/orders/${publicId}/swish`, {
          method: "POST",
          headers,
        });

        const data = await res.json();
        if (!active) return;

        if (!res.ok) {
          setStatus("failed");
          setErrorMessage(data.message || "Kunde inte initiera Swish-betalning");
          setLoading(false);
          return;
        }

        if (data.paid) {
          setStatus("paid");
          setLoading(false);
          setTimeout(() => onSuccess(publicId), 1000);
          return;
        }

        setSwishUrl(data.swishUrl);
        const svg = generateQrSvg(data.swishUrl, 200);
        setQrSvg(svg);
        setStatus("waiting");
        setLoading(false);
      } catch {
        if (!active) return;
        setStatus("failed");
        setErrorMessage("Ett nätverksfel uppstod vid kontakt med Swish");
        setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, publicId, accessToken, onSuccess, retryCount]);

  // Polling for payment status
  useEffect(() => {
    if (!isOpen || status !== "waiting") {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers["x-order-token"] = accessToken;

        const res = await fetch(`/api/orders/${publicId}/swish`, { headers });
        const data = await res.json();

        if (data.paid) {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setStatus("paid");
          setTimeout(() => onSuccess(publicId), 1200);
        } else if (data.status === "failed") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setStatus("failed");
          setErrorMessage(data.errorMessage || "Betalningen nekades eller avbröts");
        }
      } catch {
        // Continue polling on transient network hiccup
      }
    }, 2000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isOpen, status, publicId, accessToken, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-white shadow-2xl p-6 sm:p-8 text-center animate-scale-up">
        {/* Header with Swish Logo */}
        <div className="flex flex-col items-center">
          <div className="flex items-center justify-center p-3 rounded-2xl bg-cream/60 border border-line mb-3">
            <SwishLogo className="h-8 w-auto" />
          </div>
          <h3 className="font-display text-2xl font-semibold text-ink">Betala med Swish</h3>
          <p className="mt-1 text-xs text-muted">Beställning {publicId}</p>

          <div className="mt-3 flex items-center gap-2 rounded-full bg-cream px-3 py-1 text-xs font-semibold text-gold-deep border border-line">
            <span>Belopp att betala:</span>
            <span className="text-sm font-bold text-ink">{totalSek} kr</span>
          </div>

          <span className="mt-2 text-[10px] uppercase font-bold tracking-wider text-muted">
            Testläge • Merchant Swish Simulator
          </span>
        </div>

        {/* Content based on status */}
        <div className="mt-6 flex flex-col items-center justify-center min-h-[220px]">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <div className="size-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
              <p className="text-xs text-muted">Initierar säker anslutning till Swish…</p>
            </div>
          )}

          {!loading && status === "waiting" && (
            <div className="w-full flex flex-col items-center">
              {/* QR Code Container (Desktop & Tablet) */}
              {qrSvg && (
                <div className="relative p-3 rounded-2xl border-2 border-line bg-white shadow-inner max-w-[220px] w-full aspect-square flex items-center justify-center">
                  <div
                    className="w-full h-full flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                </div>
              )}

              {/* Instructions */}
              <p className="mt-3 text-xs text-muted max-w-xs">
                Öppna din <strong>Swish-app</strong> och scanna QR-koden för att godkänna köpet.
              </p>

              {/* Mobile direct deep link button */}
              {swishUrl && (
                <div className="mt-4 w-full sm:hidden">
                  <a
                    href={swishUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-sm font-semibold text-ink shadow hover:bg-gold-light transition"
                  >
                    <SwishLogo className="h-4 w-auto" />
                    <span>Öppna i Swish-appen</span>
                  </a>
                </div>
              )}

              {/* Polling Indicator */}
              <div className="mt-5 flex items-center gap-2 text-xs font-medium text-gold-deep">
                <span className="size-2 rounded-full bg-gold animate-ping" />
                <span>Väntar på betalning i Swish…</span>
              </div>
            </div>
          )}

          {!loading && status === "paid" && (
            <div className="flex flex-col items-center gap-3">
              <div className="grid size-14 place-items-center rounded-full bg-forest/10 text-forest border border-forest/20">
                <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-ink">Betalning mottagen!</h4>
              <p className="text-xs text-muted">Bekräftar din beställning och skickar till köket…</p>
            </div>
          )}

          {!loading && status === "failed" && (
            <div className="flex flex-col items-center gap-3">
              <div className="grid size-14 place-items-center rounded-full bg-ember/10 text-ember border border-ember/20">
                <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-ink">Betalningen kunde inte slutföras</h4>
              <p className="text-xs text-ember max-w-xs">{errorMessage || "Förfrågan avbröts eller nekades."}</p>

              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setStatus("initiating");
                  setErrorMessage(null);
                  setRetryCount((c) => c + 1);
                }}
                className="mt-2 rounded-xl bg-gold px-4 py-2 text-xs font-semibold text-ink hover:bg-gold-light transition"
              >
                Försök igen
              </button>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 border-t border-line pt-4 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-muted hover:text-ink transition"
          >
            {status === "paid" ? "Stäng" : "Avbryt och välj annat betalsätt"}
          </button>
        </div>
      </div>
    </div>
  );
}

