"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { FalkenLoading } from "@/components/falken-loading";

export function AdminLoginForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || isRedirecting) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          setMessage("För många misslyckade försök. Vänta en stund och försök igen.");
        } else {
          setMessage("Felaktig e-postadress eller lösenord.");
        }
        setBusy(false);
        return;
      }

      // Login verified: show full loading screen immediately and navigate
      setIsRedirecting(true);
      window.location.href = "/admin";
    } catch {
      setMessage("Inloggningen kunde inte genomföras. Kontrollera nätverket och försök igen.");
      setBusy(false);
    }
  }

  if (isRedirecting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#faf8f3]">
        <FalkenLoading label="Verifierad! Öppnar administrationspanelen…" fullScreen />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          E-post
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="namn@exempel.se"
            className="rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink placeholder-muted outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="admin-password" className="text-sm font-semibold text-ink">
              Lösenord
            </label>
            <Link
              href="/admin/forgot-password"
              className="text-xs font-semibold text-gold-deep hover:underline focus:outline-none"
            >
              Glömt lösenord?
            </Link>
          </div>

          <div className="relative">
            <input
              id="admin-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 pr-11 text-base text-ink placeholder-muted outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-ink focus:outline-none"
              aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
              title={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {message ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || isRedirecting}
          className="w-full rounded-xl bg-gold px-5 py-3.5 font-semibold text-ink shadow-sm transition hover:bg-gold-light active:scale-[0.99] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
        >
          {busy || isRedirecting ? (
            <>
              <span className="inline-block size-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
              <span>Verifierar personal…</span>
            </>
          ) : (
            "Logga in till Admin"
          )}
        </button>
      </form>
    </div>
  );
}
