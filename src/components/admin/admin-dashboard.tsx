"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminLogoutButton } from "@/components/admin/logout-button";
import { useAdminOrders, type AdminOrderFilter } from "@/components/admin/use-admin-orders";
import { AdminOrderDialog } from "@/components/admin/admin-order-dialog";
import type { AdminOrderSummary } from "@/server/admin-orders";
import { CURRENT_SEASON } from "@/data/site";
import { getOpenStatus } from "@/lib/hours";
import { useNow } from "@/lib/use-now";
import { notifyStatusChange } from "@/lib/use-restaurant-status";
import { AdminHoursTab } from "@/components/admin/admin-hours-tab";
import { AdminNotificationsDropdown } from "@/components/admin/admin-notifications-dropdown";
import { AdminInvoicesTab, PaymentMethodBadge, OrderTypeBadge } from "@/components/admin/admin-invoices-tab";
import { AdminAnalyticsTab } from "@/components/admin/admin-analytics-tab";
import { AdminProductsTab } from "@/components/admin/admin-products-tab";
import { AdminCategoriesTab } from "@/components/admin/admin-categories-tab";
import { AdminModifiersTab } from "@/components/admin/admin-modifiers-tab";
import { AdminSettingsTab } from "@/components/admin/admin-settings-tab";
import type { ReceiptPdfInput } from "@/lib/order-receipt-pdf";
import { AdminReceiptModal } from "@/components/admin/admin-receipt-modal";

// --- Falcon Emblem SVG ---
function FalconEmblem({ className = "h-8 w-8 text-[#b88e4d]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Stylized Falken Falcon Crest */}
      <path d="M32 4 C36 10, 48 12, 58 10 C54 18, 46 22, 40 24 C46 28, 54 29, 60 28 C52 35, 42 37, 34 35 C38 41, 46 45, 52 47 C42 50, 32 46, 26 40 C28 46, 30 52, 34 56 C26 54, 20 48, 18 42 C14 48, 10 52, 6 54 C10 46, 14 38, 18 30 C12 28, 6 24, 2 20 C10 20, 18 22, 24 26 C22 18, 24 10, 32 4 Z" />
    </svg>
  );
}

// --- Status Types & Data ---
type OrderStatus = "Ny" | "Mottagen" | "Tillagas" | "Förbereds" | "Redo" | "Klar" | "Serverad" | "Klar för avhämtning" | "Uthämtad" | "Slutförd" | "Avbruten";

export type OrderDetailItem = {
  name: string;
  size?: string;
  quantity: number;
  price: number;
  options?: string[];
  notes?: string;
};

type DashboardOrder = {
  id: string;
  orderNumber: string;
  customer: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  dateTimeFormatted?: string;
  type: string;
  itemsText: string;
  items?: OrderDetailItem[];
  rawStatus?: string;
  total: number;
  paymentMethod: string;
  paymentStatus?: "Betald" | "Väntar på betalning" | "Återbetald";
  status: OrderStatus;
  statusBadge: {
    label: string;
    dotColor: string;
    textColor: string;
    bgColor: string;
  };
  primaryAction?: {
    label: string;
    variant: "gold" | "white" | "emerald";
  };
  sellerSnapshot?: {
    name: string;
    legalName?: string;
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
    phone?: string;
  } | null;
};

type OverviewPeriod = "today" | "yesterday" | "week" | "month" | "year";
export type OverviewData = {
  period: OverviewPeriod;
  range: { from: string; to: string; timeZone: string };
  metrics: {
    grossRevenueSek: number;
    refundedSek: number;
    netRevenueSek: number;
    revenueSek: number;
    orders: number;
    activeOrders: number;
    paidStripeOrders: number;
    paidSwishOrders?: number;
    paidOnlineOrders?: number;
    collectedCashOrders?: number;
    collectedCardTerminalOrders?: number;
    unpaidOrders: number;
    unpaidSek: number;
    averageOrderSek: number;
    reviewCount: number;
    averageRating: number | null;
    refundBreakdown?: {
      totalRefundedSek: number;
      adminAttestedSek: number;
      providerConfirmedSek: number;
      adminAttestedCount: number;
      providerConfirmedCount: number;
      refundCount: number;
    };
    reconciliation?: {
      status: "clean" | "discrepancy_detected";
      discrepancies: Array<{ orderId: string; type: string; detail: string }>;
      verifiedGrossSalesCount: number;
      unverifiedGrossSalesCount: number;
    };
  };
  chart: {
    key: string;
    label: string;
    orders: number;
    grossRevenueSek: number;
    refundedSek: number;
    netRevenueSek: number;
    revenueSek: number;
  }[];
  bestSellers: { name: string; quantity: number }[];
  settings: {
    onlineOrderingEnabled: boolean;
    manualOverride?: "open" | "closed" | null;
  };
  definitions?: {
    orders?: string;
    grossRevenue?: string;
    refunds?: string;
    netRevenue?: string;
    timeAttribution?: string;
    accountingNotice?: string;
  };
};

const overviewPeriodLabels: Record<OverviewPeriod, string> = {
  today: "Idag",
  yesterday: "Igår",
  week: "Vecka",
  month: "Månad",
  year: "År",
};

const tabHeaderTitles: Record<string, string> = {
  oversikt: "Översikt",
  bestallningar: "Beställningar",
  produkter: "Meny & Produkter",
  kategorier: "Kategorier",
  tillagg: "Tillägg & Ingredienser",
  fakturor: "Fakturor & Kvitton",
  omdomen: "Betyg & Omdömen",
  analyser: "Analyser",
  oppettider: "Öppettider",
  anvandare: "Användare",
  installningar: "Inställningar",
};

const money = (sek: number) => `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(sek)} kr`;

function getMonotoneSpline(points: { x: number; y: number }[], baselineY: number) {
  const n = points.length;
  if (n === 0) return { linePath: "", areaPath: "" };
  if (n === 1) {
    return {
      linePath: `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`,
      areaPath: `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[0].x.toFixed(1)},${baselineY} Z`,
    };
  }

  const dx = new Array(n - 1);
  const dy = new Array(n - 1);
  const m = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x;
    dy[i] = points[i + 1].y - points[i].y;
    m[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
  }

  const tangents = new Array(n);
  tangents[0] = m[0];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  tangents[n - 1] = m[n - 2];

  let linePath = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const cp1x = points[i].x + dx[i] / 3;
    let cp1y = points[i].y + (tangents[i] * dx[i]) / 3;
    const cp2x = points[i + 1].x - dx[i] / 3;
    let cp2y = points[i + 1].y - (tangents[i + 1] * dx[i]) / 3;

    cp1y = Math.min(baselineY, cp1y);
    cp2y = Math.min(baselineY, cp2y);

    linePath += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }

  const lastPoint = points[n - 1];
  const firstPoint = points[0];
  const areaPath = `${linePath} L ${lastPoint.x.toFixed(1)},${baselineY} L ${firstPoint.x.toFixed(1)},${baselineY} Z`;

  return { linePath, areaPath };
}

export type OverviewChartProps = {
  data: OverviewData["chart"];
  totalGross?: number;
  totalRefunds?: number;
  totalNet?: number;
  totalOrders?: number;
  definitions?: OverviewData["definitions"];
};

