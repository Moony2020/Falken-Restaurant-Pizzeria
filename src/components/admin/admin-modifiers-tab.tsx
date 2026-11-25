"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminModifier } from "@/server/admin-modifier-editing";

type EditPayload = {
  expectedRevision: number;
  labelSv: string;
  maxQty: number;
  compatibleCategories: string[];
  priceByVariantSek: Record<string, number>;
  priceStatus: "confirmed" | "needs_review";
  active: boolean;
};

type RetryState = { idempotencyKey: string; payload: EditPayload };

const ALL_CATEGORIES = [
  { slug: "pizza", label: "Pizza" },
  { slug: "kebabpizza", label: "Kebabpizza" },
  { slug: "kebab", label: "Kebab & Rullar" },
  { slug: "hamburgare", label: "Hamburgare" },
  { slug: "sallader", label: "Sallader" },
  { slug: "alacarte", label: "À la carte" },
  { slug: "barn", label: "Barnmeny" },
];

const GROUP_LABELS: Record<string, string> = {
  extra: "Extra ingredienser",
  gronsaker: "Grönsaker",
  saser: "Såser & tillbehör",
  glutenfri: "Glutenfri?",
};

const csrf = () =>
  decodeURIComponent(
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("falken_admin_csrf="))
      ?.split("=")[1] ?? "",
  );

const toPayload = (mod: AdminModifier): EditPayload => ({
  expectedRevision: mod.revision,
  labelSv: mod.labelSv,
  maxQty: mod.maxQty,
  compatibleCategories: [...mod.compatibleCategories],
  priceByVariantSek: { ...mod.priceByVariantSek },
  priceStatus: mod.priceStatus,
  active: mod.active,
});

const samePayload = (left: EditPayload, right: EditPayload) =>
  JSON.stringify(left) === JSON.stringify(right);

