"use client";

import { useEffect, useState, useTransition } from "react";
import { DEFAULT_HOURS, formatMinutes, type CustomWeeklyHours, type Season } from "@/lib/hours";
import { notifyStatusChange, useRestaurantStatus } from "@/lib/use-restaurant-status";

const DAY_NAMES = [
  { index: 1, key: "1", name: "Måndag", short: "Mån" },
  { index: 2, key: "2", name: "Tisdag", short: "Tis" },
  { index: 3, key: "3", name: "Onsdag", short: "Ons" },
  { index: 4, key: "4", name: "Torsdag", short: "Tor" },
  { index: 5, key: "5", name: "Fredag", short: "Fre" },
  { index: 6, key: "6", name: "Lördag", short: "Lör" },
  { index: 0, key: "0", name: "Söndag", short: "Sön" },
];

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("falken_admin_csrf="));
  return match ? decodeURIComponent(match.split("=")[1]) : "";
}

function getDefaultWeeklyHours(season: Season): CustomWeeklyHours {
  const table = DEFAULT_HOURS[season];
  const result: CustomWeeklyHours = {};
  for (let d = 0; d < 7; d++) {
    result[d] = {
      open: formatMinutes(table[d].open * 60),
      close: formatMinutes(table[d].close * 60),
      closed: false,
    };
  }
  return result;
}