function OverviewChart({
  data,
  totalGross = 0,
  totalRefunds = 0,
  totalNet = 0,
  totalOrders = 0,
}: OverviewChartProps) {
  const chartData = data ?? [];
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el) setContainerWidth(el.clientWidth);
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Format data: restaurant business hours (11:00 to 22:00) or date buckets
  const isHourly = chartData.some((p) => p.label.includes(":"));
  type ChartPoint = {
    key: string;
    label: string;
    grossRevenueSek: number;
    refundedSek: number;
    netRevenueSek: number;
    orders: number;
  };
  let displayPoints: ChartPoint[] = [];

  if (isHourly) {
    const hours = [
      "11:00", "12:00", "13:00", "14:00", "15:00", "16:00",
      "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
    ];
    const map = new Map(chartData.map((p) => [p.label, p]));
    displayPoints = hours.map((h) => {
      const p = map.get(h);
      const gross = p?.grossRevenueSek ?? (p?.revenueSek ?? 0);
      const ref = p?.refundedSek ?? 0;
      const net = p?.netRevenueSek ?? (gross - ref);
      return {
        key: h,
        label: h,
        grossRevenueSek: gross,
        refundedSek: ref,
        netRevenueSek: net,
        orders: p?.orders ?? 0,
      };
    });
  } else {
    displayPoints = chartData.length > 0
      ? chartData.map((p) => {
          const gross = p.grossRevenueSek ?? (p.revenueSek ?? 0);
          const ref = p.refundedSek ?? 0;
          const net = p.netRevenueSek ?? (gross - ref);
          return {
            key: p.key,
            label: p.label,
            grossRevenueSek: gross,
            refundedSek: ref,
            netRevenueSek: net,
            orders: p.orders ?? 0,
          };
        })
      : [{ key: "1", label: "Idag", grossRevenueSek: 0, refundedSek: 0, netRevenueSek: 0, orders: 0 }];
  }

  // Dimensions
  const width = containerWidth > 0 ? containerWidth : 800;
  const height = 275;
  const left = 56;
  const right = 36;
  const top = 30;
  const bottom = 32;
  const plotWidth = Math.max(10, width - left - right);
  const plotHeight = height - top - bottom;
  const baseline = top + plotHeight;

  // Scales matching reference: Supports positive gross & possible negative net values
  const allValues = [
    totalGross,
    totalRefunds,
    totalNet,
    ...displayPoints.flatMap((p) => [p.grossRevenueSek, p.refundedSek, p.netRevenueSek]),
  ];
  const rawMax = Math.max(300, ...allValues);
  const rawMin = Math.min(0, ...allValues);

  const maxRevenueScale = Math.ceil(rawMax / 50) * 50;
  const minRevenueScale = rawMin < 0 ? Math.floor(rawMin / 50) * 50 : 0;
  const revenueSpan = Math.max(50, maxRevenueScale - minRevenueScale);

  // 7 Ticks across the revenue span
  const revenueTicks = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    Math.round(maxRevenueScale - (i / 6) * revenueSpan)
  );

  const maxOrders = Math.max(6, ...displayPoints.map((p) => p.orders));
  const maxOrdersScale = Math.max(6, Math.ceil(maxOrders));
  const ordersTicks = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    Math.round(maxOrdersScale - (i / 6) * maxOrdersScale)
  );

  const zeroRatio = (0 - minRevenueScale) / revenueSpan;
  const zeroY = baseline - zeroRatio * plotHeight;

  const n = displayPoints.length;
  const step = n > 1 ? plotWidth / (n - 1) : plotWidth;

  const getY = (val: number) => {
    const r = (val - minRevenueScale) / revenueSpan;
    return baseline - Math.min(1, Math.max(0, r)) * plotHeight;
  };

  const grossPoints = displayPoints.map((point, index) => ({
    x: left + index * step,
    y: getY(point.grossRevenueSek),
    raw: point,
  }));

  const netPoints = displayPoints.map((point, index) => ({
    x: left + index * step,
    y: getY(point.netRevenueSek),
    raw: point,
  }));

  const refundPoints = displayPoints.map((point, index) => ({
    x: left + index * step,
    y: getY(point.refundedSek),
    raw: point,
  }));

  const orderPoints = displayPoints.map((point, index) => {
    const x = left + index * step;
    const ratio = maxOrdersScale > 0 ? Math.min(1, Math.max(0, point.orders / maxOrdersScale)) : 0;
    const y = baseline - ratio * plotHeight;
    return { x, y, raw: point };
  });

  const grossSpline = getMonotoneSpline(grossPoints, zeroY);
  const netSpline = getMonotoneSpline(netPoints, zeroY);
  const refundSpline = getMonotoneSpline(refundPoints, zeroY);
  const orderSpline = getMonotoneSpline(orderPoints, baseline);

  // Find peak point for default tooltip
  let peakIdx = 0;
  let maxV = -Infinity;
  displayPoints.forEach((p, idx) => {
    if (p.grossRevenueSek > maxV) {
      maxV = p.grossRevenueSek;
      peakIdx = idx;
    }
  });
  if (maxV <= 0 && isHourly) peakIdx = 3;

  const activeIdx = hoveredIdx !== null ? hoveredIdx : peakIdx;
  const activeGrossPoint = grossPoints[activeIdx] || grossPoints[0];
  const activeNetPoint = netPoints[activeIdx] || netPoints[0];
  const activeRefundPoint = refundPoints[activeIdx] || refundPoints[0];
  const activeOrderPoint = orderPoints[activeIdx] || orderPoints[0];
  const hasRefunds = totalRefunds > 0 || displayPoints.some((p) => p.refundedSek > 0);

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* Top Section: 4 KPI Cards on left, Legends on right */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        {/* Left: Financial KPI Cards */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
          {/* Card 1: Bruttoförsäljning */}
          <div className="flex items-center gap-2 sm:gap-2.5 rounded-xl border border-[#efe9dc] bg-[#fbf9f4] px-3 py-1.5 shadow-2xs">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#f4ebd9] text-xs sm:text-sm">
              🪙
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-medium text-[#7c828d] leading-tight truncate">Brutto</p>
              <p className="text-sm sm:text-base font-bold text-[#1f2328] leading-tight truncate" data-testid="chart-gross-total">
                {money(totalGross)}
              </p>
            </div>
          </div>

          {/* Card 2: Återbetalt */}
          <div className="flex items-center gap-2 sm:gap-2.5 rounded-xl border border-[#efe9dc] bg-[#fbf9f4] px-3 py-1.5 shadow-2xs">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#fef2f2] text-xs sm:text-sm">
              ↩️
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-medium text-[#7c828d] leading-tight truncate">Återbetalt</p>
              <p className={`text-sm sm:text-base font-bold leading-tight truncate ${totalRefunds > 0 ? "text-[#e04f44]" : "text-[#1f2328]"}`} data-testid="chart-refunds-total">
                {money(totalRefunds)}
              </p>
            </div>
          </div>

          {/* Card 3: Netto */}
          <div className="flex items-center gap-2 sm:gap-2.5 rounded-xl border border-[#efe9dc] bg-[#fbf9f4] px-3 py-1.5 shadow-2xs">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0fdf4] text-xs sm:text-sm">
              📊
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-medium text-[#7c828d] leading-tight truncate">Netto</p>
              <p className={`text-sm sm:text-base font-bold leading-tight truncate ${totalNet < 0 ? "text-[#e04f44]" : "text-[#15803d]"}`} data-testid="chart-net-total">
                {money(totalNet)}
              </p>
            </div>
          </div>

          {/* Card 4: Antal beställningar */}
          <div className="flex items-center gap-2 sm:gap-2.5 rounded-xl border border-[#efe9dc] bg-[#fbf9f4] px-3 py-1.5 shadow-2xs">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#f4ebd9] text-xs sm:text-sm">
              🛒
            </div>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-medium text-[#7c828d] leading-tight truncate">Beställningar</p>
              <p className="text-sm sm:text-base font-bold text-[#1f2328] leading-tight truncate" data-testid="chart-orders-total">
                {totalOrders} st
              </p>
            </div>
          </div>
        </div>

        {/* Right: Legends */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-[#555a64]">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="size-2.5 rounded-full bg-[#c99a45]" />
            <span>Brutto</span>
          </span>
          {hasRefunds && (
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span className="size-2.5 rounded-full bg-[#e04f44]" />
              <span>Återbetalt</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="size-2.5 rounded-full bg-[#15803d]" />
            <span>Netto</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="inline-flex items-center">
              <span className="w-1.5 h-0.5 bg-[#5a4d36]" />
              <span className="size-1.5 rounded-full border-2 border-[#5a4d36] bg-white -mx-0.5" />
              <span className="w-1.5 h-0.5 bg-[#5a4d36]" />
            </span>
            <span>Ordrar</span>
          </span>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative">
        <svg
          className="h-[250px] sm:h-[275px] w-full block overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Intäkter och ordertrend mjukt diagram"
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="refRevenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c99a45" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#c99a45" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#c99a45" stopOpacity="0.0" />
            </linearGradient>
            <filter id="peakGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#c99a45" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Horizontal Dashed Gridlines & Dual Left/Right Ticks */}
          {revenueTicks.map((revTick, i) => {
            const y = top + (plotHeight * i) / (revenueTicks.length - 1);
            const ordTick = ordersTicks[i] ?? 0;

            return (
              <g key={i}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                  stroke="#eee7da"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                {/* Left Tick: kr */}
                <text
                  x={left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="10"
                  className="fill-[#7c828d] font-sans font-medium"
                >
                  {revTick} kr
                </text>
                {/* Right Tick: orders */}
                <text
                  x={width - right + 8}
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

          {/* Zero baseline guide line if scale has negative values */}
          {minRevenueScale < 0 && (
            <line
              x1={left}
              x2={width - right}
              y1={zeroY}
              y2={zeroY}
              stroke="#cbd5e1"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
          )}

          {/* Golden Area Fill Under Gross Revenue Curve */}
          {grossSpline.areaPath && (
            <path d={grossSpline.areaPath} fill="url(#refRevenueGrad)" />
          )}

          {/* Gross Revenue Curve (Gold) */}
          {grossSpline.linePath && (
            <path
              d={grossSpline.linePath}
              fill="none"
              stroke="#c99a45"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Refund Curve (Rose/Red dashed) - only when refunds present */}
          {hasRefunds && refundSpline.linePath && (
            <path
              d={refundSpline.linePath}
              fill="none"
              stroke="#e04f44"
              strokeWidth="2"
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Net Revenue Curve (Emerald) */}
          {netSpline.linePath && (
            <path
              d={netSpline.linePath}
              fill="none"
              stroke="#15803d"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Brown Order Trend Curve */}
          {orderSpline.linePath && (
            <path
              d={orderSpline.linePath}
              fill="none"
              stroke="#5a4d36"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Vertical Dashed Guide Line */}
          {activeGrossPoint && (
            <g>
              <line
                x1={activeGrossPoint.x}
                y1={top}
                x2={activeGrossPoint.x}
                y2={baseline}
                stroke="#c99a45"
                strokeDasharray="4 4"
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
              <polygon
                points={`${activeGrossPoint.x - 3.5},${baseline} ${activeGrossPoint.x + 3.5},${baseline} ${activeGrossPoint.x},${baseline - 5}`}
                fill="#837147"
              />
            </g>
          )}

          {/* Glowing Dots on Active/Hovered Point */}
          {activeGrossPoint && (
            <circle
              cx={activeGrossPoint.x}
              cy={activeGrossPoint.y}
              r="5"
              fill="#ffffff"
              stroke="#c99a45"
              strokeWidth="2.5"
              filter="url(#peakGlow)"
              className="transition-all duration-150"
            />
          )}

          {activeNetPoint && (
            <circle
              cx={activeNetPoint.x}
              cy={activeNetPoint.y}
              r="4"
              fill="#ffffff"
              stroke="#15803d"
              strokeWidth="2"
              className="transition-all duration-150"
            />
          )}

          {hasRefunds && activeRefundPoint && activeRefundPoint.raw.refundedSek > 0 && (
            <circle
              cx={activeRefundPoint.x}
              cy={activeRefundPoint.y}
              r="4"
              fill="#ffffff"
              stroke="#e04f44"
              strokeWidth="2"
              className="transition-all duration-150"
            />
          )}

          {activeOrderPoint && activeGrossPoint.raw.orders > 0 && (
            <circle
              cx={activeOrderPoint.x}
              cy={activeOrderPoint.y}
              r="3.5"
              fill="#ffffff"
              stroke="#5a4d36"
              strokeWidth="2"
              className="transition-all duration-150"
            />
          )}

          {/* X Axis Time/Date Labels */}
          {displayPoints.map((point, index) => (
            <text
              key={point.key}
              x={left + index * step}
              y={height - 8}
              textAnchor="middle"
              fontSize="10"
              className={`transition-colors font-medium ${
                index === activeIdx ? "fill-[#1f2328] font-bold" : "fill-[#7c828d]"
              }`}
            >
              {point.label}
            </text>
          ))}

          {/* Invisible Hover Rects */}
          {displayPoints.map((point, index) => {
            const halfStep = step / 2;
            const x = Math.max(left, left + index * step - halfStep);
            return (
              <rect
                key={`hover-${point.key}`}
                x={x}
                y={top}
                width={step}
                height={plotHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(index)}
              />
            );
          })}
        </svg>

        {/* Floating Light Glassy Tooltip */}
        {activeGrossPoint && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-xl border border-[#e2dac8] bg-[#f8f5ee]/95 px-3.5 py-1.5 shadow-lg shadow-stone-900/8 backdrop-blur-md text-left transition-all duration-150 ring-1 ring-black/5"
            style={{
              left: `${activeGrossPoint.x}px`,
              top: `${Math.max(2, Math.min(activeGrossPoint.y, activeNetPoint.y) - 86)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#ede5d3] pb-1 mb-1">
              <span className="text-[10px] font-bold tracking-wide uppercase text-[#8c827a]">
                {activeGrossPoint.raw.label}
              </span>
              <span className="text-[9px] font-semibold text-[#837147] bg-[#f0e8d6] px-1.5 py-0.5 rounded-md">
                {activeGrossPoint.raw.orders} {activeGrossPoint.raw.orders === 1 ? "order" : "ordrar"}
              </span>
            </div>
            <div className="space-y-0.5 text-xs">
              <div className="flex items-center justify-between gap-3 text-[10.5px]">
                <span className="inline-flex items-center gap-1.5 text-[#7c828d]">
                  <span className="size-1.5 rounded-full bg-[#c99a45]" />
                  Brutto:
                </span>
                <span className="font-bold text-[#1f2328]">{money(activeGrossPoint.raw.grossRevenueSek)}</span>
              </div>
              {activeGrossPoint.raw.refundedSek > 0 && (
                <div className="flex items-center justify-between gap-3 text-[10.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#e04f44]">
                    <span className="size-1.5 rounded-full bg-[#e04f44]" />
                    Återbetalt:
                  </span>
                  <span className="font-bold text-[#e04f44]">-{money(activeGrossPoint.raw.refundedSek)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 text-[10.5px] pt-0.5 border-t border-[#ede5d3]/60">
                <span className="inline-flex items-center gap-1.5 text-[#15803d] font-semibold">
                  <span className="size-1.5 rounded-full bg-[#15803d]" />
                  Netto:
                </span>
                <span className={`font-bold ${activeGrossPoint.raw.netRevenueSek < 0 ? "text-[#e04f44]" : "text-[#15803d]"}`}>
                  {money(activeGrossPoint.raw.netRevenueSek)}
                </span>
              </div>
            </div>
            {/* Tooltip downward caret */}
            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-6 border-t-[#f8f5ee] filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]" />
          </div>
        )}
      </div>

      {/* Chart Footer Notice */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-[#8c827a] px-1 border-t border-[#f2ede4] pt-2">
        <span className="inline-flex items-center gap-1">
          <span>ℹ️</span>
          <span>Återbetalningar visas enligt registreringsdatum.</span>
        </span>
        <span>Driftsdata för slutförda transaktioner (inkl. moms).</span>
      </div>
    </div>
  );
}

function OrderItemsPreviewCell({ ord }: { ord: DashboardOrder }) {
  const items = ord.items || [];
  if (items.length === 0) {
    return (
      <span className="text-[#8c827a] italic text-xs">
        {ord.itemsText || "Inga artiklar"}
      </span>
    );
  }

  const firstItem = items[0];
  const moreCount = items.length - 1;

  return (
    <div
      className="max-w-[210px]"
      title={`${ord.itemsText} — Klicka för att se hela beställningen`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="font-semibold text-[#1f2328] text-xs truncate max-w-[145px]">
          {firstItem.quantity}x {firstItem.name}
        </p>
        {moreCount > 0 && (
          <span className="inline-flex items-center rounded-md bg-[#f4ebd9] px-1.5 py-0.5 text-[10px] font-semibold text-[#837147] whitespace-nowrap">
            +{moreCount} till...
          </span>
        )}
      </div>
      {firstItem.size && (
        <p className="text-[10.5px] text-[#8c827a] truncate mt-0.5">
          {firstItem.size}
          {moreCount > 0 ? " · fler rätter i ordern" : ""}
        </p>
      )}
    </div>
  );
}

function toDashboardOrder(order: AdminOrderSummary): DashboardOrder {
  const styles: Record<string, DashboardOrder["statusBadge"]> = {
    CONFIRMED: { label: "Ny", dotColor: "bg-[#2563eb]", textColor: "text-[#1d4ed8]", bgColor: "bg-[#eff6ff]" },
    ACKNOWLEDGED: { label: "Mottagen", dotColor: "bg-[#d97706]", textColor: "text-[#92400e]", bgColor: "bg-[#fffbeb]" },
    PREPARING: { label: "Tillagas", dotColor: "bg-[#f59e0b]", textColor: "text-[#b45309]", bgColor: "bg-[#fffbeb]" },
    READY_FOR_PICKUP: { label: "Redo", dotColor: "bg-[#16a34a]", textColor: "text-[#15803d]", bgColor: "bg-[#f0fdf4]" },
    PICKED_UP: { label: "Uthämtad", dotColor: "bg-[#94a3b8]", textColor: "text-[#475569]", bgColor: "bg-[#f8fafc]" },
    CANCELLED: { label: "Avbruten", dotColor: "bg-[#ef4444]", textColor: "text-[#b91c1c]", bgColor: "bg-[#fef2f2]" },
  };
  const actions: Record<string, DashboardOrder["primaryAction"]> = {
    CONFIRMED: { label: "Bekräfta mottagning", variant: "gold" },
    ACKNOWLEDGED: { label: "Börja tillaga", variant: "gold" },
    PREPARING: { label: "Markera klar", variant: "white" },
    READY_FOR_PICKUP: (order.paymentMethod === "card" || order.paymentMethod === "swish") ? { label: "Markera hämtad", variant: "emerald" } : undefined,
  };
  let dtFmt = "";
  try {
    const d = new Date(order.createdAt);
    const datePart = d.toISOString().split("T")[0];
    const timePart = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(d);
    dtFmt = `${datePart} ${timePart}`;
  } catch {
    dtFmt = order.createdAt;
  }
  return {
    id: order.publicId, orderNumber: order.publicId, customer: order.customerName,
    phone: order.phone,
    createdAt: new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(order.createdAt)),
    dateTimeFormatted: dtFmt,
    type: "Avhämtning",
    itemsText: order.items.map((item) => `${item.quantity}x ${item.name}`).join(", "),
    items: order.items.map((item) => ({ name: item.name, size: item.variant ?? undefined, quantity: item.quantity, price: 0 })),
    total: order.totalSek,
    paymentMethod: order.paymentMethod === "card" ? "Stripe - Kort" : order.paymentMethod === "swish" ? "Swish" : "Betala på plats",
    paymentStatus: order.paymentStatus === "refunded" ? "Återbetald" : order.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
    status: styles[order.fulfillmentStatus]?.label as OrderStatus ?? "Ny",
    rawStatus: order.fulfillmentStatus,
    statusBadge: styles[order.fulfillmentStatus] ?? styles.CONFIRMED,
    primaryAction: actions[order.fulfillmentStatus],
    sellerSnapshot: order.sellerSnapshot ?? null,
  };
}

function getReceiptInputFromOrder(ord: DashboardOrder): ReceiptPdfInput {
  return {
    orderNumber: ord.orderNumber,
    customerName: ord.customer,
    phone: ord.phone,
    date: ord.dateTimeFormatted || ord.createdAt || new Date().toISOString().split("T")[0],
    paymentMethod: ord.paymentMethod,
    paymentStatus: ord.paymentStatus ?? "Betald",
    totalSek: ord.total,
    items: (ord.items && ord.items.length > 0)
      ? ord.items.map((it) => ({
          description: it.name,
          quantity: it.quantity,
          unitPriceSek: Math.round(ord.total / Math.max(1, it.quantity)),
        }))
      : [{ description: "Restaurangbeställning", quantity: 1, unitPriceSek: ord.total }],
    seller: ord.sellerSnapshot ? {
      name: ord.sellerSnapshot.name,
      legalName: ord.sellerSnapshot.legalName,
      street: ord.sellerSnapshot.street,
      city: ord.sellerSnapshot.city,
      phone: ord.sellerSnapshot.phone,
    } : undefined,
  };
}


function getStockholmDatePresets(): { id: OverviewPeriod; label: string; range: string }[] {
  const now = new Date();
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", ...opts }).format(d);

  const todayStr = fmt(now, { day: "numeric", month: "short", year: "numeric" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  const yesterdayStr = fmt(yesterday, { day: "numeric", month: "short", year: "numeric" });

  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now.getTime() - dayOfWeek * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const weekStr = `${fmt(monday, { day: "numeric", month: "short" })} – ${fmt(sunday, { day: "numeric", month: "short", year: "numeric" })}`;

  const monthStr = fmt(now, { month: "long", year: "numeric" });
  const yearStr = fmt(now, { year: "numeric" });

  return [
    { id: "today", label: "Idag", range: todayStr },
    { id: "yesterday", label: "Igår", range: yesterdayStr },
    { id: "week", label: "Denna vecka", range: weekStr },
    { id: "month", label: "Denna månad", range: monthStr },
    { id: "year", label: "Detta år", range: yearStr },
  ];
}

export function AdminDashboard({
  adminEmail,
  displayName,
  initialTab,
}: {
  adminEmail: string;
  displayName: string;
  initialTab?: "oversikt" | "bestallningar";
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    | "oversikt"
    | "bestallningar"
    | "meny"
    | "kategorier"
    | "tillagg"
    | "fakturor"
    | "omdomen"
    | "analyser"
    | "oppettider"
    | "anvandare"
    | "installningar"
  >(initialTab ?? "oversikt");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState<string>("Alla");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const datePresets = useMemo(() => getStockholmDatePresets(), []);
  const [overviewPeriod, setOverviewPeriod] = useState<OverviewPeriod>("today");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [mobileDateDropdownOpen, setMobileDateDropdownOpen] = useState(false);
  const [dateRangeLabel, setDateRangeLabel] = useState(() => datePresets[0].range);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const mobileDateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(target)) {
        setDateDropdownOpen(false);
      }
      if (mobileDateDropdownRef.current && !mobileDateDropdownRef.current.contains(target)) {
        setMobileDateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPeriod = (periodKey: OverviewPeriod) => {
    setOverviewPeriod(periodKey);
    const found = datePresets.find((p) => p.id === periodKey);
    if (found) {
      setDateRangeLabel(found.range);
    }
    setDateDropdownOpen(false);
    setMobileDateDropdownOpen(false);
  };


  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [orderingBusy, setOrderingBusy] = useState(false);
  const [orderingError, setOrderingError] = useState<string | null>(null);

  const now = useNow();
  const scheduleStatus = now !== null ? getOpenStatus(new Date(now), CURRENT_SEASON) : null;
  const isScheduleOpen = scheduleStatus?.isOpen ?? false;
  const manualOverride = overview?.settings?.manualOverride ?? null;
  const isManualEnabled = overview?.settings?.onlineOrderingEnabled ?? true;

  const isActuallyOpen =
    manualOverride === "closed" || !isManualEnabled
      ? false
      : isScheduleOpen;

  const isManuallyClosed = manualOverride === "closed" || (!isManualEnabled && isScheduleOpen);

  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const apiFilter: AdminOrderFilter = ({
    Alla: "ALL",
    Nya: "CONFIRMED",
    Mottagna: "ACKNOWLEDGED",
    Förbereds: "PREPARING",
    Klara: "READY_FOR_PICKUP",
    Slutförda: "PICKED_UP",
    Avbrutna: "CANCELLED",
    Återbetalda: "REFUNDED",
  } as Record<string, AdminOrderFilter>)[orderFilter] ?? "ALL";
  const ordersApi = useAdminOrders(
    activeTab === "bestallningar" || activeTab === "oversikt" || activeTab === "fakturor",
    activeTab === "fakturor" ? "ALL" : apiFilter,
    debouncedSearch,
    orderPage
  );
  const orders = (ordersApi.list?.orders ?? []).map(toDashboardOrder);
  useEffect(() => { const timer = window.setTimeout(() => { setOrderPage(1); setDebouncedSearch(orderSearchQuery.trim()); }, 300); return () => window.clearTimeout(timer); }, [orderSearchQuery]);

  const [activeActionMenu, setActiveActionMenu] = useState<{
    id: string;
    order: DashboardOrder;
    top: number;
    right: number;
  } | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptPdfInput | null>(null);

  useEffect(() => {
    if (!activeActionMenu) return;
    const handleClose = () => setActiveActionMenu(null);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [activeActionMenu]);

  useEffect(() => {
    if (activeTab !== "oversikt") return;
    let cancelled = false;
    const load = async () => {
      setOverviewLoading(true);
      try {
        const params = new URLSearchParams({ period: overviewPeriod, status: apiFilter });
        const response = await fetch(`/api/admin/overview?${params.toString()}`, { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!response.ok) throw new Error("Översikten kunde inte hämtas just nu.");
        const result = await response.json() as OverviewData;
        if (!cancelled) {
          setOverview(result);
          setOverviewError(null);
        }
      } catch (error) {
        if (!cancelled) setOverviewError(error instanceof Error ? error.message : "Översikten kunde inte hämtas just nu.");
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeTab, overviewPeriod, apiFilter, router]);

  async function handleOrderingToggle() {
    if (!overview || orderingBusy) return;
    setOrderingBusy(true);
    setOrderingError(null);
    try {
      const targetState = !isActuallyOpen;
      const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("falken_admin_csrf="))?.split("=")[1];
      const response = await fetch("/api/admin/restaurant/ordering", {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-csrf-token": csrf ? decodeURIComponent(csrf) : "" },
        body: JSON.stringify({ targetState }),
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) throw new Error("Inställningen för onlinebeställningar kunde inte sparas.");
      const result = await response.json() as { onlineOrderingEnabled: boolean; manualOverride?: "open" | "closed" | null };
      setOverview((current) => current ? { ...current, settings: result } : current);
      notifyStatusChange();
    } catch (error) {
      setOrderingError(error instanceof Error ? error.message : "Inställningen kunde inte sparas.");
    } finally {
      setOrderingBusy(false);
    }
  }

  const handleSelectOrderFromNotification = (publicId: string) => {
    setActiveTab("bestallningar");
    void ordersApi.open(publicId);
    setOrderFilter("Alla");
    setOrderSearchQuery("");
    setHighlightedOrderId(publicId);

    setTimeout(() => {
      const el = document.getElementById(`order-row-${publicId}`) ?? document.getElementById(`order-row-overview-${publicId}`);
      if (el) {
        const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
      }
    }, 120);

    setTimeout(() => {
      setHighlightedOrderId((curr) => (curr === publicId ? null : curr));
    }, 4000);
  };

  async function handleAdvanceOrder(orderId: string) {
    const order = ordersApi.list?.orders.find((item) => item.publicId === orderId);
    if (!order) return;
    const to = ({
      CONFIRMED: "ACKNOWLEDGED",
      ACKNOWLEDGED: "PREPARING",
      PREPARING: "READY_FOR_PICKUP",
      READY_FOR_PICKUP: (order.paymentMethod === "card" || order.paymentMethod === "swish") ? "PICKED_UP" : null,
    } as Record<string, string | null>)[order.fulfillmentStatus];
    if (to) await ordersApi.transition(orderId, order.fulfillmentStatus, to);
  }

  const filteredOrders = orders;

  return (
    <div className="flex min-h-dvh bg-[#f9f8f4] text-[#1f2328] font-sans antialiased">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ========================================================================= */}
      {/* LEFT SIDEBAR (Sticky & Fixed so it never scrolls away)                    */}
      {/* ========================================================================= */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 flex-col justify-between border-r border-[#e8e2d5] bg-[#f9f8f4] px-3 py-4 transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:self-start lg:overflow-y-auto lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "max-lg:-translate-x-full"
        }`}
      >
        {/* Top brand header */}
        <div className="space-y-5">
          <div className="flex items-center gap-2.5 px-1.5">
            <FalconEmblem className="h-9 w-9 text-[#b88e4d] shrink-0" />
            <div className="leading-tight min-w-0">
              <span className="font-serif text-base font-bold tracking-[0.2em] text-[#1f2328] block truncate">
                FALKEN
              </span>
              <span className="text-[8.5px] font-semibold tracking-[0.14em] text-[#8c827a] uppercase block truncate">
                Restaurang &amp; Pizzeria
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab("oversikt");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition ${
                activeTab === "oversikt"
                  ? "bg-[#a78347] text-white shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Översikt</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("bestallningar");
                setSidebarOpen(false);
              }}
              className={`w-full flex h-8.5 items-center justify-between px-2.5 py-0 rounded-lg text-xs font-medium transition ${
                activeTab === "bestallningar"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <span>Beställningar</span>
              </div>
              {Boolean(ordersApi.list?.confirmedCount) && (
                <span
                  title={`${ordersApi.list?.confirmedCount} nya obekräftade beställningar`}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dc2626] p-0 text-center text-[10px] font-bold leading-none tabular-nums text-white animate-pulse"
                >
                  {ordersApi.list?.confirmedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("meny");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "meny"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              {/* Utensils / Fork-Knife icon for Menu & Products */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
                <path d="M7 2v20" />
                <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
              </svg>
              <span>Meny &amp; Produkter</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("kategorier");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "kategorier"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
              </svg>
              <span>Kategorier</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("tillagg");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "tillagg"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Tillägg &amp; Ingredienser</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("fakturor");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "fakturor"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Fakturor &amp; Kvitton</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("omdomen");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "omdomen"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Betyg &amp; Omdömen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("analyser");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "analyser"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span>Analyser</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("oppettider");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "oppettider"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              {/* Door/Store-hours icon for Öppettider */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Öppettider</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("anvandare");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "anvandare"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Användare</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab("installningar");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === "installningar"
                  ? "bg-[#a78347] text-white font-semibold shadow-xs"
                  : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Inställningar</span>
            </button>
          </nav>
        </div>

        {/* Bottom decorative pizza badge with script & Italian tricolor */}
        <div className="pt-3 border-t border-[#e8e2d5] mt-auto">
          <div className="relative overflow-hidden rounded-xl border border-[#e4ded2] shadow-xs">
            <div className="relative h-32 w-full">
              <Image
                src="/images/dishes/pizza/margherita.webp"
                alt="Falken Pizza"
                fill
                priority
                sizes="240px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-3">
                <span className="font-serif italic text-white text-xs drop-shadow-sm leading-snug">
                  God mat för alla tillfällen
                </span>
                {/* Italian Flag stripe */}
                <div className="flex h-1.5 w-12 rounded-full overflow-hidden mt-2 shadow-xs">
                  <div className="w-1/3 bg-[#009246]" />
                  <div className="w-1/3 bg-white" />
                  <div className="w-1/3 bg-[#ce2b37]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA                                                         */}
      {/* ========================================================================= */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 border-b border-[#e8e2d5] bg-[#f9f8f4]/95 backdrop-blur-xs">
          {/* Main Top Row */}
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-5 sm:py-3.5 gap-2">
            {/* Left: Hamburger & Title */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="rounded-lg p-1.5 text-[#555a64] hover:bg-black/5 hover:text-[#1f2328] focus:outline-none shrink-0 cursor-pointer"
                aria-label="Öppna meny"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="font-serif text-lg sm:text-2xl font-bold tracking-tight text-[#1f2328] leading-tight truncate">
                  Admin Dashboard
                </h1>
                <p className="text-[10px] sm:text-[11px] text-[#7c828d] truncate">
                  Falken Restaurang &amp; Pizzeria
                </p>
              </div>
            </div>

            {/* Right Controls: Desktop (md+) shows all controls; Mobile (<md) shows quick actions (notifications + avatar) */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
              {/* Desktop-only Date Picker and Store Status Toggle */}
              <div className="hidden md:flex items-center gap-1.5 sm:gap-2">
                {activeTab === "oversikt" && (
                  <div className="relative" ref={dateDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDateDropdownOpen((prev) => !prev)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#555a64] shadow-xs hover:border-[#a78347] transition sm:text-xs cursor-pointer"
                      aria-expanded={dateDropdownOpen}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#8a7040]" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      <span className="whitespace-nowrap">{dateRangeLabel}</span>
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        className={`block h-3.5 w-3.5 shrink-0 text-[#8c827a] transition-transform duration-200 ${dateDropdownOpen ? "rotate-180" : ""}`}
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {dateDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border border-[#e4ded2] bg-white p-2 shadow-lg z-50 text-xs">
                        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7c828d]">Välj tidsintervall</p>
                        {datePresets.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectPeriod(preset.id)}
                            className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition whitespace-nowrap cursor-pointer ${
                              overviewPeriod === preset.id ? "bg-[#f5efdf] text-[#8a7040] font-bold" : "text-[#1f2328] hover:bg-[#f5f1e8]"
                            }`}
                          >
                            <span className="text-xs font-semibold">{preset.label}</span>
                            <span className="text-[11px] text-[#7c828d]">{preset.range}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  role="switch"
                  aria-checked={isActuallyOpen}
                  disabled={!overview || orderingBusy}
                  onClick={() => void handleOrderingToggle()}
                  title={
                    !overview
                      ? "Laddar status…"
                      : isActuallyOpen
                      ? `Öppet nu (${scheduleStatus?.label ?? ""}). Klicka för att stänga.`
                      : isManuallyClosed
                      ? "Stängt manuellt. Klicka för att öppna onlinebeställningar."
                      : `Stängt enligt schema (${scheduleStatus?.label ?? "utanför öppettider"}). Klicka för att öppna onlinebeställningar.`
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#555a64] shadow-xs hover:border-[#b88e4d] transition disabled:opacity-60 sm:text-xs cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${
                      isActuallyOpen
                        ? "bg-[#4caf73] animate-pulse"
                        : "bg-[#ce2b37]"
                    }`}
                  />
                  <span className="whitespace-nowrap">
                    {!overview
                      ? "Laddar…"
                      : isActuallyOpen
                      ? "Öppet nu"
                      : isManuallyClosed
                      ? "Stängt manuellt"
                      : "Stängt nu"}
                  </span>
                  <span
                    className={`relative inline-block h-5 w-9 rounded-full transition ${
                      isActuallyOpen ? "bg-[#4caf73]" : "bg-[#ce2b37]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                        isActuallyOpen ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>

              {/* Universal Notification Dropdown */}
              <AdminNotificationsDropdown onSelectOrder={handleSelectOrderFromNotification} />

              {/* Universal User Profile Avatar Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProfileMenu((prev) => !prev)}
                  className="flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white py-1 pl-1 pr-1 sm:pr-2.5 shadow-xs hover:border-[#b88e4d] transition focus:outline-none cursor-pointer"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#a67c4e] text-xs font-bold text-white">
                    {displayName.trim().slice(0, 2).toUpperCase() || "AH"}
                  </div>
                  <div className="hidden text-left sm:block leading-tight">
                    <span className="block text-xs font-bold text-[#1f2328]">
                      {displayName || "Admin"}
                    </span>
                    <span className="block text-[10px] text-[#7c828d]">
                      Restaurangägare
                    </span>
                  </div>
                </button>

                {/* Profile Menu Popover */}
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-[#e4ded2] bg-white p-3 shadow-lg z-50 text-xs">
                    <div className="border-b border-[#ede7db] pb-2">
                      <p className="font-bold text-[#1f2328]">{displayName || "Admin"}</p>
                      <p className="text-[11px] text-[#7c828d] truncate">{adminEmail}</p>
                    </div>
                    <div className="py-2 space-y-1">
                      <Link
                        href="/"
                        target="_blank"
                        className="block px-2 py-1.5 rounded-lg text-[#1f2328] hover:bg-[#f5f1e8]"
                      >
                        Öppna restaurangens hemsida
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("installningar");
                          setShowProfileMenu(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg text-[#1f2328] hover:bg-[#f5f1e8]"
                      >
                        Kontoinställningar
                      </button>
                    </div>
                    <div className="border-t border-[#ede7db] pt-2">
                      <AdminLogoutButton className="w-full justify-center" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Secondary Toolbar (< md): Dedicated row for Store Status & Date Range on small screens */}
          <div className="flex md:hidden items-center justify-between gap-2 border-t border-[#ede7db] bg-[#fcfbf8] px-3 py-2">
            {/* Mobile Store Status Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isActuallyOpen}
              disabled={!overview || orderingBusy}
              onClick={() => void handleOrderingToggle()}
              title={
                !overview
                  ? "Laddar status…"
                  : isActuallyOpen
                  ? `Öppet nu (${scheduleStatus?.label ?? ""}). Klicka för att stänga.`
                  : isManuallyClosed
                  ? "Stängt manuellt. Klicka för att öppna onlinebeställningar."
                  : `Stängt enligt schema (${scheduleStatus?.label ?? "utanför öppettider"}). Klicka för att öppna onlinebeställningar.`
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-[#e4ded2] bg-white px-2.5 py-1 text-xs font-semibold text-[#555a64] shadow-2xs hover:border-[#b88e4d] transition disabled:opacity-60 cursor-pointer"
            >
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${
                  isActuallyOpen
                    ? "bg-[#4caf73] animate-pulse"
                    : "bg-[#ce2b37]"
                }`}
              />
              <span className="whitespace-nowrap">
                {!overview
                  ? "Laddar…"
                  : isActuallyOpen
                  ? "Öppet nu"
                  : isManuallyClosed
                  ? "Stängt manuellt"
                  : "Stängt nu"}
              </span>
              <span
                className={`relative inline-block h-4.5 w-8 rounded-full transition ${
                  isActuallyOpen ? "bg-[#4caf73]" : "bg-[#ce2b37]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${
                    isActuallyOpen ? "left-[16px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            {/* Mobile Date Dropdown (or Tab Indicator if not on oversikt) */}
            {activeTab === "oversikt" ? (
              <div className="relative" ref={mobileDateDropdownRef}>
                <button
                  type="button"
                  onClick={() => setMobileDateDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e4ded2] bg-white px-2.5 py-1 text-xs font-semibold text-[#555a64] shadow-2xs hover:border-[#a78347] transition cursor-pointer"
                  aria-expanded={mobileDateDropdownOpen}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#8a7040]" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="whitespace-nowrap">{dateRangeLabel}</span>
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className={`block h-3.5 w-3.5 shrink-0 text-[#8c827a] transition-transform duration-200 ${mobileDateDropdownOpen ? "rotate-180" : ""}`}
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
                {mobileDateDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-[#e4ded2] bg-white p-2 shadow-lg z-50 text-xs">
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7c828d]">Välj tidsintervall</p>
                    {datePresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPeriod(preset.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition whitespace-nowrap cursor-pointer ${
                          overviewPeriod === preset.id ? "bg-[#f5efdf] text-[#8a7040] font-bold" : "text-[#1f2328] hover:bg-[#f5f1e8]"
                        }`}
                      >
                        <span className="text-xs font-semibold">{preset.label}</span>
                        <span className="text-[11px] text-[#7c828d]">{preset.range}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-[11px] font-medium text-[#8c827a]">
                {tabHeaderTitles[activeTab] ?? activeTab}
              </span>
            )}
          </div>
        </header>

        {/* Dashboard Content Container */}
        <main className="p-3 sm:p-4 lg:px-5 lg:py-3 space-y-3 pb-48 sm:pb-60">
          {activeTab === "oversikt" ? (
            <>
              {overviewError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">{overviewError} Visade värden är 0 tills serverdatan kan hämtas.</p>}
              {orderingError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">{orderingError}</p>}
              
              {/* RECONCILIATION DISCREPANCY WARNING BANNER */}
              {overview?.metrics.reconciliation?.status === "discrepancy_detected" && (
                <div
                  role="alert"
                  data-testid="reconciliation-warning"
                  className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 sm:p-4 text-amber-950 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl sm:text-2xl shrink-0" aria-hidden="true">⚠️</span>
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-amber-950">
                          Ekonomiska avvikelser upptäckta – siffrorna behöver stämmas av.
                        </h3>
                        <span className="text-[11px] font-bold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full">
                          {overview.metrics.reconciliation.discrepancies.length} {overview.metrics.reconciliation.discrepancies.length === 1 ? "avvikelse" : "avvikelser"}
                        </span>
                      </div>
                      <p className="text-xs text-amber-900/90 leading-relaxed">
                        Transaktionsavvikelser identifierades mellan beställningar och betalningsposter. Ej verifierade elektroniska belopp har exkluderats från brutto- och nettointäkter för att förhindra felaktig redovisning.
                      </p>
                      {/* Discrepancy details */}
                      <div className="mt-2.5 space-y-1.5 border-t border-amber-200/70 pt-2 text-[11px]">
                        {overview.metrics.reconciliation.discrepancies.map((d, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-amber-950/90">
                            <span className="font-mono font-semibold bg-amber-100/90 border border-amber-300/60 px-1.5 py-0.5 rounded text-[10.5px]">
                              Order {d.orderId}
                            </span>
                            <span className="font-semibold bg-amber-200/60 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider text-amber-900">
                              {d.type}
                            </span>
                            <span className="text-amber-900/80">{d.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* RECONCILIATION CLEAN NOTICE */}
              {overview?.metrics.reconciliation?.status === "clean" && (
                <div
                  data-testid="reconciliation-clean"
                  className="flex items-center gap-2 text-[11.5px] font-medium text-[#15803d] bg-[#f0fdf4] border border-[#dcfce7] px-3 py-1.5 rounded-xl shadow-2xs"
                >
                  <span className="inline-block size-2 rounded-full bg-[#15803d]" />
                  <span>Ekonomisk avstämning: OK – alla transaktioner i vald period är fullt verifierade mot betalningsposter.</span>
                </div>
              )}

              {/* TOP FINANCIAL & OPERATIONAL KPI STAT CARDS */}
              <section aria-label="Ekonomisk översikt" aria-busy={overviewLoading}>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5">
                  {[
                    {
                      id: "gross",
                      title: "Bruttoförsäljning",
                      testId: "kpi-gross-revenue",
                      value: overview ? money(overview.metrics.grossRevenueSek) : "—",
                      change: overview ? `${overview.metrics.paidOnlineOrders ?? overview.metrics.paidStripeOrders} betalda online` : "Laddar...",
                      changeColor: "text-[#15803d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                          <circle cx="12" cy="15" r="1.5" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      id: "refunds",
                      title: "Registrerade återbetalningar",
                      testId: "kpi-refunds",
                      value: overview ? money(overview.metrics.refundedSek) : "—",
                      valueColor: overview && overview.metrics.refundedSek > 0 ? "text-[#e04f44]" : "text-[#1f2328]",
                      change: overview ? (overview.metrics.refundBreakdown?.refundCount ? `${overview.metrics.refundBreakdown.refundCount} st registrerade` : "Inga återbetalningar") : "Laddar...",
                      changeColor: overview && overview.metrics.refundedSek > 0 ? "text-[#e04f44]" : "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 14 4 9 9 4" />
                          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                        </svg>
                      ),
                      iconBg: "bg-[#fef2f2] text-[#e04f44]",
                    },
                    {
                      id: "net",
                      title: "Nettoförsäljning",
                      testId: "kpi-net-revenue",
                      value: overview ? money(overview.metrics.netRevenueSek) : "—",
                      valueColor: overview ? (overview.metrics.netRevenueSek < 0 ? "text-[#e04f44]" : "text-[#15803d]") : "text-[#1f2328]",
                      change: "Brutto minus återbetalningar",
                      changeColor: "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                      ),
                      iconBg: "bg-[#f0fdf4] text-[#15803d]",
                    },
                    {
                      id: "orders",
                      title: overviewPeriod === "today" ? "Beställningar idag" : overviewPeriod === "yesterday" ? "Beställningar igår" : "Beställningar",
                      testId: "kpi-orders",
                      value: overview ? `${overview.metrics.orders} st` : "—",
                      change: overview ? `${overview.metrics.orders} genomförda` : "Laddar...",
                      changeColor: "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6" />
                          <circle cx="10" cy="21" r="1" />
                          <circle cx="18" cy="21" r="1" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      id: "active",
                      title: "Pågående ordrar",
                      testId: "kpi-active-orders",
                      value: overview ? `${overview.metrics.activeOrders} st` : "—",
                      change: overview && overview.metrics.activeOrders > 0 ? "Kräver åtgärd" : "Inga aktiva just nu",
                      changeColor: overview && overview.metrics.activeOrders > 0 ? "text-[#b45309]" : "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      id: "avg",
                      title: "Snitt ordervärde",
                      testId: "kpi-average-order",
                      value: overview ? (overview.metrics.averageOrderSek > 0 ? money(overview.metrics.averageOrderSek) : "0 kr") : "—",
                      change: "Per slutförd order",
                      changeColor: "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19V5M10 19V9M16 19V3M22 19v-7" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                  ].map((card) => (
                    <div
                      key={card.id}
                      data-testid={card.testId}
                      className="min-w-0 rounded-xl border border-[#e7e1d5] bg-white p-2.5 sm:p-3 shadow-xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10.5px] font-semibold text-[#7c828d] truncate">{card.title}</p>
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${card.iconBg}`}>
                          {card.icon}
                        </span>
                      </div>
                      <p className={`mt-1 text-base sm:text-lg font-bold tracking-tight truncate ${card.valueColor ?? "text-[#1f2328]"}`}>
                        {card.value}
                      </p>
                      <p className={`mt-0.5 text-[10px] sm:text-[10.5px] font-medium truncate ${card.changeColor}`}>
                        {card.change}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* MAIN CONTENT 2-COLUMN GRID (CHART ON LEFT, TOP DISHES + REVIEWS ON RIGHT) */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                {/* Left Column (8 cols): Chart + Orders Table */}
                <div className="flex flex-col gap-4 lg:col-span-8">
                  {/* Chart Card */}
                  <div className="flex min-w-0 flex-col rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs">
                  {/* Card Header: Title on left, Period selector buttons on right */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f2ede4] pb-3">
                    <div className="flex items-center gap-2.5">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#8a7040]" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="20" x2="18" y2="10" />
                        <line x1="12" y1="20" x2="12" y2="4" />
                        <line x1="6" y1="20" x2="6" y2="14" />
                      </svg>
                      <h2 className="font-serif text-base sm:text-lg font-bold text-[#1f2328]">Intäkter &amp; ordertrend</h2>
                    </div>

                    <div className="inline-flex items-center gap-1 rounded-lg bg-[#f5f2e9] p-0.5" role="group" aria-label="Välj datumperiod för översikten">
                      {(["today", "yesterday", "week", "month", "year"] as const).map((periodKey) => {
                        const isActive = overviewPeriod === periodKey;
                        return (
                          <button
                            key={periodKey}
                            type="button"
                            onClick={() => handleSelectPeriod(periodKey)}
                            aria-pressed={isActive}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                              isActive ? "bg-[#837147] text-white shadow-2xs" : "text-[#555a64] hover:bg-white/70"
                            }`}
                          >
                            {overviewPeriodLabels[periodKey]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* The Combo Chart */}
                  <div className="mt-3 w-full">
                    <OverviewChart
                      data={overview?.chart ?? []}
                      totalGross={overview?.metrics.grossRevenueSek ?? 0}
                      totalRefunds={overview?.metrics.refundedSek ?? 0}
                      totalNet={overview?.metrics.netRevenueSek ?? 0}
                      totalOrders={overview?.metrics.orders ?? 0}
                      definitions={overview?.definitions}
                    />
                  </div>
                </div>
                  {/* Orders Table Card (8 cols) */}
                  <div className="rounded-2xl border border-[#e7e1d5] bg-white shadow-xs overflow-hidden">

                    {/* Header & Filter Pills */}
                    <div className="p-4 sm:p-5 pb-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#d97706]" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <h2 className="text-sm font-bold text-[#1f2328]">Aktuella beställningar</h2>
                          <span className="text-[11px] text-[#7c828d] font-normal">(Visar de 10 senaste)</span>
                        </div>

                        {/* Filter buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                          {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda", "Avbrutna", "Återbetalda"] as const).map((filter) => {
                            return (
                              <button
                                key={filter}
                                type="button"
                                onClick={() => { setOrderPage(1); setOrderFilter(filter); }}
                                className={`rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                                  orderFilter === filter
                                    ? "bg-[#a78347] font-semibold text-white shadow-xs"
                                    : "text-[#555a64] hover:bg-[#f5f1e8] hover:text-[#1f2328]"
                                }`}
                              >
                                {filter}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActiveTab("bestallningar")}
                          className="text-xs text-[#8c827a] hover:text-[#1f2328] hover:underline cursor-pointer"
                        >
                          Visa alla beställningar →
                        </button>
                      </div>
                    </div>

                    {/* Orders Table */}
                    <div className="overflow-x-auto admin-scrollbar">
                      <table className="w-full min-w-[760px] text-left text-xs whitespace-nowrap border-collapse">
                        <thead>
                          <tr className="border-b border-[#ded5c2] bg-[#f0ebe0] text-[11px] font-bold text-[#4e483d] tracking-wide uppercase whitespace-nowrap">
                            <th className="py-3.5 pl-4 sm:pl-5 pr-3">Ordernr</th>
                            <th className="py-3.5 px-3">Kund</th>
                            <th className="py-3.5 px-3">Typ</th>
                            <th className="py-3.5 px-3">Artiklar</th>
                            <th className="py-3.5 px-3">Belopp</th>
                            <th className="py-3.5 px-3">Betalmetod</th>
                            <th className="py-3.5 px-3">Status</th>
                            <th className="py-3.5 pr-4 sm:pr-5 pl-3 text-right">Åtgärder</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ece5d8]">
                          {filteredOrders.slice(0, 10).length > 0 ? (
                            filteredOrders.slice(0, 10).map((ord) => {
                              const isDropdownOpen = activeActionMenu?.id === `ov-${ord.id}`;
                              return (
                              <tr
                                key={ord.id}
                                id={`order-row-overview-${ord.id}`}
                                onClick={() => void ordersApi.open(ord.id)}
                                onKeyDown={(event) => {
                                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                                    event.preventDefault();
                                    void ordersApi.open(ord.id);
                                  }
                                }}
                                tabIndex={0}
                                aria-label={`Visa beställning ${ord.orderNumber}`}
                                className={`border-b border-[#ece5d8] hover:bg-[#faf7f2] transition cursor-pointer ${
                                  isDropdownOpen ? "relative z-50" : "relative z-0"
                                } ${
                                  highlightedOrderId === ord.id
                                    ? "ring-2 ring-[#a78347] bg-[#fbf5e6] shadow-md scale-[1.008]"
                                    : ""
                                }`}
                              >
                                <td className="py-3.5 pl-4 sm:pl-5 pr-3">
                                  <p className="font-bold text-xs text-[#1f2328] hover:text-[#837147]">
                                    {ord.orderNumber}
                                  </p>
                                  <p className="text-[10.5px] text-[#8c827a]">
                                    {ord.dateTimeFormatted || ord.createdAt}
                                  </p>
                                </td>

                                <td className="py-3.5 px-3">
                                  <div className="flex items-center gap-1.5 font-semibold text-[#1f2328]">
                                    <span className="text-[#8c827a] text-xs">👤</span>
                                    <span>{ord.customer}</span>
                                  </div>
                                  {ord.phone && (
                                    <p className="text-[10.5px] text-[#8c827a] pl-4">{ord.phone}</p>
                                  )}
                                </td>

                                <td className="py-3.5 px-3 whitespace-nowrap">
                                  <OrderTypeBadge type={ord.type} />
                                </td>

                                <td className="py-3.5 px-3 max-w-[220px]">
                                  <OrderItemsPreviewCell ord={ord} />
                                </td>

                                <td className="py-3.5 px-3 font-bold text-xs text-[#1f2328]">
                                  {ord.total} kr
                                </td>

                                <td className="py-3.5 px-3">
                                  <PaymentMethodBadge method={ord.paymentMethod} />
                                  <div className="mt-0.5">
                                    {ord.paymentStatus === "Återbetald" ? (
                                      <span className="inline-block text-[10.5px] font-semibold text-[#6b7280]">
                                        Återbetald
                                      </span>
                                    ) : ord.paymentStatus === "Betald" ? (
                                      <span className="inline-block text-[10.5px] font-semibold text-[#15803d]">
                                        Betald
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[10.5px] font-semibold text-[#b45309]">
                                        Väntar på betalning
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-3">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ord.statusBadge.bgColor} ${ord.statusBadge.textColor}`}
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${ord.statusBadge.dotColor}`} />
                                    {ord.statusBadge.label}
                                  </span>
                                </td>

                                <td className={`py-3.5 pr-4 sm:pr-5 pl-3 text-right ${isDropdownOpen ? "relative z-50" : ""}`}>
                                  <div className="relative inline-flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                    {ord.primaryAction && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (ord.primaryAction?.label === "Visa") {
                                            void ordersApi.open(ord.id);
                                          } else {
                                            handleAdvanceOrder(ord.id);
                                          }
                                        }}
                                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-2xs ${
                                          ord.primaryAction.variant === "gold"
                                            ? "bg-[#837147] text-white hover:bg-[#72623c]"
                                            : ord.primaryAction.variant === "emerald"
                                            ? "bg-[#16a34a] text-white hover:bg-[#15803d]"
                                            : "border border-[#e4ded2] bg-white text-[#1f2328] hover:bg-[#f5f1e8]"
                                        }`}
                                      >
                                        {ord.primaryAction.label === "Bekräfta mottagning" && "✓ "}
                                        {ord.primaryAction.label === "Börja tillaga" && "👨‍🍳 "}
                                        {ord.primaryAction.label}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (activeActionMenu?.id === `ov-${ord.id}`) {
                                          setActiveActionMenu(null);
                                        } else {
                                          const rect = e.currentTarget.getBoundingClientRect();
                                          const dropdownHeight = 125;
                                          const fitsBelow = rect.bottom + dropdownHeight + 10 < window.innerHeight;
                                          setActiveActionMenu({
                                            id: `ov-${ord.id}`,
                                            order: ord,
                                            top: fitsBelow ? rect.bottom + 6 : Math.max(10, rect.top - dropdownHeight - 6),
                                            right: Math.max(12, window.innerWidth - rect.right),
                                          });
                                        }
                                      }}
                                      className="rounded-xl border border-[#e4ded2] bg-white p-1.5 text-[#7c828d] hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer shadow-2xs"
                                      title="Fler åtgärder"
                                    >
                                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                      </svg>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                            })
                          ) : (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-xs text-[#7c828d]">
                                Inga beställningar att visa med valt filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
              </div>

              {/* Right Column: Stacked Cards (Mest beställt + Betyg & Omdömen + Meny & Produkter) */}
              <div className="flex flex-col gap-3.5 lg:col-span-4">
                  {/* Card 1: Mest beställt */}
                  <div className="flex flex-col rounded-2xl border border-[#e7e1d5] bg-white p-3.5 sm:p-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#f2ede4] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🏆</span>
                        <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">Mest beställt</h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("meny")}
                        className="text-xs text-[#8c827a] hover:text-[#1f2328] hover:underline"
                      >
                        Gå till menyn
                      </button>
                    </div>
                    {overview?.bestSellers && overview.bestSellers.length > 0 ? (
                      (() => {
                        const totalCount = overview.bestSellers.reduce((sum, item) => sum + item.quantity, 0);
                        return (
                          <ol className="mt-2.5 space-y-2">
                            {overview.bestSellers.map((dish, idx) => {
                              const percent = totalCount > 0 ? Math.round((dish.quantity / totalCount) * 100) : 0;
                              return (
                                <li key={dish.name} className="flex items-center gap-2.5">
                                  <span className="w-3.5 text-xs font-bold text-[#8c827a]">{idx + 1}</span>
                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f5efdf] text-sm border border-[#ede7db]">
                                    🍕
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-bold text-[#1f2328]">{dish.name}</p>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-xs font-bold text-[#1f2328]">{dish.quantity} st</span>
                                    <span className="text-[11px] text-[#7c828d]">{percent}%</span>
                                  </div>
                                </li>
                              );
                            })}
                          </ol>
                        );
                      })()
                    ) : (
                      <div className="py-4 text-center">
                        <span className="block text-xl mb-1 opacity-60">🍽️</span>
                        <p className="text-xs font-bold text-[#1f2328]">Inga beställningar registrerade</p>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] text-[#7c828d]">
                          Mest beställda rätter visas här så snart ordrar registreras.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Betyg & Omdömen */}
                  <div className="flex flex-col rounded-2xl border border-[#e7e1d5] bg-white p-3.5 sm:p-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#f2ede4] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#8a7040]">★</span>
                        <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">Betyg &amp; Omdömen</h2>
                      </div>
                      <span className="rounded-full bg-[#f5f1e8] px-2 py-0.5 text-[10px] font-semibold text-[#7c828d]">
                        Ej ansluten
                      </span>
                    </div>

                    <div className="py-3 text-center">
                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-[#f5efdf] text-[#8a7040] mb-1.5">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </div>
                      <p className="text-xs font-bold text-[#1f2328]">Inga omdömen registrerade</p>
                      <p className="mt-0.5 text-[10px] sm:text-[11px] text-[#7c828d] max-w-xs mx-auto leading-relaxed">
                        Google Recensioner är inte anslutet till administrationspanelen ännu. Inga fabricerade omdömen visas.
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Meny & Produkter - Redesigned Executive Overview */}
                  <div className="flex flex-col rounded-2xl border border-[#e7e1d5] bg-white p-4 shadow-xs space-y-3.5">
                    {/* Card Header */}
                    <div className="flex items-center justify-between border-b border-[#f2ede4] pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5efdf] text-base border border-[#ede7db]">
                          🍕
                        </span>
                        <div>
                          <h2 className="font-serif text-sm sm:text-base font-bold text-[#1f2328]">
                            Meny &amp; Produkter
                          </h2>
                          <p className="text-[10px] text-[#7c828d]">
                            Sortimentsöversikt &amp; status
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab("meny")}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#837147] hover:text-[#5e5132] transition cursor-pointer"
                      >
                        <span>Hantera</span>
                        <span>→</span>
                      </button>
                    </div>

                    {/* Quick KPI stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-[#ede7db] bg-[#faf7f0] p-2 text-center">
                        <p className="text-base font-bold text-[#1f2328]">119</p>
                        <p className="text-[10px] font-medium text-[#7c828d]">Artiklar</p>
                      </div>
                      <div className="rounded-xl border border-[#ede7db] bg-[#faf7f0] p-2 text-center">
                        <p className="text-base font-bold text-[#1f2328]">9</p>
                        <p className="text-[10px] font-medium text-[#7c828d]">Kategorier</p>
                      </div>
                      <div className="rounded-xl border border-[#ede7db] bg-[#faf7f0] p-2 text-center">
                        <div className="flex items-center justify-center gap-1 text-xs font-bold text-[#15803d]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a] inline-block" />
                          <span>Aktiv</span>
                        </div>
                        <p className="text-[10px] font-medium text-[#7c828d]">Status</p>
                      </div>
                    </div>

                    {/* Category Breakdown List */}
                    <div className="space-y-1 pt-0.5">
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8c827a] mb-1">
                        Kategorier &amp; Rätter
                      </p>
                      <div className="space-y-1 text-xs">
                        {[
                          { name: "Pizzor (Klassiska & Special)", count: 67, icon: "🍕" },
                          { name: "Kebab, Gyros & Rullar", count: 11, icon: "🥙" },
                          { name: "À la carte & Kötträtter", count: 11, icon: "🥩" },
                          { name: "Sallader & Förrätter", count: 7, icon: "🥗" },
                          { name: "Drycker & Tillbehör", count: 16, icon: "🥤" },
                        ].map((cat) => (
                          <button
                            key={cat.name}
                            type="button"
                            onClick={() => setActiveTab("meny")}
                            className="w-full flex items-center justify-between rounded-xl px-2.5 py-1.5 hover:bg-[#fbf9f4] border border-transparent hover:border-[#ede7db] transition text-left cursor-pointer group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm shrink-0">{cat.icon}</span>
                              <span className="font-medium text-[#1f2328] group-hover:text-[#837147] truncate text-xs">
                                {cat.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[#7c828d] shrink-0 font-medium text-[11px]">
                              <span>{cat.count} st</span>
                              <span className="text-[#a78347] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="pt-2 border-t border-[#f2ede4] flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveTab("meny")}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#837147] py-2 px-3 text-xs font-semibold text-white hover:bg-[#72623c] transition shadow-2xs cursor-pointer"
                      >
                        <span>🍕</span>
                        <span>Öppna menyhantering</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("tillagg")}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#ded5c2] bg-white py-1.5 px-3 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition cursor-pointer"
                      >
                        <span>🧀</span>
                        <span>Hantera tillägg &amp; såser</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : activeTab === "bestallningar" ? (
            /* ========================================================================= */
            /* TAB: BESTÄLLNINGAR FULL VIEW                                              */
            /* ========================================================================= */
            <div className="space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8e2d5] pb-4">
                <div>
                  <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#1f2328]">Alla beställningar</h1>
                  <p className="mt-1 text-xs text-[#7c828d]">
                    Hantera, sök och följ kundordrar och specifikationer i realtid
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("oversikt")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e4ded2] bg-white px-3.5 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#f5f1e8] transition cursor-pointer self-start sm:self-auto"
                >
                  <span>← Tillbaka till översikt</span>
                </button>
              </div>

              {/* Search Bar & Status Filter Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#8c827a]">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="search"
                    maxLength={80}
                    value={orderSearchQuery}
                    onChange={(e) => {
                      setOrderSearchQuery(e.target.value);
                      setOrderPage(1);
                    }}
                    placeholder="Sök ordernummer, kund eller telefon..."
                    className="w-full rounded-xl border border-[#e4ded2] bg-white pl-9 pr-8 py-2 text-xs text-[#1f2328] placeholder-[#8c827a] focus:border-[#b88e4d] focus:outline-none shadow-2xs transition"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery("");
                        setOrderPage(1);
                      }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8c827a] hover:text-[#1f2328] text-xs font-bold cursor-pointer"
                      title="Rensa sökning"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white border border-[#e4ded2] p-1 text-xs">
                  {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda", "Avbrutna", "Återbetalda"] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => { setOrderPage(1); setOrderFilter(filter); }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition cursor-pointer ${
                        orderFilter === filter
                          ? "bg-[#a78347] font-semibold text-white shadow-2xs"
                          : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
                      }`}
                    >
                      <span>{filter}</span>
                    </button>
                  ))}
                </div>
              </div>

              {ordersApi.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ordersApi.error}</p>}
              {ordersApi.loading && <p role="status" className="text-sm text-[#7c828d]">Laddar beställningar…</p>}

              {/* Table Container */}
              <div className="flex flex-col rounded-2xl border border-[#e7e1d5] bg-white shadow-xs overflow-hidden">
                {ordersApi.error || ordersApi.loading ? null : filteredOrders.length === 0 ? (
                  <div className="py-12 p-5 text-center space-y-3">
                    <p className="text-3xl">🔍</p>
                    <p className="text-sm font-bold text-[#1f2328]">Inga beställningar hittades</p>
                    <p className="text-xs text-[#7c828d]">
                      Inga ordrar matchade sökningen &quot;{orderSearchQuery}&quot; eller valt filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery("");
                        setOrderFilter("Alla");
                      }}
                      className="rounded-xl border border-[#e4ded2] bg-[#fdfbf7] px-3.5 py-1.5 text-xs font-semibold text-[#1f2328] hover:bg-[#f5f1e8] transition cursor-pointer"
                    >
                      Återställ sökning &amp; filter
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto admin-scrollbar">
                      <table className="w-full min-w-[780px] text-left text-xs whitespace-nowrap border-collapse">
                        <thead>
                          <tr className="border-b border-[#ded5c2] bg-[#f0ebe0] text-[11px] font-bold text-[#4e483d] tracking-wide uppercase whitespace-nowrap">
                            <th className="py-3.5 pl-4 sm:pl-5 pr-3">Ordernr</th>
                            <th className="py-3.5 px-3">Kund</th>
                            <th className="py-3.5 px-3">Typ</th>
                            <th className="py-3.5 px-3">Artiklar</th>
                            <th className="py-3.5 px-3">Belopp</th>
                            <th className="py-3.5 px-3">Betalmetod</th>
                            <th className="py-3.5 px-3">Status</th>
                            <th className="py-3.5 pr-4 sm:pr-5 pl-3 text-right">Åtgärder</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ece5d8]">
                          {filteredOrders.map((ord) => {
                            const isDropdownOpen = activeActionMenu?.id === ord.id;
                            return (
                            <tr
                              key={ord.id}
                              id={`order-row-${ord.id}`}
                              onClick={() => void ordersApi.open(ord.id)}
                              onKeyDown={(event) => {
                                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                                  event.preventDefault();
                                  void ordersApi.open(ord.id);
                                }
                              }}
                              tabIndex={0}
                              aria-label={`Visa beställning ${ord.orderNumber}`}
                              className={`border-b border-[#ece5d8] hover:bg-[#faf7f2] transition cursor-pointer ${
                                isDropdownOpen ? "relative z-50" : "relative z-0"
                              } ${
                                highlightedOrderId === ord.id
                                  ? "ring-2 ring-[#a78347] bg-[#fbf5e6] shadow-md scale-[1.008]"
                                  : ""
                              }`}
                            >
                              {/* Ordernr + Date underneath */}
                              <td className="py-3.5 pl-4 sm:pl-5 pr-3">
                                <p className="font-bold text-xs text-[#1f2328] hover:text-[#837147]">
                                  {ord.orderNumber}
                                </p>
                                <p className="text-[10.5px] text-[#8c827a]">
                                  {ord.dateTimeFormatted || ord.createdAt}
                                </p>
                              </td>

                              {/* Kund: icon + name + phone */}
                              <td className="py-3.5 px-3">
                                <div className="flex items-center gap-1.5 font-semibold text-[#1f2328]">
                                  <span className="text-[#8c827a] text-xs">👤</span>
                                  <span>{ord.customer}</span>
                                </div>
                                {ord.phone && (
                                  <p className="text-[10.5px] text-[#8c827a] pl-4">{ord.phone}</p>
                                )}
                              </td>

                              {/* Typ */}
                              <td className="py-3.5 px-3 whitespace-nowrap">
                                <OrderTypeBadge type={ord.type} />
                              </td>

                              {/* Artiklar & Specifikationer */}
                              <td className="py-3.5 px-3 max-w-[220px]">
                                <OrderItemsPreviewCell ord={ord} />
                              </td>

                              {/* Belopp */}
                              <td className="py-3.5 px-3 font-bold text-xs text-[#1f2328]">
                                {ord.total} kr
                              </td>

                              {/* Betalmetod + payment status */}
                              <td className="py-3.5 px-3">
                                <PaymentMethodBadge method={ord.paymentMethod} />
                                <div className="mt-0.5">
                                  {ord.paymentStatus === "Återbetald" ? (
                                    <span className="inline-block text-[10.5px] font-semibold text-[#6b7280]">
                                      Återbetald
                                    </span>
                                  ) : ord.paymentStatus === "Betald" ? (
                                    <span className="inline-block text-[10.5px] font-semibold text-[#15803d]">
                                      Betald
                                    </span>
                                  ) : (
                                    <span className="inline-block text-[10.5px] font-semibold text-[#b45309]">
                                      Väntar på betalning
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-3.5 px-3">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ord.statusBadge.bgColor} ${ord.statusBadge.textColor}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${ord.statusBadge.dotColor}`} />
                                  {ord.statusBadge.label}
                                </span>
                              </td>

                              {/* Åtgärder with Primary Button + 3 dots Dropdown */}
                              <td className={`py-3.5 pr-4 sm:pr-5 pl-3 text-right ${isDropdownOpen ? "relative z-50" : ""}`}>
                                <div className="relative inline-flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  {ord.primaryAction && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (ord.primaryAction?.label === "Visa") {
                                          void ordersApi.open(ord.id);
                                        } else {
                                          handleAdvanceOrder(ord.id);
                                        }
                                      }}
                                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-2xs ${
                                        ord.primaryAction.variant === "gold"
                                          ? "bg-[#837147] text-white hover:bg-[#72623c]"
                                          : ord.primaryAction.variant === "emerald"
                                          ? "bg-[#16a34a] text-white hover:bg-[#15803d]"
                                          : "border border-[#e4ded2] bg-white text-[#1f2328] hover:bg-[#f5f1e8]"
                                      }`}
                                    >
                                      {ord.primaryAction.label === "Bekräfta mottagning" && "✓ "}
                                      {ord.primaryAction.label === "Börja tillaga" && "👨‍🍳 "}
                                      {ord.primaryAction.label}
                                    </button>
                                  )}

                                  {/* Three Dots Button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (activeActionMenu?.id === ord.id) {
                                        setActiveActionMenu(null);
                                      } else {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const dropdownHeight = 125;
                                        const fitsBelow = rect.bottom + dropdownHeight + 10 < window.innerHeight;
                                        setActiveActionMenu({
                                          id: ord.id,
                                          order: ord,
                                          top: fitsBelow ? rect.bottom + 6 : Math.max(10, rect.top - dropdownHeight - 6),
                                          right: Math.max(12, window.innerWidth - rect.right),
                                        });
                                      }
                                    }}
                                    className="rounded-xl border border-[#e4ded2] bg-white p-1.5 text-[#7c828d] hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer shadow-2xs"
                                    title="Fler åtgärder"
                                  >
                                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                      <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {!!ordersApi.list?.total && (
                      <div className="relative z-0 flex items-center justify-between border-t border-[#f2ede4] bg-[#fbf9f4] px-4 py-3 text-xs text-[#7c828d] rounded-b-2xl">
                        <span>
                          {ordersApi.list.total} beställningar · sida {orderPage} av {Math.max(1, Math.ceil(ordersApi.list.total / ordersApi.list.limit))}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={orderPage <= 1}
                            onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                            className="rounded-lg border border-[#e4ded2] bg-white px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-[#faf7f2] cursor-pointer"
                          >
                            Föregående
                          </button>
                          <button
                            type="button"
                            disabled={orderPage * ordersApi.list.limit >= ordersApi.list.total}
                            onClick={() => setOrderPage((p) => p + 1)}
                            className="rounded-lg border border-[#e4ded2] bg-white px-3 py-1.5 font-medium disabled:opacity-40 hover:bg-[#faf7f2] cursor-pointer"
                          >
                            Nästa
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : activeTab === "meny" ? (
            <AdminProductsTab />
          ) : activeTab === "installningar" ? (
            /* ========================================================================= */
            /* TAB: INSTÄLLNINGAR FULL VIEW                                              */
            /* ========================================================================= */
            <AdminSettingsTab adminEmail={adminEmail} />
          ) : activeTab === "fakturor" ? (
            <AdminInvoicesTab
              orders={ordersApi.list?.orders ?? []}
              onOpenOrder={(id) => void ordersApi.open(id)}
            />
          ) : activeTab === "analyser" ? (
            <AdminAnalyticsTab
              overview={overview}
              activePeriod={overviewPeriod}
              onPeriodChange={(p) => handleSelectPeriod(p)}
            />
          ) : activeTab === "oppettider" ? (
            <AdminHoursTab />
          ) : activeTab === "kategorier" ? (
            <AdminCategoriesTab />
          ) : activeTab === "tillagg" ? (
            <AdminModifiersTab />
          ) : (
            /* Fallback generic view for other tabs */
            <div className="rounded-2xl border border-[#e7e1d5] bg-white p-8 shadow-xs text-center space-y-4">
              <h2 className="font-serif text-2xl font-bold text-[#1f2328] capitalize">
                {activeTab}
              </h2>
              <p className="text-xs text-[#7c828d]">
                Kommer senare. Den här delen är ännu inte ansluten till restaurangens data.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab("oversikt")}
                className="rounded-xl bg-[#a78347] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#96743b]"
              >
                Tillbaka till översikten
              </button>
            </div>
          )}
        </main>

        {/* Admin Footer */}
        <footer className="mt-auto border-t border-[#e8e2d5] bg-[#f9f8f4] py-3.5 px-6 text-center text-xs text-[#8c827a]">
          © {new Date().getFullYear()} Falken Restaurang &amp; Pizzeria · Administrationspanel
        </footer>
      </div>

      {ordersApi.selected && (
        <AdminOrderDialog
          order={ordersApi.selected}
          busy={ordersApi.busy}
          onClose={() => ordersApi.setSelected(null)}
          onTransition={(to) => void ordersApi.transition(ordersApi.selected!.publicId, ordersApi.selected!.fulfillmentStatus, to)}
          onCollectPayment={(method) => void ordersApi.collectPayment(ordersApi.selected!.publicId, method)}
          onCancelOrder={(category, note) => ordersApi.cancelOrder(ordersApi.selected!.publicId, category, note)}
          onRecordRefund={(data) => ordersApi.recordRefund(ordersApi.selected!.publicId, data)}
          onViewReceipt={(ord) => {
            setViewingReceipt({
              orderNumber: ord.publicId,
              customerName: ord.customerName,
              phone: ord.phone,
              date: ord.createdAt ? new Date(ord.createdAt).toLocaleDateString("sv-SE") : new Date().toLocaleDateString("sv-SE"),
              paymentMethod: ord.paymentMethod === "card" ? "Stripe · kort" : ord.paymentMethod === "swish" ? "Swish" : "Betala på plats",
              paymentStatus: ord.paymentStatus === "refunded" ? "Återbetald" : ord.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
              totalSek: ord.totalSek,
              items: ord.items.map((it) => ({
                description: it.name,
                quantity: it.quantity,
                unitPriceSek: it.basePriceSek || Math.round(it.lineTotalSek / Math.max(1, it.quantity)),
              })),
              seller: ord.sellerSnapshot ? {
                name: ord.sellerSnapshot.name,
                legalName: ord.sellerSnapshot.legalName,
                street: ord.sellerSnapshot.street,
                city: ord.sellerSnapshot.city,
                phone: ord.sellerSnapshot.phone,
              } : undefined,
            });
          }}
        />
      )}

      {activeActionMenu && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999]"
          onClick={() => setActiveActionMenu(null)}
        >
          <div
            style={{
              position: "fixed",
              top: activeActionMenu.top,
              right: activeActionMenu.right,
            }}
            className="w-52 rounded-2xl border border-[#e4ded2] bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1: Visa beställning */}
            <button
              type="button"
              onClick={() => {
                const ord = activeActionMenu.order;
                setActiveActionMenu(null);
                void ordersApi.open(ord.id);
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#fbf9f4] transition cursor-pointer"
            >
              <span className="text-sm">👁️</span>
              <span>Visa beställning</span>
            </button>

            {/* 2: Visa kvitto */}
            <button
              type="button"
              onClick={() => {
                const ord = activeActionMenu.order;
                setActiveActionMenu(null);
                setViewingReceipt(getReceiptInputFromOrder(ord));
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#fbf9f4] transition cursor-pointer"
            >
              <span className="text-sm">📄</span>
              <span>Visa kvitto</span>
            </button>

            {/* 3: Avbryt / Återbetala beställning */}
            {activeActionMenu.order.rawStatus !== "CANCELLED" && activeActionMenu.order.paymentStatus !== "Återbetald" && (
              <button
                type="button"
                onClick={() => {
                  const ord = activeActionMenu.order;
                  setActiveActionMenu(null);
                  void ordersApi.open(ord.id);
                }}
                className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer border-t border-[#f2ede4] mt-1 pt-1.5"
              >
                <span className="text-sm">🚫</span>
                <span>{activeActionMenu.order.paymentStatus === "Betald" ? "Återbetala / Hantera" : "Avbryt beställning"}</span>
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {viewingReceipt && (
        <AdminReceiptModal
          receipt={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
}
