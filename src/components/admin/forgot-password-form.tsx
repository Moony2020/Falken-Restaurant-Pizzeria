"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";

export function AdminForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) return;

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 429) {
          setMessage(data?.message || "För många förfrågningar. Vänta en stund och försök igen.");
        } else {
          setMessage(data?.message || "Kunde inte skicka återställningslänk. Försök igen.");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setMessage("Kunde inte ansluta till servern. Kontrollera nätverket och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
          <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Kontrollera din e-post</h2>
          <p className="text-sm leading-relaxed text-muted">
            Om adressen <strong className="text-ink">{email}</strong> finns registrerad har vi skickat en länk för att återställa lösenordet.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-paper/60 p-4 text-xs text-muted leading-relaxed text-left">
          <p className="font-semibold text-ink">Bra att veta:</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Länken är aktiv i <strong>30 minuter</strong>.</li>
            <li>Kontrollera även mappen för skräppost (Spam).</li>
            <li>Du kan begära en ny länk om den gamla har gått ut.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/admin/login"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold px-5 font-semibold text-ink shadow-sm transition hover:bg-gold-light"
          >
            Tillbaka till inloggning
          </Link>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="text-xs font-semibold text-muted transition hover:text-ink hover:underline"
          >
            Skicka till en annan e-postadress
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          Administratörens e-post
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
            placeholder="namn@exempel.se"
            className="rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink placeholder-muted outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
          />
        </label>

        {message && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full rounded-xl bg-gold px-5 py-3.5 font-semibold text-ink shadow-sm transition hover:bg-gold-light active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {busy ? "Skickar återställningslänk…" : "Skicka återställningslänk"}
        </button>

        <div className="pt-2 text-center">
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink hover:underline"
          >
            <ArrowIcon className="size-3 rotate-180 text-gold-deep" />
            Tillbaka till inloggning
          </Link>
        </div>
      </form>
    </div>
  );
}

