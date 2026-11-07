"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOrderDetail, AdminOrderSummary } from "@/server/admin-orders";

export type AdminOrdersResponse = { orders: AdminOrderSummary[]; total: number; page: number; limit: number; confirmedCount?: number };
export type AdminOrderFilter = "ALL" | "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP";

function csrfToken() {
  const value = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("falken_admin_csrf="));
  return value ? decodeURIComponent(value.slice("falken_admin_csrf=".length)) : "";
}

export function useAdminOrders(enabled: boolean, filter: AdminOrderFilter, query: string, page: number) {
  const router = useRouter();
  const [list, setList] = useState<AdminOrdersResponse | null>(null);
  const [selected, setSelected] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (!enabled) return;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20", status: filter, q: query.trim() });
      const response = await fetch(`/api/admin/orders?${params}`, { cache: "no-store" });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) throw new Error("Kunde inte hämta beställningar.");
      setList(await response.json() as AdminOrdersResponse);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [enabled, page, filter, query, router]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(true);
    }, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [enabled, refresh]);

  const open = useCallback(async (publicId: string) => {
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}`, { cache: "no-store" });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) throw new Error("Kunde inte öppna beställningen.");
      const data = await response.json() as { order: AdminOrderDetail };
      setSelected(data.order);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    }
  }, [router]);

  const transition = useCallback(async (publicId: string, expectedStatus: string, to: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ to, expectedStatus }),
      });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (response.status === 409) {
        await open(publicId);
        throw new Error("Beställningen ändrades av en annan medarbetare. Kontrollera aktuell status.");
      }
      if (!response.ok) throw new Error("Det gick inte att ändra status.");
      const result = await response.json() as { order: AdminOrderDetail };
      setSelected((current) => current?.publicId === publicId ? result.order : current);
      await refresh(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }, [busy, open, refresh, router]);

  const collectPayment = useCallback(async (publicId: string, method: "cash" | "card_terminal") => {
    if (busy) return;
    setBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}/collect-payment`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ method, idempotencyKey }),
      });
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error === "already_collected" ? "Betalningen är redan registrerad." : "Det gick inte att registrera betalningen.");
      }
      const result = await response.json() as { order: AdminOrderDetail };
      setSelected((current) => current?.publicId === publicId ? result.order : current);
      await refresh(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    } finally {
      setBusy(false);
    }
  }, [busy, refresh, router]);

  return { list, selected, setSelected, loading, busy, error, refresh, open, transition, collectPayment };
}
