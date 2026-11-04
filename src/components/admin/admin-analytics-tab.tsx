"use client";

import { useState } from "react";
import type { OverviewData } from "./admin-dashboard";

export type AdminAnalyticsTabProps = {
  overview: OverviewData | null;
  onPeriodChange?: (period: "today" | "yesterday" | "week" | "month" | "year") => void;
  activePeriod?: "today" | "yesterday" | "week" | "month" | "year";
};

const formatSek = (val: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(val)} kr`;

export function AdminAnalyticsTab({
  overview,
  onPeriodChange,
  activePeriod = "today",
}: AdminAnalyticsTabProps) {
  const [period, setPeriod] = useState<"today" | "yesterday" | "week" | "month" | "year">(
    activePeriod
  );
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const handlePeriodClick = (p: "today" | "yesterday" | "week" | "month" | "year") => {
    setPeriod(p);
    if (onPeriodChange) onPeriodChange(p);
  };

  const totalRevenue = overview?.metrics.revenueSek ?? 300;
  const totalOrders = overview?.metrics.orders ?? 2;
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 150;

  // Hourly curve points matching restaurant opening hours (11:00 to 22:00)
  const hours = [
    "11:00", "12:00", "13:00", "14:00", "15:00", "16:00",
    "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
  ];

  // Map server chart data or realistic mock
  const serverChart = overview?.chart ?? [];
  const chartMap = new Map(serverChart.map((p) => [p.label, p]));

  const hourlyPoints = hours.map((h) => {
    const existing = chartMap.get(h);
    if (existing) return existing;
    if (h === "14:00") return { key: h, label: h, revenueSek: totalRevenue, orders: totalOrders };
    return { key: h, label: h, revenueSek: 0, orders: 0 };
  });

  // Spline calculation for the main combo chart
  const chartWidth = 720;
  const chartHeight = 220;
  const padLeft = 44;
  const padRight = 32;
  const padTop = 26;
  const padBottom = 28;
  const plotW = chartWidth - padLeft - padRight;
  const plotH = chartHeight - padTop - padBottom;
  const baselineY = padTop + plotH;

  const maxRevScale = Math.max(300, Math.ceil(totalRevenue / 50) * 50);
  const maxOrdScale = 5;

  const stepX = plotW / (hourlyPoints.length - 1);

  const revCoords = hourlyPoints.map((pt, idx) => {
    const x = padLeft + idx * stepX;
    const ratio = maxRevScale > 0 ? Math.min(1, pt.revenueSek / maxRevScale) : 0;
    const y = baselineY - ratio * plotH;
    return { x, y, pt };
  });

  const ordCoords = hourlyPoints.map((pt, idx) => {
    const x = padLeft + idx * stepX;
    const ratio = maxOrdScale > 0 ? Math.min(1, pt.orders / maxOrdScale) : 0;
    const y = baselineY - ratio * plotH;
    return { x, y, pt };
  });

  // Generate cubic spline path
  const makeSpline = (coords: { x: number; y: number }[]) => {
    if (coords.length < 2) return { line: "", area: "" };
    let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      let cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      let cp2y = p2.y - (p3.y - p1.y) / 6;

      cp1y = Math.min(baselineY, cp1y);
      cp2y = Math.min(baselineY, cp2y);

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    const area = `${d} L ${coords[coords.length - 1].x.toFixed(1)},${baselineY} L ${coords[0].x.toFixed(1)},${baselineY} Z`;
    return { line: d, area };
  };

  const revPaths = makeSpline(revCoords);
  const ordPaths = makeSpline(ordCoords);

  const activeRevIdx = hoveredHour !== null ? hoveredHour : 3; // default 14:00 (index 3 in 11:00..22:00)
  const activePt = revCoords[activeRevIdx] || revCoords[3];
  const activeOrdPt = ordCoords[activeRevIdx] || ordCoords[3];

  // Daily revenue data for "Intäkt per dag" bar chart
  const weekDays = [
    { day: "Mån", rev: 0 },
    { day: "Tis", rev: 0 },
    { day: "Ons", rev: 0 },
    { day: "Tor", rev: 0 },
    { day: "Fre", rev: 0 },
    { day: "Lör", rev: 0 },
    { day: "Sön", rev: totalRevenue }, // Today
  ];
  const maxDayRev = 300;

  return (
    <div className="space-y-5">
      {/* Page Header matching Image 4 */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee7da] pb-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f2328]">Analyser</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#7c828d]">
            Statistik och insikter om din restaurang
          </p>
        </div>

        {/* Date period badge */}
        <div className="inline-flex items-center gap-2 rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-xs font-semibold text-[#1f2328] shadow-2xs">
          <span>📅</span>
          <span>1 nov. 2026 – 3 nov. 2026</span>
          <span className="text-[#8c827a]">⌄</span>
        </div>
      </div>

      {/* Top 4 KPI Cards matching Image 4 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total intäkt */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4ebd9] text-xl">
            🪙
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">Total intäkt</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {formatSek(totalRevenue)}
            </p>
            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
              ↑ +20% <span className="font-normal text-[#8c827a]">från förra perioden</span>
            </p>
          </div>
        </div>

        {/* Card 2: Beställningar */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4ebd9] text-xl">
            🛒
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">Beställningar</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {totalOrders} st
            </p>
            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
              ↑ +100% <span className="font-normal text-[#8c827a]">från förra perioden</span>
            </p>
          </div>
        </div>

        {/* Card 3: Genomsnittligt ordervärde */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4ebd9] text-xl">
            👥
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">
              Genomsnittligt ordervärde
            </p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {formatSek(avgOrderValue)}
            </p>
            <p className="text-[11px] font-semibold text-red-600 mt-0.5">
              ↓ −10% <span className="font-normal text-[#8c827a]">från förra perioden</span>
            </p>
          </div>
        </div>

        {/* Card 4: Betyg (snitt) */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f4ebd9] text-xl">
            ⭐
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">Betyg (snitt)</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">4.8 / 5</p>
            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
              ↑ +0.2 <span className="font-normal text-[#8c827a]">från förra perioden</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left 8 cols (2 charts), Right 4 cols (3 cards) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* Left Column: Intäkter & beställningar + Intäkt per dag */}
        <div className="flex flex-col gap-4 lg:col-span-8">
          {/* Card 1: Intäkter & beställningar combo chart */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs">
            {/* Header: Title on left, Periods on right */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f2ede4] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">📈</span>
                <h2 className="font-serif text-base sm:text-lg font-bold text-[#1f2328]">
                  Intäkter &amp; beställningar
                </h2>
              </div>

              {/* Periods */}
              <div className="inline-flex items-center gap-1 rounded-lg bg-[#f5f2e9] p-0.5">
                {(["today", "yesterday", "week", "month", "year"] as const).map((pk) => {
                  const labels = {
                    today: "Idag",
                    yesterday: "Igår",
                    week: "Vecka",
                    month: "Månad",
                    year: "År",
                  };
                  const active = period === pk;
                  return (
                    <button
                      key={pk}
                      type="button"
                      onClick={() => handlePeriodClick(pk)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                        active ? "bg-[#837147] text-white shadow-2xs" : "text-[#555a64] hover:bg-white/70"
                      }`}
                    >
                      {labels[pk]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Legends */}
            <div className="mt-3 flex items-center justify-between text-xs text-[#555a64]">
              <div className="flex items-center gap-5">
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="size-3 rounded-full bg-[#c99a45]" />
                  <span>Intäkter (kr)</span>
                </span>
                <span className="inline-flex items-center gap-2 font-medium">
                  <span className="inline-flex items-center">
                    <span className="w-2 h-0.5 bg-[#5a4d36]" />
                    <span className="size-2 rounded-full border-2 border-[#5a4d36] bg-white -mx-0.5" />
                    <span className="w-2 h-0.5 bg-[#5a4d36]" />
                  </span>
                  <span>Antal beställningar</span>
                </span>
              </div>
            </div>

            {/* SVG Chart Area */}
            <div className="relative mt-2">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="h-[230px] sm:h-[260px] w-full block overflow-visible"
                onMouseLeave={() => setHoveredHour(null)}
              >
                <defs>
                  <linearGradient id="analyticsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c99a45" stopOpacity="0.32" />
                    <stop offset="60%" stopColor="#c99a45" stopOpacity="0.10" />
                    <stop offset="100%" stopColor="#c99a45" stopOpacity="0.0" />
                  </linearGradient>
                  <filter id="analyticsGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#c99a45" floodOpacity="0.35" />
                  </filter>
                </defs>

                {/* Gridlines & Ticks */}
                {[300, 250, 200, 150, 100, 50, 0].map((tick, i) => {
                  const y = padTop + (plotH * i) / 6;
                  const ordTick = 6 - i;
                  return (
                    <g key={i}>
                      <line
                        x1={padLeft}
                        x2={chartWidth - padRight}
                        y1={y}
                        y2={y}
                        stroke="#eee7da"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 6}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        className="fill-[#7c828d] font-sans font-medium"
                      >
                        {tick} kr
                      </text>
                      <text
                        x={chartWidth - padRight + 6}
                        y={y + 3.5}
                        textAnchor="start"
                        fontSize="10"
                        className="fill-[#7c828d] font-sans font-medium"
                      >
                        {ordTick}
                      </text>
                    </g>
                  );
                })}

                {/* Area under revenue spline */}
                {revPaths.area && <path d={revPaths.area} fill="url(#analyticsAreaGrad)" />}

                {/* Revenue spline line */}
                {revPaths.line && (
                  <path
                    d={revPaths.line}
                    fill="none"
                    stroke="#c99a45"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Orders spline line */}
                {ordPaths.line && (
                  <path
                    d={ordPaths.line}
                    fill="none"
                    stroke="#5a4d36"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Vertical guide line on active point */}
                {activePt && (
                  <g>
                    <line
                      x1={activePt.x}
                      y1={padTop}
                      x2={activePt.x}
                      y2={baselineY}
                      stroke="#c99a45"
                      strokeDasharray="4 4"
                      strokeWidth="1.5"
                      strokeOpacity="0.6"
                    />
                    <polygon
                      points={`${activePt.x - 3.5},${baselineY} ${activePt.x + 3.5},${baselineY} ${activePt.x},${baselineY - 5}`}
                      fill="#837147"
                    />
                  </g>
                )}

                {/* Active Glowing Point (Golden) */}
                {activePt && (
                  <circle
                    cx={activePt.x}
                    cy={activePt.y}
                    r="5"
                    fill="#ffffff"
                    stroke="#c99a45"
                    strokeWidth="3"
                    filter="url(#analyticsGlow)"
                  />
                )}

                {/* Active Point (Brown Order) */}
                {activeOrdPt && activePt.pt.orders > 0 && (
                  <circle
                    cx={activeOrdPt.x}
                    cy={activeOrdPt.y}
                    r="4"
                    fill="#ffffff"
                    stroke="#5a4d36"
                    strokeWidth="2"
                  />
                )}

                {/* X-axis labels */}
                {hourlyPoints.map((pt, idx) => (
                  <text
                    key={pt.key}
                    x={padLeft + idx * stepX}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    fontSize="10"
                    className={`font-medium transition-colors ${
                      idx === activeRevIdx ? "fill-[#1f2328] font-bold" : "fill-[#7c828d]"
                    }`}
                  >
                    {pt.label}
                  </text>
                ))}

                {/* Interactive hover rects */}
                {hourlyPoints.map((pt, idx) => {
                  const x = padLeft + idx * stepX - stepX / 2;
                  return (
                    <rect
                      key={`h-${pt.key}`}
                      x={x}
                      y={padTop}
                      width={stepX}
                      height={plotH}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredHour(idx)}
                    />
                  );
                })}
              </svg>

              {/* Floating Light Glassy Tooltip (Lighter ivory frosted glass) */}
              {activePt && (
                <div
                  className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-2xl border border-[#e2dac8] bg-[#f8f5ee]/95 px-3.5 py-2 shadow-lg shadow-stone-900/8 backdrop-blur-md text-left transition-all duration-150 ring-1 ring-black/5"
                  style={{
                    left: `${(activePt.x / chartWidth) * 100}%`,
                    top: `${Math.max(2, activePt.y - 66)}px`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-[#ede5d3] pb-1 mb-1">
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[#8c827a]">
                      {activePt.pt.label}
                    </span>
                    <span className="text-[10px] font-semibold text-[#837147] bg-[#f0e8d6] px-1.5 py-0.5 rounded-md">
                      {activePt.pt.orders} {activePt.pt.orders === 1 ? "order" : "ordrar"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#1f2328] whitespace-nowrap">
                    <span className="inline-block size-2 rounded-full bg-[#c99a45] ring-2 ring-[#c99a45]/20" />
                    <span className="font-serif text-sm font-bold text-[#1f2328]">
                      {activePt.pt.revenueSek > 0 ? formatSek(activePt.pt.revenueSek) : "0 kr"}
                    </span>
                    <span className="text-[#8c827a] font-normal text-[11px]">
                      ({activePt.pt.orders} {activePt.pt.orders === 1 ? "beställning" : "beställningar"})
                    </span>
                  </div>
                  <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-6 border-t-[#f8f5ee] filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]" />
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Intäkt per dag (Bar chart matching Image 4) */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-[#f2ede4] pb-3">
              <span className="text-base">📊</span>
              <h2 className="font-serif text-base font-bold text-[#1f2328]">Intäkt per dag</h2>
            </div>

            <div className="mt-3">
              <svg viewBox="0 0 650 160" className="h-[140px] w-full block overflow-visible">
                {/* 4 horizontal gridlines: 300 kr, 200 kr, 100 kr, 0 kr */}
                {[300, 200, 100, 0].map((val, idx) => {
                  const y = 20 + idx * 35;
                  return (
                    <g key={idx}>
                      <line
                        x1={45}
                        x2={630}
                        y1={y}
                        y2={y}
                        stroke="#eee7da"
                        strokeDasharray="3 3"
                        strokeWidth="1"
                      />
                      <text
                        x={38}
                        y={y + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        className="fill-[#7c828d] font-sans font-medium"
                      >
                        {val} kr
                      </text>
                    </g>
                  );
                })}

                {/* Bars for 7 days */}
                {weekDays.map((wd, idx) => {
                  const barX = 75 + idx * 78;
                  const barW = 32;
                  const ratio = wd.rev / maxDayRev;
                  const barH = Math.max(3, ratio * 105);
                  const barY = 125 - barH;
                  const isHovered = hoveredDay === idx;

                  return (
                    <g
                      key={idx}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredDay(idx)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {/* Bar */}
                      <rect
                        x={barX}
                        y={barY}
                        width={barW}
                        height={barH}
                        rx="4"
                        fill={wd.rev > 0 ? (isHovered ? "#96743b" : "#b88a44") : "#e8e1d5"}
                        className="transition-all duration-150"
                      />

                      {/* Top label if value > 0 */}
                      {wd.rev > 0 && (
                        <text
                          x={barX + barW / 2}
                          y={barY - 6}
                          textAnchor="middle"
                          fontSize="10"
                          className="font-bold fill-[#1f2328]"
                        >
                          {wd.rev} kr
                        </text>
                      )}

                      {/* Day text */}
                      <text
                        x={barX + barW / 2}
                        y={145}
                        textAnchor="middle"
                        fontSize="11"
                        className={`font-medium ${
                          wd.rev > 0 ? "fill-[#1f2328] font-bold" : "fill-[#7c828d]"
                        }`}
                      >
                        {wd.day}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Right Column: 3 Cards (Mest beställt + Beställningstyper + Försäljningsfördelning) */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          {/* Card 1: Mest beställt */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-[#f2ede4] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🏆</span>
                <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">
                  Mest beställt
                </h2>
              </div>
              <span className="text-xs font-semibold text-[#837147] hover:underline cursor-pointer">
                Visa alla →
              </span>
            </div>

            <div className="mt-3 divide-y divide-[#f5f1e8]">
              <div className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#8c827a]">1</span>
                  <span className="text-base">🍕</span>
                  <span className="font-semibold text-[#1f2328]">La Busola</span>
                </div>
                <span className="text-[#7c828d]">1 st <strong className="text-[#1f2328] ml-1">50%</strong></span>
              </div>

              <div className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-bold text-[#8c827a]">2</span>
                  <span className="text-base">🍕</span>
                  <span className="font-semibold text-[#1f2328]">La Mafia</span>
                </div>
                <span className="text-[#7c828d]">1 st <strong className="text-[#1f2328] ml-1">50%</strong></span>
              </div>
            </div>
          </div>

          {/* Card 2: Beställningstyper (Donut chart matching Image 4) */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-[#f2ede4] pb-2.5">
              <span className="text-base">👥</span>
              <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">
                Beställningstyper
              </h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              {/* Donut graphic */}
              <div className="relative flex size-28 shrink-0 items-center justify-center">
                <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
                  {/* Background ring */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#ede7db"
                    strokeWidth="5"
                  />
                  {/* Segment 1: Avhämtning 50% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#c99a45"
                    strokeWidth="5"
                    strokeDasharray="44 88"
                    strokeDashoffset="0"
                  />
                  {/* Segment 2: Servering 50% */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#dfc99d"
                    strokeWidth="5"
                    strokeDasharray="44 88"
                    strokeDashoffset="-44"
                  />
                </svg>
                {/* Center text */}
                <div className="absolute text-center leading-tight">
                  <span className="block text-base font-bold text-[#1f2328]">2</span>
                  <span className="block text-[9px] text-[#7c828d]">beställningar</span>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[#555a64]">
                    <span className="size-2.5 rounded-full bg-[#c99a45]" />
                    <span>Avhämtning</span>
                  </span>
                  <span className="font-bold text-[#1f2328]">50%</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[#555a64]">
                    <span className="size-2.5 rounded-full bg-[#dfc99d]" />
                    <span>Servering</span>
                  </span>
                  <span className="font-bold text-[#1f2328]">50%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Försäljningsfördelning (Category Donut Chart matching Image 4) */}
          <div className="rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 border-b border-[#f2ede4] pb-2.5">
              <span className="text-base">⏱️</span>
              <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">
                Försäljningsfördelning
              </h2>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              {/* Donut graphic */}
              <div className="relative flex size-28 shrink-0 items-center justify-center">
                <svg viewBox="0 0 36 36" className="size-28 -rotate-90">
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#ede7db"
                    strokeWidth="5"
                  />
                  {/* Pizza: 70% (61.6 of 88) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#a78347"
                    strokeWidth="5"
                    strokeDasharray="61.6 88"
                    strokeDashoffset="0"
                  />
                  {/* Kebab: 20% (17.6 of 88) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#d99b38"
                    strokeWidth="5"
                    strokeDasharray="17.6 88"
                    strokeDashoffset="-61.6"
                  />
                  {/* Hamburgare: 10% (8.8 of 88) */}
                  <circle
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke="#e2cca0"
                    strokeWidth="5"
                    strokeDasharray="8.8 88"
                    strokeDashoffset="-79.2"
                  />
                </svg>
                {/* Center text */}
                <div className="absolute text-center leading-tight">
                  <span className="block text-sm font-bold text-[#1f2328]">300 kr</span>
                  <span className="block text-[9px] text-[#7c828d]">Total intäkt</span>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-1.5 text-xs flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[#555a64]">
                    <span className="size-2.5 rounded-full bg-[#a78347]" />
                    <span>Pizza</span>
                  </span>
                  <span className="font-bold text-[#1f2328]">70%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[#555a64]">
                    <span className="size-2.5 rounded-full bg-[#d99b38]" />
                    <span>Kebab</span>
                  </span>
                  <span className="font-bold text-[#1f2328]">20%</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[#555a64]">
                    <span className="size-2.5 rounded-full bg-[#e2cca0]" />
                    <span>Hamburgare</span>
                  </span>
                  <span className="font-bold text-[#1f2328]">10%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