export function AdminHoursTab() {
  const { status: liveStatus, reload: reloadLiveStatus } = useRestaurantStatus();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [season, setSeason] = useState<Season>("vinter");
  const [hours, setHours] = useState<CustomWeeklyHours>(() => getDefaultWeeklyHours("vinter"));
  const [manualOverride, setManualOverride] = useState<"open" | "closed" | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const currentStockholmDay = new Date().getDay(); // 0 = Sun ... 6 = Sat

  // Fetch current hours on mount
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/restaurant/hours", { cache: "no-store" });
        if (!res.ok) throw new Error("Kunde inte ladda öppettider");
        const data = await res.json();
        if (active) {
          setSeason(data.season || "vinter");
          setHours(data.hours || getDefaultWeeklyHours(data.season || "vinter"));
          setManualOverride(data.manualOverride ?? null);
          setAnnouncement(data.announcement || "");
        }
      } catch (err) {
        if (active) {
          setFeedback({
            type: "error",
            message: "Kunde inte ladda schemat från servern. Standardtider visas.",
          });
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  // When changing season, prompt to load default hours for that season if desired
  function handleSeasonChange(newSeason: Season) {
    setSeason(newSeason);
    setHours((current) => {
      const defaults = getDefaultWeeklyHours(newSeason);
      return { ...defaults, ...current };
    });
  }

  function handleDayToggle(dayIndex: number) {
    setHours((prev) => {
      const current = prev[dayIndex] || { open: "11:00", close: "21:00", closed: false };
      return {
        ...prev,
        [dayIndex]: {
          ...current,
          closed: !current.closed,
        },
      };
    });
  }

  function handleTimeChange(dayIndex: number, field: "open" | "close", val: string) {
    setHours((prev) => {
      const current = prev[dayIndex] || { open: "11:00", close: "21:00", closed: false };
      return {
        ...prev,
        [dayIndex]: {
          ...current,
          [field]: val,
        },
      };
    });
  }

  function handleResetToDefaults() {
    if (confirm(`Vill du återställa alla tider till standard för ${season === "vinter" ? "vinter" : "sommar"}?`)) {
      setHours(getDefaultWeeklyHours(season));
      setFeedback({ type: "success", message: "Tider återställda till standardvärden. Klicka på Spara för att tillämpa." });
    }
  }

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/admin/restaurant/hours", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          season,
          hours,
          manualOverride,
          announcement,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || "Kunde inte spara öppettiderna");
      }

      setFeedback({ type: "success", message: "Öppettiderna har sparats och webbplatsen är uppdaterad!" });
      notifyStatusChange();
      await reloadLiveStatus();
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Ett fel uppstod när tiderna skulle sparas.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Title Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold tracking-tight text-[#1f2328]">
            Öppettider &amp; Schemaläggning
          </h2>
          <p className="mt-1 text-xs text-[#7c828d]">
            Styr restaurangens ordinarie tider, säsonger och direkt öppet/stängt-status för onlinebeställningar.
          </p>
        </div>

        {/* Live Status indicator pill */}
        <div className="flex items-center gap-2.5 rounded-xl border border-[#e8e2d5] bg-[#faf8f3] px-3.5 py-2 text-xs">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full ${
              liveStatus?.isOpen ? "bg-[#4caf73] animate-pulse" : "bg-[#ce2b37]"
            }`}
          />
          <span className="font-semibold text-[#1f2328]">
            {liveStatus?.label || "Laddar status…"}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`rounded-xl px-4 py-3 text-xs font-semibold ${
            feedback.type === "success"
              ? "border border-[#c6e5d0] bg-[#eef8f2] text-[#236b3b]"
              : "border border-[#f5c6cb] bg-[#fdf2f2] text-[#9b2c2c]"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Grid: 2 columns on wide screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Season & Manual Override (1 col) */}
        <div className="space-y-6 lg:col-span-1">
          {/* Section: Direktkontroll / Överstyrning */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs space-y-4">
            <h3 className="font-serif text-base font-bold text-[#1f2328]">
              Direktkontroll (Manuell status)
            </h3>
            <p className="text-xs text-[#7c828d]">
              Behöver du tillfälligt stänga på grund av hög kö, eller öppna extra tidigt?
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setManualOverride(null)}
                className={`w-full flex items-center justify-between rounded-xl border p-3 text-left text-xs transition ${
                  manualOverride === null
                    ? "border-[#b88e4d] bg-[#fbf8f0] font-bold text-[#1f2328]"
                    : "border-[#e8e2d5] hover:bg-[#faf8f3] text-[#555a64]"
                }`}
              >
                <div>
                  <div className="font-semibold text-[#1f2328]">Följ schema (Automatiskt)</div>
                  <div className="text-[11px] text-[#7c828d]">Öppnar och stänger enligt tiderna nedan</div>
                </div>
                {manualOverride === null && <span className="text-[#b88e4d] font-bold">✓</span>}
              </button>

              <button
                type="button"
                onClick={() => setManualOverride("open")}
                className={`w-full flex items-center justify-between rounded-xl border p-3 text-left text-xs transition ${
                  manualOverride === "open"
                    ? "border-[#4caf73] bg-[#eef8f2] font-bold text-[#236b3b]"
                    : "border-[#e8e2d5] hover:bg-[#faf8f3] text-[#555a64]"
                }`}
              >
                <div>
                  <div className="font-semibold text-[#236b3b]">Tvinga Öppet nu</div>
                  <div className="text-[11px] text-[#7c828d]">Öppnar beställningar direkt oavsett schema</div>
                </div>
                {manualOverride === "open" && <span className="text-[#4caf73] font-bold">✓</span>}
              </button>

              <button
                type="button"
                onClick={() => setManualOverride("closed")}
                className={`w-full flex items-center justify-between rounded-xl border p-3 text-left text-xs transition ${
                  manualOverride === "closed"
                    ? "border-[#ce2b37] bg-[#fdf2f2] font-bold text-[#9b2c2c]"
                    : "border-[#e8e2d5] hover:bg-[#faf8f3] text-[#555a64]"
                }`}
              >
                <div>
                  <div className="font-semibold text-[#9b2c2c]">Tvinga Stängt nu</div>
                  <div className="text-[11px] text-[#7c828d]">Visar &quot;Stängt för beställningar&quot;</div>
                </div>
                {manualOverride === "closed" && <span className="text-[#ce2b37] font-bold">✓</span>}
              </button>
            </div>
          </div>

          {/* Section: Säsongsväljare */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs space-y-4">
            <h3 className="font-serif text-base font-bold text-[#1f2328]">
              Aktiv säsong
            </h3>
            <p className="text-xs text-[#7c828d]">
              Välj vilken grunduppsättning av öppettider som gäller just nu:
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSeasonChange("vinter")}
                className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                  season === "vinter"
                    ? "border-[#b88e4d] bg-[#faf6ed] text-[#8c6721] font-bold shadow-xs"
                    : "border-[#e8e2d5] text-[#555a64] hover:bg-[#faf8f3]"
                }`}
              >
                <span className="text-xl">❄️</span>
                <span className="mt-2 text-xs font-bold">Vintertid</span>
                <span className="mt-0.5 text-[10px] text-[#8a7f76]">Mån–Tor 11–21, Fre 11–22</span>
              </button>

              <button
                type="button"
                onClick={() => handleSeasonChange("sommar")}
                className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                  season === "sommar"
                    ? "border-[#b88e4d] bg-[#faf6ed] text-[#8c6721] font-bold shadow-xs"
                    : "border-[#e8e2d5] text-[#555a64] hover:bg-[#faf8f3]"
                }`}
              >
                <span className="text-xl">☀️</span>
                <span className="mt-2 text-xs font-bold">Sommartid</span>
                <span className="mt-0.5 text-[10px] text-[#8a7f76]">Mån–Sön 11–22</span>
              </button>
            </div>
          </div>

          {/* Section: Avvikande meddelande (Announcement) */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs space-y-3">
            <h3 className="font-serif text-base font-bold text-[#1f2328]">
              Särskilt meddelande (valfritt)
            </h3>
            <p className="text-xs text-[#7c828d]">
              Visas vid kassan och i menyn vid röda dagar eller högtider.
            </p>
            <textarea
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="T.ex: Midsommarafton stängt. Glad sommar önskar Falken!"
              rows={3}
              className="w-full rounded-xl border border-[#e8e2d5] bg-[#faf8f3] p-3 text-xs text-[#1f2328] placeholder-[#a09a90] outline-none transition focus:border-[#b88e4d] focus:bg-white focus:ring-1 focus:ring-[#b88e4d]"
            />
          </div>
        </div>

        {/* Right Column: Weekly Day-by-Day Editor (2 cols) */}
        <div className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5 lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#f0ede6] pb-4">
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1f2328]">
                Ordinarie Veckoschema
              </h3>
              <p className="text-xs text-[#7c828d]">
                Anpassa öppnings- och stängningstider för varje enskild dag i veckan.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="self-start text-[11px] font-semibold text-[#8c6721] hover:underline"
            >
              Återställ till standardtider
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#7c828d]">Laddar schema…</div>
          ) : (
            <div className="space-y-3">
              {DAY_NAMES.map((day) => {
                const dayHour = hours[day.index] || { open: "11:00", close: "21:00", closed: false };
                const isToday = currentStockholmDay === day.index;

                return (
                  <div
                    key={day.key}
                    className={`flex flex-col gap-3 rounded-xl border p-3.5 transition sm:flex-row sm:items-center sm:justify-between ${
                      isToday
                        ? "border-[#b88e4d]/40 bg-[#fbf9f4]"
                        : "border-[#e8e2d5] bg-white hover:border-[#d5cbba]"
                    }`}
                  >
                    {/* Day name & Today badge */}
                    <div className="flex items-center gap-2.5 min-w-36">
                      <span className="font-semibold text-xs text-[#1f2328]">
                        {day.name}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-[#b88e4d]/15 border border-[#b88e4d]/30 px-2 py-0.5 text-[9.5px] font-bold text-[#8a7040] uppercase tracking-wider">
                          Idag
                        </span>
                      )}
                    </div>

                    {/* Time fields or Closed */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#555a64] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!dayHour.closed}
                          onChange={() => handleDayToggle(day.index)}
                          className="size-4 rounded border-[#d5cbba] text-[#b88e4d] focus:ring-[#b88e4d]"
                        />
                        <span className="font-medium">Öppet</span>
                      </label>

                      {!dayHour.closed ? (
                        <div className="flex items-center gap-2 text-xs">
                          <input
                            type="time"
                            value={String(dayHour.open)}
                            onChange={(e) => handleTimeChange(day.index, "open", e.target.value)}
                            className="rounded-lg border border-[#e0d9cb] bg-white px-2.5 py-1 text-xs text-[#1f2328] outline-none focus:border-[#b88e4d]"
                          />
                          <span className="text-[#8c827a]">—</span>
                          <input
                            type="time"
                            value={String(dayHour.close)}
                            onChange={(e) => handleTimeChange(day.index, "close", e.target.value)}
                            className="rounded-lg border border-[#e0d9cb] bg-white px-2.5 py-1 text-xs text-[#1f2328] outline-none focus:border-[#b88e4d]"
                          />
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[#ce2b37] italic">
                          Stängt hela dagen
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Save Action Bottom Bar */}
          <div className="pt-4 border-t border-[#f0ede6] flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#b88e4d] px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#a67c3b] active:scale-[0.99] transition disabled:opacity-60 cursor-pointer"
            >
              {saving ? (
                <>
                  <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Sparar…</span>
                </>
              ) : (
                <span>Spara öppettider</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
