import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { connection } from "next/server";
import Link from "next/link";
import { AdminLoginForm } from "@/components/admin/login-form";
import { getAdminAuthConfig, getAdminSession } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";
import { FalconEmblem } from "@/components/icons";
import { FalkenLoading } from "@/components/falken-loading";

export const metadata: Metadata = {
  title: "Personalinloggning – Falken Administration",
  robots: { index: false, follow: false },
};

async function LoginGate() {
  await connection();
  const cookieStore = await cookies();
  await connectDb();
  const session = await getAdminSession(
    new Request("http://internal/admin/login", { headers: { cookie: cookieStore.toString() } }),
    getAdminAuthConfig(),
  );
  if (session) redirect("/admin");

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-[#faf8f3] text-ink selection:bg-gold/20">
      {/* Login Card */}
      <main className="my-auto flex flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg rounded-3xl border border-line bg-white p-8 shadow-card sm:p-11">
          {/* Falken Crest & Header (Non-clickable branding) */}
          <div className="flex flex-col items-center text-center select-none">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep ring-1 ring-gold/30 shadow-xs">
              <FalconEmblem className="h-7 w-7 text-gold-deep" />
            </div>
            <span className="font-display text-2xl font-semibold tracking-[0.18em] text-ink sm:text-[1.75rem]">
              FALKEN
            </span>
            <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.35em] text-gold-deep">
              Restaurang &amp; Pizzeria
            </span>
            <span className="mt-3.5 inline-block rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-deep">
              Falken Administration
            </span>

            <h1 className="mt-4 font-display text-2xl font-medium tracking-tight text-ink sm:text-3xl">
              Personalinloggning
            </h1>
            <p className="mt-1.5 text-xs text-muted">
              Säker åtkomst för restaurangledning och behörig personal.
            </p>
          </div>

          <div className="mt-8">
            <AdminLoginForm />
          </div>

          <p className="mt-8 text-center text-[11px] text-muted">
            Skyddad med Scrypt-kryptering och tvådelade sessions-cookies.
          </p>

          {/* Till webbplatsen link at the bottom of the card */}
          <div className="mt-6 border-t border-line/70 pt-5 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 transition-colors hover:text-ink hover:underline underline-offset-4"
            >
              ← Till webbplatsen
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="pb-6 text-center text-xs text-muted">
        © 2026 Restaurang & Pizzeria Falken — Internt administrationssystem
      </footer>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<FalkenLoading />}>
      <LoginGate />
    </Suspense>
  );
}
