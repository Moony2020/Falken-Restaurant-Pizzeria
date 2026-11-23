"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminOrderDetail, AdminOrderSummary } from "@/server/admin-orders";

export type AdminOrdersResponse = { orders: AdminOrderSummary[]; total: number; page: number; limit: number; confirmedCount?: number };
export type AdminOrderFilter = "ALL" | "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP" | "CANCELLED" | "REFUNDED";

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

  const cancelOrder = useCallback(async (publicId: string, reasonCategory: string, reasonNote?: string) => {
    if (busy) return { ok: false, error: "Åtgärden pågår redan." };
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ reasonCategory, reasonNote: reasonNote?.trim() }),
      });
      if (response.status === 401) { router.replace("/admin/login"); return { ok: false, error: "Ej inloggad." }; }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        let message = "Kunde inte avbryta beställningen.";
        if (body?.error === "refund_required") message = "Beställningen är betald och kräver återbetalning, kan ej avbrytas direkt.";
        else if (body?.error === "transactions_required") message = "Databasens transaktioner är tillfälligt otillgängliga. Försök igen.";
        else if (body?.error === "cancellation_blocked_session_active") message = "Beställningen kan inte avbrytas eftersom betalsessionen fortfarande är aktiv eller inväntar svar från betalleverantören.";
        else if (body?.error === "conflict") message = "Beställningens status har ändrats. Kontrollera aktuell status.";
        await open(publicId);
        return { ok: false, error: message };
      }
      await open(publicId);
      await refresh(true);
      setError("");
      return { ok: true };
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Ett oväntat fel uppstod.";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [busy, open, refresh, router]);

  const recordRefund = useCallback(async (
    publicId: string,
    data: {
      amountSek: number;
      reasonCategory: string;
      reasonNote?: string;
      method?: string;
      externalReference: string;
      idempotencyKey: string;
    }
  ) => {
    if (busy) return { ok: false, error: "Åtgärden pågår redan." };
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(publicId)}/refund`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify(data),
      });
      if (response.status === 401) { router.replace("/admin/login"); return { ok: false, error: "Ej inloggad." }; }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        let message = "Det gick inte att registrera återbetalningen.";
        if (body?.error === "transactions_required") {
          message = "Databasens transaktioner är tillfälligt otillgängliga. Ingen ändring har sparats. Försök igen om en stund.";
        } else if (body?.error === "already_refunded") {
          message = "Beställningen är redan registrerad som återbetald.";
        } else if (body?.error === "idempotency_conflict") {
          message = "Konflikt: Samma sessionsnyckel användes med andra uppgifter.";
        } else if (body?.error === "duplicate_external_reference") {
          message = "Denna externa referens har redan använts för en annan beställning.";
        } else if (body?.error === "payment_record_missing" || body?.error === "payment_already_refunded" || body?.error === "inconsistent_payment_refund") {
          message = "Betalsystemets underlag kan inte återbetalas eller är redan återbetalt.";
        } else if (body?.error === "invalid_reference_format") {
          message = "Ogiltigt format på den externa referensen för valt betalsätt.";
        } else if (body?.error === "refund_amount_mismatch") {
          message = "Återbetalningsbeloppet matchar inte beställningens totalbelopp.";
        } else if (body?.error === "method_mismatch") {
          message = "Valt betalsätt matchar inte hur beställningen ursprungligen betalades.";
        }
        await open(publicId);
        return { ok: false, error: message };
      }
      await open(publicId);
      await refresh(true);
      setError("");
      return { ok: true };
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : "Nätverksfel eller okänt svar. Kontrollera aktuell orderstatus innan du försöker igen.";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [busy, open, refresh, router]);

  return { list, selected, setSelected, loading, busy, error, refresh, open, transition, collectPayment, cancelOrder, recordRefund };
}
