"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EyeIcon, EyeOffIcon, ArrowIcon } from "@/components/icons";

export function AdminResetPasswordForm({
  verifyTimeoutMs = 5000,
  slowThresholdMs = 2500,
}: {
  verifyTimeoutMs?: number;
  slowThresholdMs?: number;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [checking, setChecking] = useState(() => Boolean(token));
  const [tokenValid, setTokenValid] = useState<boolean | null>(() => (!token ? false : null));
  const [userEmail, setUserEmail] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);
  const [slowVerification, setSlowVerification] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

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

  // Validate token on mount with bounded timeout (default 5s) and graceful fallback
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    const controller = new AbortController();

    // Visual hint if verification takes longer than slowThresholdMs (default 2.5s)
    const slowTimer = setTimeout(() => {
      if (isMounted) setSlowVerification(true);
    }, slowThresholdMs);

    // Hard timeout after verifyTimeoutMs (default 5s) to prevent indefinite spinner lockup
    const timeoutTimer = setTimeout(() => {
      controller.abort();
    }, verifyTimeoutMs);

    async function verify() {
      try {
        const res = await fetch(`/api/admin/auth/verify-reset-token?token=${encodeURIComponent(token)}`, {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        // NOTE: timeouts are NOT cleared here — the AbortController signal remains armed through
        // the full async operation (fetch + response body read + JSON parse). Clearing here would
        // leave a stalled res.json() uncovered.

        if (!isMounted) return;
        if (controller.signal.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }

        if (res.ok) {
          // res.json() is also covered by the signal — a body-read stall will trigger the abort.
          // Do NOT swallow errors with .catch(() => null): an aborted or failed body read must
          // enter the catch block below and NOT be misclassified as an invalid/expired token.
          const data = await res.json();
          if (controller.signal.aborted) {
            throw new DOMException("The operation was aborted.", "AbortError");
          }
          clearTimeout(slowTimer);
          clearTimeout(timeoutTimer);
          if (!isMounted) return;
          if (data?.valid === true) {
            setTokenValid(true);
            setUserEmail(data.email || "");
            setUserName(data.name || "");
            setVerificationNotice(null);
          } else if (data?.valid === false) {
            // Explicitly confirmed invalid or expired by the server
            setTokenValid(false);
            setVerificationNotice(null);
          } else {
            // Unexpected payload shape — do not falsely mark token invalid
            setTokenValid(true);
            setVerificationNotice(
              "Förhandsgranskning kunde inte slutföras. Länken valideras automatiskt när du sparar ditt lösenord."
            );
          }
        } else if (res.status === 400) {
          clearTimeout(slowTimer);
          clearTimeout(timeoutTimer);
          // Explicitly invalid token format or missing token
          setTokenValid(false);
          setVerificationNotice(null);
        } else {
          clearTimeout(slowTimer);
          clearTimeout(timeoutTimer);
          // Server 5xx or transient response: gracefully allow form submission; server will validate on submit
          setTokenValid(true);
          setVerificationNotice(
            "Förhandsgranskning kunde inte slutföras. Länken valideras automatiskt när du sparar ditt lösenord."
          );
        }
      } catch {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);

        if (!isMounted) return;

        // Aborted (timeout) or network/body-read glitch (e.g. dev server compilation queue):
        // Do NOT falsely mark token as invalid or silently valid — set unverified fallback + amber notice.
        // The server will perform definitive validation on POST /api/admin/auth/reset-password.
        setTokenValid(true);
        setVerificationNotice(
          "Förhandsgranskningen tog längre tid än väntat. Du kan fylla i ditt lösenord ändå – länken verifieras när du sparar."
        );
      } finally {
        if (isMounted) {
          setChecking(false);
          setSlowVerification(false);
        }
      }
    }

    verify();

    return () => {
      isMounted = false;
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      controller.abort();
    };
  }, [token, retryCount, slowThresholdMs, verifyTimeoutMs]);

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
      <div className="py-8 text-center space-y-4">
        <div className="mx-auto size-9 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        <div className="space-y-1">
          <p className="text-xs font-medium text-ink">Verifierar återställningslänk…</p>
          {slowVerification && (
            <p className="text-[11px] text-muted animate-pulse">
              Förbereder anslutningen, vänligen vänta ett ögonblick…
            </p>
          )}
        </div>
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
          <button
            type="button"
            onClick={() => {
              setChecking(true);
              setRetryCount((c) => c + 1);
            }}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-white px-5 text-xs font-semibold text-ink shadow-2xs transition hover:bg-gold/10 hover:border-gold/30 cursor-pointer"
          >
            Försök verifiera igen
          </button>
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
        <div className="rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs text-muted">
          Återställer lösenord för <span className="font-semibold text-ink">{userName ? `${userName} (${userEmail})` : userEmail}</span>
        </div>
      )}
      {verificationNotice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 leading-relaxed space-y-1.5">
          <p>{verificationNotice}</p>
          <button
            type="button"
            onClick={() => {
              setChecking(true);
              setVerificationNotice(null);
              setRetryCount((c) => c + 1);
            }}
            className="font-semibold underline hover:text-amber-950 cursor-pointer"
          >
            Försök verifiera igen
          </button>
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

