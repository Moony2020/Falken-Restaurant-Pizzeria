"use client";

import { CURRENT_SEASON } from "@/data/site";
import { getOpenStatus } from "@/lib/hours";
import { useNow } from "@/lib/use-now";

export function OpenStatus({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const now = useNow();
  const status = now === null ? null : getOpenStatus(new Date(now), CURRENT_SEASON);
  const text = tone === "dark" ? "text-ivory/90" : "text-ink";

  return (
    <p className={`inline-flex min-h-7 items-center gap-2 text-sm ${text}`} aria-live="polite">
      {status && (
        <>
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${status.isOpen ? "bg-emerald-500" : "bg-ember"}`}
          />
          {status.label}
        </>
      )}
    </p>
  );
}
