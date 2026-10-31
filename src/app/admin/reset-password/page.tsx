import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { FalkenLoading } from "@/components/falken-loading";
import { AdminResetPasswordForm } from "@/components/admin/reset-password-form";

export const metadata: Metadata = {
  title: "Återställ lösenord – Falken Administration",
  robots: { index: false, follow: false },
};

export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={<FalkenLoading />}>
      <div className="flex min-h-dvh flex-col justify-between bg-[#faf8f3] text-ink">
        {/* Top bar - Black like customer header */}
        <header className="border-b border-ink-3 bg-ink-2 px-6 py-4 text-ivory shadow-xs">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo />
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                Personalportal
              </span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-300 transition hover:text-gold"
            >
              ← Till webbplatsen
            </Link>
          </div>
        </header>

        {/* Card */}
        <main className="my-auto px-4 py-12 sm:px-6">
          <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-card sm:p-10">
            <div className="text-center">
              <span className="inline-block rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-deep">
                Falken Administration
              </span>
              <h1 className="mt-4 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                Nytt lösenord
              </h1>
              <p className="mt-2 text-xs text-muted">
                Välj ett nytt, säkert lösenord för ditt administratörskonto.
              </p>
            </div>

            <div className="mt-8">
              <AdminResetPasswordForm />
            </div>

            <p className="mt-8 text-center text-[11px] text-muted">
              Skyddad med Scrypt-kryptering och automatisk sessions-ogiltigförklaring.
            </p>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-line py-4 text-center text-xs text-muted">
          © 2026 Restaurang & Pizzeria Falken — Internt administrationssystem
        </footer>
      </div>
    </Suspense>
  );
}

