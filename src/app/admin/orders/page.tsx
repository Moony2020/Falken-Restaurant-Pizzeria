import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getAdminAuthConfig, getAdminSession } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { FalkenLoading } from "@/components/falken-loading";

export const metadata: Metadata = { title: "Beställningar – Falken Admin", robots: { index: false, follow: false } };

async function OrdersGate() {
  await connection();
  const cookieStore = await cookies();
  await connectDb();
  const session = await getAdminSession(
    new Request("http://internal/admin/orders", { headers: { cookie: cookieStore.toString() } }),
    getAdminAuthConfig(),
  );
  if (!session) redirect("/admin/login");
  return <AdminDashboard adminEmail={session.principal.email} displayName={session.principal.displayName} initialTab="bestallningar" />;
}

export default function AdminOrdersPage() {
  return <Suspense fallback={<FalkenLoading />}><OrdersGate /></Suspense>;
}
