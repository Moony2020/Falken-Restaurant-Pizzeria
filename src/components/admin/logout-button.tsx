"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogoutButton({ className = "" }: { className?: string } = {}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setBusy(true);
    try {
      const csrf = document.cookie
        .split("; ")
        .find((row) => row.startsWith("falken_admin_csrf="))
        ?.split("=")[1];

      const response = await fetch("/api/admin/auth/logout", {
        method: "POST",
        headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
      });
      if (!response.ok) throw new Error("Kunde inte logga ut. Försök igen.");
      router.replace("/admin/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunde inte logga ut.");
    } finally {
      setBusy(false);
    }
  }

  return (<div>
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 cursor-pointer shadow-xs ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {busy ? "Loggar ut…" : "Logga ut"}
    </button>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </div>
  );
}
