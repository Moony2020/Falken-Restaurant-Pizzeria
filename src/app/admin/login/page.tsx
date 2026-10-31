import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AdminLoginForm } from "@/components/admin/login-form";
import { getAdminAuthConfig, getAdminSession } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { FalkenLoading } from "@/components/falken-loading";

export const metadata: Metadata = { title: "Personalinloggning – Falken Administration", robots: { index: false, follow: false } };

async function LoginGate() {
  await connection();
  const cookieStore = await cookies();
  await connectDb();
  const session = await getAdminSession(new Request("http://internal/admin/login", { headers: { cookie: cookieStore.toString() } }), getAdminAuthConfig());
  if (session) redirect("/admin");

  return (
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

      {/* Login Card */}
      <main className="my-auto px-4 py-12 sm:px-6">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-8 shadow-card sm:p-10">
          <div className="text-center">
            <span className="inline-block rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-deep">
              Falken Administration
            </span>
            <h1 className="mt-4 font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
              Personalinloggning
            </h1>
            <p className="mt-2 text-xs text-muted">
              Säker åtkomst för restaurangledning och behörig personal.
            </p>
          </div>

          <div className="mt-8">
            <AdminLoginForm />
          </div>

          <p className="mt-8 text-center text-[11px] text-muted">
            Skyddad med Scrypt-kryptering och tvådelade sessions-cookies.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-line py-4 text-center text-xs text-muted">
        © 2026 Restaurang & Pizzeria Falken — Internt administrationssystem
      </footer>
    </div>
  );
}

export default function AdminLoginPage() {
  return <Suspense fallback={<FalkenLoading />}><LoginGate /></Suspense>;
}