export function AdminModifiersTab() {
  const [modifiers, setModifiers] = useState<AdminModifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE" | "NEEDS_REVIEW" | "CONFIRMED">("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"labelSv" | "groupSlug" | "maxQty">("labelSv");

  const [editing, setEditing] = useState<AdminModifier | null>(null);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<RetryState | null>(null);

  const closeEditor = () => {
    setEditing(null);
    setRetry(null);
    setEditError("");
  };

  const updateEditing = (next: AdminModifier) => {
    setEditing(next);
    setRetry(null);
    setEditError("");
  };

  const loadModifiers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/catalog/modifiers", { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte hämta tillägg från servern.");
      const data = (await response.json()) as { modifiers: AdminModifier[] };
      setModifiers(data.modifiers ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/admin/catalog/modifiers", { cache: "no-store" });
        if (!response.ok) throw new Error("Kunde inte hämta tillägg från servern.");
        const data = (await response.json()) as { modifiers: AdminModifier[] };
        if (!ignore) {
          setModifiers(data.modifiers ?? []);
          setError("");
        }
      } catch (cause) {
        if (!ignore) setError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }, 0);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, []);

  const openEditor = async (slug: string) => {
    setEditError("");
    setRetry(null);
    try {
      const response = await fetch(`/api/admin/catalog/modifiers/${slug}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Kunde inte öppna tillägget.");
      const data = (await response.json()) as AdminModifier;
      setEditing(data);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Ett fel uppstod.");
    }
  };

  const save = async () => {
    if (!editing) return;

    if (!editing.labelSv.trim()) {
      setEditError("Namn på tillägget på svenska är obligatoriskt.");
      return;
    }

    if (editing.maxQty < 1 || editing.maxQty > 10) {
      setEditError("Max antal måste vara mellan 1 och 10.");
      return;
    }

    const variantEntries = Object.entries(editing.priceByVariantSek);
    if (variantEntries.length === 0) {
      setEditError("Minst en variant måste ha ett prissatt belopp.");
      return;
    }

    for (const [vId, price] of variantEntries) {
      if (typeof price !== "number" || isNaN(price) || !Number.isInteger(price)) {
        setEditError(`Priset för varianten "${vId}" måste vara ett heltalsbelopp i SEK.`);
        return;
      }
      if (price < 1) {
        setEditError(`Priset för "${vId}" måste vara minst 1 kr. Gratis (0 kr) eller negativa belopp är inte tillåtna.`);
        return;
      }
      if (price > 500) {
        setEditError(`Priset för "${vId}" kan inte överstiga 500 kr.`);
        return;
      }
    }

    const payload = toPayload(editing);
    const idempotencyKey =
      retry && samePayload(retry.payload, payload)
        ? retry.idempotencyKey
        : (crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, "") : `modedit${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

    const pending: RetryState = { idempotencyKey, payload };
    setSaving(true);
    setEditError("");

    try {
      const response = await fetch(`/api/admin/catalog/modifiers/${editing.slug}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-csrf": csrf(),
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => ({}))) as {
        modifier?: AdminModifier;
        replayed?: boolean;
        error?: string;
        issues?: { fieldErrors?: Record<string, string[]> };
      };

      if (response.ok && body.modifier) {
        setModifiers((prev) =>
          prev.map((item) => (item.slug === body.modifier!.slug ? body.modifier! : item)),
        );
        setRetry(null);
        setEditing(null);
        await loadModifiers();
        return;
      }

      if (response.status === 409 && body.error === "stale_modifier" && body.modifier) {
        setRetry(null);
        setEditing(body.modifier);
        setEditError("Tillägget ändrades av en annan administratör. Uppdaterad data har laddats.");
        return;
      }

      if (response.status === 409 && body.error === "idempotency_key_reused") {
        setRetry(null);
        setEditError("Sparnyckeln hör till ett annat innehåll. Gör en ny ändring och försök igen.");
        return;
      }

      if (response.status >= 500) {
        setRetry(pending);
        setEditError("Resultatet kunde inte bekräftas av servern. Försök igen med samma innehåll.");
        return;
      }

      setRetry(null);
      const firstIssue = body.issues?.fieldErrors
        ? Object.values(body.issues.fieldErrors)[0]?.[0]
        : undefined;

      const messages: Record<string, string> = {
        transactions_required: "Säker sparning med databastransaktioner är tillfälligt otillgänglig.",
        not_found: "Tillägget hittades inte.",
        forbidden: "Behörighet saknas för att ändra tillägg.",
      };

      setEditError(
        firstIssue ?? (body.error ? messages[body.error] ?? "Kunde inte spara tillägget." : "Kunde inte spara tillägget."),
      );
    } catch {
      setRetry(pending);
      setEditError("Anslutningen avbröts innan resultatet kunde bekräftas. Försök igen med samma innehåll.");
    } finally {
      setSaving(false);
    }
  };

  const filteredModifiers = useMemo(() => {
    return modifiers
      .filter((mod) => {
        if (statusFilter === "ACTIVE" && !mod.active) return false;
        if (statusFilter === "INACTIVE" && mod.active) return false;
        if (statusFilter === "NEEDS_REVIEW" && mod.priceStatus !== "needs_review") return false;
        if (statusFilter === "CONFIRMED" && mod.priceStatus !== "confirmed") return false;
        if (groupFilter !== "ALL" && (mod.groupSlug ?? "extra") !== groupFilter) return false;
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          return (
            mod.labelSv.toLowerCase().includes(q) ||
            mod.slug.toLowerCase().includes(q) ||
            (mod.groupSlug ?? "").toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "labelSv") return a.labelSv.localeCompare(b.labelSv, "sv");
        if (sortBy === "groupSlug") return (a.groupSlug ?? "").localeCompare(b.groupSlug ?? "", "sv");
        if (sortBy === "maxQty") return b.maxQty - a.maxQty;
        return 0;
      });
  }, [modifiers, query, statusFilter, groupFilter, sortBy]);

  const stats = useMemo(() => {
    const total = modifiers.length;
    const active = modifiers.filter((m) => m.active).length;
    const confirmed = modifiers.filter((m) => m.priceStatus === "confirmed").length;
    const needsReview = modifiers.filter((m) => m.priceStatus === "needs_review").length;
    return { total, active, confirmed, needsReview };
  }, [modifiers]);

  return (
    <section className="space-y-5" aria-labelledby="modifiers-title">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e2d5] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78347]">Kataloghantering</p>
          <h2 id="modifiers-title" className="mt-1 font-serif text-3xl font-bold text-[#1f2328]">
            Tillägg &amp; Ingredienser
          </h2>
          <p className="mt-1 text-xs text-[#7c828d]">
            Hantera betalda tillägg för pizzor och rätter. Alla tillägg är strikt avgiftsbelagda (1–500 kr) och kopplade via kategorier.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-[#e4ded2] bg-white px-4 py-2.5 text-center shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c828d]">Totalt</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328]">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-[#e4ded2] bg-white px-4 py-2.5 text-center shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c828d]">Aktiva</p>
            <p className="mt-0.5 text-xl font-bold text-[#15803d]">{stats.active}</p>
          </div>
          <div className="rounded-2xl border border-[#e4ded2] bg-white px-4 py-2.5 text-center shadow-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c828d]">Granskning</p>
            <p className={`mt-0.5 text-xl font-bold ${stats.needsReview > 0 ? "text-[#b45309]" : "text-[#7c828d]"}`}>
              {stats.needsReview}
            </p>
          </div>
        </div>
      </header>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs min-[480px]:grid-cols-3 lg:flex lg:items-start lg:pb-0 lg:pt-8">
        <label className="relative block min-[480px]:col-span-3 lg:min-w-0 lg:flex-1 lg:-translate-y-2">
          <span className="sr-only">Sök tillägg</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c827a]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök på tilläggsnamn eller slug..."
            className="w-full rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 pl-9 pr-3 text-xs text-[#1f2328] placeholder-[#9c9589] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
          />
        </label>

        <label className="relative block lg:w-36 lg:shrink-0 lg:-translate-y-2">
          <span className="sr-only">Filtrera på status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            className="w-full appearance-none rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 pl-3 pr-9 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
          >
            <option value="ALL">Alla statusar</option>
            <option value="ACTIVE">Endast aktiva</option>
            <option value="INACTIVE">Endast inaktiva</option>
            <option value="NEEDS_REVIEW">Kräver granskning</option>
            <option value="CONFIRMED">Bekräftat pris</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a]" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </label>

        <label className="relative block lg:w-32 lg:shrink-0 lg:-translate-y-2">
          <span className="sr-only">Filtrera på grupp</span>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="w-full appearance-none rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 pl-3 pr-9 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
          >
            <option value="ALL">Alla grupper</option>
            <option value="extra">Extra ingredienser</option>
            <option value="gronsaker">Grönsaker</option>
            <option value="saser">Såser &amp; tillbehör</option>
            <option value="glutenfri">Glutenfri</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a]" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </label>

        <label className="relative block lg:w-40 lg:shrink-0 lg:-translate-y-2">
          <span className="sr-only">Sortera</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="w-full appearance-none rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 pl-3 pr-9 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
          >
            <option value="labelSv">Sortera: Namn (A–Ö)</option>
            <option value="groupSlug">Sortera: Grupp</option>
            <option value="maxQty">Sortera: Max antal</option>
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8c827a]" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.27a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </label>
      </div>

      {/* Main Table / List */}
      <div className="overflow-hidden rounded-2xl border border-[#e7e1d5] bg-white shadow-xs">
        {loading && modifiers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#7c828d]">Laddar tillägg...</div>
        ) : error && modifiers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#b42318]">{error}</div>
        ) : filteredModifiers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#7c828d]">
            Inga tillägg matchade sökningen eller filtret.
          </div>
        ) : (
          <div
            className="overflow-x-auto overscroll-x-contain"
            tabIndex={0}
            role="region"
            aria-label="Tilläggstabell — scrolla horisontellt på små skärmar"
          >
            <table className="min-w-[62rem] w-full text-left text-xs">
              <thead className="border-b border-[#e8e2d5] bg-[#fbfaf7] text-[11px] font-semibold uppercase tracking-wider text-[#7c828d]">
                <tr>
                  <th className="py-3 px-4">Tillägg &amp; Slug</th>
                  <th className="py-3 px-4">Grupp</th>
                  <th className="py-3 px-4">Pris per variant (SEK)</th>
                  <th className="py-3 px-4">Max antal</th>
                  <th className="py-3 px-4">Kategorier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ebe1]">
                {filteredModifiers.map((mod) => {
                  const variantKeys = Object.keys(mod.priceByVariantSek);
                  return (
                    <tr key={mod.slug} className="hover:bg-[#faf8f4] transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#1f2328]">{mod.labelSv}</div>
                        <div className="font-mono text-[10px] text-[#8c827a]">{mod.slug}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block rounded-md bg-[#f4efe6] px-2 py-0.5 text-[11px] font-medium text-[#735e40]">
                          {GROUP_LABELS[mod.groupSlug ?? "extra"] ?? mod.groupSlug ?? "extra"}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {variantKeys.map((v) => (
                            <span
                              key={v}
                              className="inline-flex items-center gap-1 rounded-md border border-[#e4ded2] bg-[#fdfdfc] px-2 py-0.5 text-[11px] text-[#2c313a]"
                            >
                              <span className="text-[#8c827a]">{v}:</span>
                              <span className="font-bold">{mod.priceByVariantSek[v]} kr</span>
                            </span>
                          ))}
                          {mod.priceStatus === "confirmed" ? (
                            <span className="inline-block rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#15803d]">
                              Bekräftat
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-[#fef3c7] px-2 py-0.5 text-[10px] font-semibold text-[#b45309]">
                              Granskas
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#4b5563]">
                        <span className="font-medium text-[#1f2328]">{mod.maxQty} st</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex max-w-[14rem] flex-wrap gap-1">
                          {mod.compatibleCategories.length === 0 ? (
                            <span className="text-[11px] text-[#8c827a]">Inga</span>
                          ) : (
                            mod.compatibleCategories.map((cat) => (
                              <span
                                key={cat}
                                className="inline-block rounded-sm bg-[#f2eee7] px-1.5 py-0.5 text-[10px] text-[#5c5449]"
                              >
                                {cat}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {mod.active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803d]">
                            <span className="size-1.5 rounded-full bg-[#15803d]" />
                            Aktiv
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8c827a]">
                            <span className="size-1.5 rounded-full bg-[#8c827a]" />
                            Inaktiv
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditor(mod.slug)}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#d9d1c1] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] shadow-2xs hover:bg-[#faf7f2] transition"
                        >
                          Redigera
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Accessible Edit Dialog */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-[#e4ded2] bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-[#e8e2d5] pb-3">
              <div>
                <h3 id="edit-dialog-title" className="font-serif text-xl font-bold text-[#1f2328]">
                  Redigera tillägg
                </h3>
                <p className="mt-0.5 text-xs text-[#7c828d]">
                  Modifiera tilläggets namn, priser, gränser och kompatibilitet.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg p-1 text-[#8c827a] hover:bg-black/5 hover:text-[#1f2328] transition"
                aria-label="Stäng dialog"
              >
                ✕
              </button>
            </div>

            {/* Read-only metadata */}
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#fbfaf8] p-3 text-xs border border-[#eee8dd]">
              <div>
                <span className="text-[#8c827a]">Identifierare (slug):</span>
                <p className="font-mono font-semibold text-[#1f2328]">{editing.slug}</p>
              </div>
              <div>
                <span className="text-[#8c827a]">Grupp:</span>
                <p className="font-semibold text-[#1f2328]">
                  {GROUP_LABELS[editing.groupSlug ?? "extra"] ?? editing.groupSlug ?? "extra"}
                </p>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#1f2328] mb-1">
                  Namn på tillägget (svenska)
                </label>
                <input
                  type="text"
                  value={editing.labelSv}
                  onChange={(e) => updateEditing({ ...editing, labelSv: e.target.value })}
                  maxLength={100}
                  className="w-full rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 px-3 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
                />
              </div>

              {/* Prices per variant */}
              <div>
                <label className="block font-semibold text-[#1f2328] mb-1">
                  Priser per variant (SEK) — Varje tillägg är avgiftsbelagt (1–500 kr)
                </label>
                <div className="grid gap-2 rounded-xl border border-[#e4ded2] bg-[#fcfbf9] p-3">
                  {Object.keys(editing.priceByVariantSek).map((vKey) => (
                    <div key={vKey} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-[#4b5563]">{vKey}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          step={1}
                          value={editing.priceByVariantSek[vKey] ?? ""}
                          onChange={(e) => {
                            const val = e.target.value === "" ? 0 : parseInt(e.target.value, 10);
                            updateEditing({
                              ...editing,
                              priceByVariantSek: {
                                ...editing.priceByVariantSek,
                                [vKey]: isNaN(val) ? 0 : val,
                              },
                            });
                          }}
                          className="w-24 text-right rounded-lg border border-[#dcd4c5] bg-white py-1 px-2 text-xs font-semibold text-[#1f2328] outline-hidden focus:border-[#a78347] focus:ring-1 focus:ring-[#a78347]"
                        />
                        <span className="text-xs text-[#7c828d]">kr</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#1f2328] mb-1">Max antal per rätt</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={editing.maxQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      updateEditing({
                        ...editing,
                        maxQty: isNaN(val) ? 1 : Math.max(1, Math.min(10, val)),
                      });
                    }}
                    className="w-full rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 px-3 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#1f2328] mb-1">Prisstatus</label>
                  <select
                    value={editing.priceStatus}
                    onChange={(e) =>
                      updateEditing({
                        ...editing,
                        priceStatus: e.target.value as "confirmed" | "needs_review",
                      })
                    }
                    className="w-full rounded-xl border border-[#dcd4c5] bg-[#fbfaf8] py-2 px-3 text-xs text-[#1f2328] outline-hidden focus:border-[#a78347] focus:bg-white focus:ring-1 focus:ring-[#a78347]"
                  >
                    <option value="confirmed">Bekräftat pris</option>
                    <option value="needs_review">Kräver granskning</option>
                  </select>
                </div>
              </div>

              {/* Compatible categories */}
              <div>
                <label className="block font-semibold text-[#1f2328] mb-1">
                  Kompatibla kategorier
                </label>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#e4ded2] bg-[#fcfbf9] p-3">
                  {ALL_CATEGORIES.map((cat) => {
                    const isChecked = editing.compatibleCategories.includes(cat.slug);
                    return (
                      <label key={cat.slug} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...editing.compatibleCategories, cat.slug]
                              : editing.compatibleCategories.filter((c) => c !== cat.slug);
                            updateEditing({ ...editing, compatibleCategories: next });
                          }}
                          className="size-3.5 rounded border-[#dcd4c5] text-[#a78347] focus:ring-[#a78347]"
                        />
                        <span className="text-[11px] text-[#2c313a]">{cat.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="modifier-active-toggle"
                  checked={editing.active}
                  onChange={(e) => updateEditing({ ...editing, active: e.target.checked })}
                  className="size-4 rounded border-[#dcd4c5] text-[#a78347] focus:ring-[#a78347]"
                />
                <label htmlFor="modifier-active-toggle" className="font-semibold text-[#1f2328] cursor-pointer">
                  Aktivt tillägg (synligt i menyn)
                </label>
              </div>
            </div>

            {/* Error & Feedback Banner */}
            {editError && (
              <div className="rounded-xl border border-[#fecdca] bg-[#fef3f2] p-3 text-xs text-[#b42318]">
                {editError}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-[#e8e2d5] pt-3">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-xl border border-[#d9d1c1] bg-white px-4 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition disabled:opacity-50"
              >
                Avbryt
              </button>

              <div className="flex items-center gap-2">
                {retry && (
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-xl border border-[#d9d1c1] bg-[#faf8f4] px-3 py-2 text-xs font-semibold text-[#8c827a] hover:bg-[#f2ede4] transition disabled:opacity-50"
                  >
                    Försök igen
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-xl bg-[#a78347] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#96743b] transition disabled:opacity-50"
                >
                  {saving ? "Sparar..." : "Spara ändringar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
