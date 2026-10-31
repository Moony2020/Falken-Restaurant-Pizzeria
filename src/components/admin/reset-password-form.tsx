"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, ArrowIcon } from "@/components/icons";

export function AdminResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(() => Boolean(token));
  const [tokenValid, setTokenValid] = useState<boolean | null>(() => (!token ? false : null));
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Auto-redirect countdown upon success
  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) {
      router.replace("/admin/login");
      router.refresh();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [success, countdown, router]);

  // Validate token on mount
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function verify() {
      try {
        const res = await fetch(`/api/admin/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => null);

        if (!isMounted) return;

        if (res.ok && data?.valid) {
          setTokenValid(true);
          setUserEmail(data.email || "");
          setUserName(data.name || "");
        } else {
          setTokenValid(false);
        }
      } catch {
        if (isMounted) setTokenValid(false);
      } finally {
        if (isMounted) setChecking(false);
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage("Lösenordet måste vara minst 8 tecken långt.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Lösenorden matchar inte. Kontrollera och försök igen.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/admin/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setMessage(data?.message || "Kunde inte återställa lösenordet. Länken kan ha gått ut.");
        return;
      }

      setSuccess(true);
    } catch {
      setMessage("Ett nätverksfel uppstod. Kontrollera din anslutning och försök igen.");
    } finally {
      setBusy(false);
    }
  }

  // Loading state
  if (checking) {
    return (
      <div className="py-8 text-center space-y-3">
        <div className="mx-auto size-9 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <p className="text-xs text-muted">Verifierar återställningslänk…</p>
      </div>
    );
  }

  // Invalid or expired token
  if (!tokenValid) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-600 border border-red-200">
          <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Ogiltig eller utgången länk</h2>
          <p className="text-sm leading-relaxed text-muted">
            Länken för lösenordsåterställning är ogiltig eller har redan passerat sin giltighetstid (30 minuter).
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/admin/forgot-password"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold px-5 font-semibold text-ink shadow-sm transition hover:bg-gold-light"
          >
            Begär ny återställningslänk
          </Link>
          <Link
            href="/admin/login"
            className="text-xs font-semibold text-muted transition hover:text-ink hover:underline"
          >
            Tillbaka till inloggning
          </Link>
        </div>
      </div>
    );
  }

  // Password reset successful
  if (success) {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
          <svg className="size-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-semibold text-ink">Lösenordet är uppdaterat!</h2>
          <p className="text-sm leading-relaxed text-muted">
            Ditt nya lösenord har sparats och gamla sessioner har loggats ut för säkerhets skull.
          </p>
          <p className="text-xs font-semibold text-gold-deep animate-pulse">
            Omdirigerar till inloggningen om {countdown} sekunder…
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/admin/login"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-gold px-5 font-semibold text-ink shadow-sm transition hover:bg-gold-light"
          >
            Logga in direkt
          </Link>
        </div>
      </div>
    );
  }

  // Reset form
  return (
    <div className="space-y-6">
      {userEmail && (
        <div className="rounded-xl border border-line bg-paper/60 px-4 py-3 text-xs text-muted">
          Återställer för: <strong className="text-ink">{userEmail}</strong>
          {userName && <span className="text-muted/80"> ({userName})</span>}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5" noValidate>
        {/* New Password */}
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-sm font-semibold text-ink">
            Nytt lösenord
          </label>
          <div className="relative">
            <input
              id="new-password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              autoFocus
              placeholder="Minst 8 tecken"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 pr-11 text-base text-ink placeholder-muted outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-ink focus:outline-none"
              aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          <p className="text-[11px] text-muted">Minst 8 tecken (gärna med siffror och specialtecken).</p>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-semibold text-ink">
            Bekräfta nytt lösenord
          </label>
          <div className="relative">
            <input
              id="confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              placeholder="Upprepa lösenordet"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 pr-11 text-base text-ink placeholder-muted outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted transition hover:text-ink focus:outline-none"
              aria-label={showConfirmPassword ? "Dölj lösenord" : "Visa lösenord"}
            >
              {showConfirmPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {message && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !password || !confirmPassword}
          className="w-full rounded-xl bg-gold px-5 py-3.5 font-semibold text-ink shadow-sm transition hover:bg-gold-light active:scale-[0.99] disabled:opacity-60 cursor-pointer"
        >
          {busy ? "Sparar nytt lösenord…" : "Spara nytt lösenord"}
        </button>

        <div className="pt-2 text-center">
          <Link
            href="/admin/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink hover:underline"
          >
            <ArrowIcon className="size-3 rotate-180 text-gold-deep" />
            Avbryt och gå till inloggning
          </Link>
        </div>
      </form>
    </div>
  );
}

