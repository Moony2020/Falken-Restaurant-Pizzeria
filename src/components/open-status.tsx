"use client";

import { useRestaurantStatus } from "@/lib/use-restaurant-status";

export function OpenStatus({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { status } = useRestaurantStatus();
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
