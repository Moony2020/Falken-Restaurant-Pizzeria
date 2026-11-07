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
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { AdminHoursTab } from "@/components/admin/admin-hours-tab";
import { AdminNotificationsDropdown } from "@/components/admin/admin-notifications-dropdown";
import { AdminInvoicesTab, PaymentMethodBadge, OrderTypeBadge } from "@/components/admin/admin-invoices-tab";
import { AdminAnalyticsTab } from "@/components/admin/admin-analytics-tab";
import { AdminProductsTab } from "@/components/admin/admin-products-tab";
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
type OrderStatus = "Ny" | "Mottagen" | "Tillagas" | "Förbereds" | "Redo" | "Klar" | "Serverad" | "Klar för avhämtning" | "Uthämtad" | "Slutförd";

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
};

type OverviewPeriod = "today" | "yesterday" | "week" | "month" | "year";
export type OverviewData = {
  period: OverviewPeriod;
  range: { from: string; to: string; timeZone: string };
  metrics: {
    revenueSek: number;
    orders: number;
    activeOrders: number;
    paidStripeOrders: number;
    unpaidOrders: number;
    unpaidSek: number;
    averageOrderSek: number;
    reviewCount: number;
    averageRating: number | null;
  };
  chart: { key: string; label: string; orders: number; revenueSek: number }[];
  bestSellers: { name: string; quantity: number }[];
  settings: {
    onlineOrderingEnabled: boolean;
    manualOverride?: "open" | "closed" | null;
  };
};

const overviewPeriodLabels: Record<OverviewPeriod, string> = {
  today: "Idag",
  yesterday: "Igår",
  week: "Vecka",
  month: "Månad",
  year: "År",
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
  totalRevenue?: number;
  totalOrders?: number;
};

function OverviewChart({ data, totalRevenue = 0, totalOrders = 0 }: OverviewChartProps) {
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

  // Format data: restaurant business hours (11:00 to 22:00)
  const isHourly = chartData.some((p) => p.label.includes(":"));
  let displayPoints: { key: string; label: string; revenueSek: number; orders: number }[] = [];

  if (isHourly) {
    const hours = [
      "11:00", "12:00", "13:00", "14:00", "15:00", "16:00",
      "17:00", "18:00", "19:00", "20:00", "21:00", "22:00"
    ];
    const map = new Map(chartData.map((p) => [p.label, p]));
    displayPoints = hours.map((h) => map.get(h) || { key: h, label: h, revenueSek: 0, orders: 0 });
  } else {
    displayPoints = chartData.length > 0 ? chartData : [{ key: "1", label: "Idag", revenueSek: 0, orders: 0 }];
  }

  // Fallback: if all zero but totalRevenue > 0, set at 14:00 (index 3) without mutating
  const hasDirectActivity = displayPoints.some((p) => p.revenueSek > 0 || p.orders > 0);
  const targetIdx = isHourly ? 3 : Math.floor(displayPoints.length / 2);
  const finalPoints = (!hasDirectActivity && totalRevenue > 0)
    ? displayPoints.map((p, idx) => (idx === targetIdx ? { ...p, revenueSek: totalRevenue, orders: totalOrders } : p))
    : displayPoints;

  // Dimensions
  const width = containerWidth > 0 ? containerWidth : 800;
  const height = 265;
  const left = 48;
  const right = 36;
  const top = 30;
  const bottom = 32;
  const plotWidth = Math.max(10, width - left - right);
  const plotHeight = height - top - bottom;
  const baseline = top + plotHeight;

  // Scales matching reference: Left Y (Revenue with 50 kr ticks), Right Y (Orders 0..6)
  const rawMaxRev = Math.max(totalRevenue, ...finalPoints.map((p) => p.revenueSek));
  const maxRevenueScale = rawMaxRev <= 0 ? 300 : Math.max(300, Math.ceil(rawMaxRev / 50) * 50);
  const revenueTicks = [300, 250, 200, 150, 100, 50, 0].map((v) => Math.round((v / 300) * maxRevenueScale));

  const maxOrdersScale = 6;
  const ordersTicks = [6, 5, 4, 3, 2, 1, 0];

  const n = finalPoints.length;
  const step = n > 1 ? plotWidth / (n - 1) : plotWidth;

  // Calculate points truthfully from actual data (no ghost curves on 0-activity hours!)
  const revPoints = finalPoints.map((point, index) => {
    const x = left + index * step;
    const ratio = maxRevenueScale > 0 ? Math.min(1, Math.max(0, point.revenueSek / maxRevenueScale)) : 0;
    const y = baseline - ratio * plotHeight;
    return { x, y, raw: point };
  });

  const orderPoints = finalPoints.map((point, index) => {
    const x = left + index * step;
    const ratio = maxOrdersScale > 0 ? Math.min(1, Math.max(0, point.orders / maxOrdersScale)) : 0;
    const y = baseline - ratio * plotHeight;
    return { x, y, raw: point };
  });

  const revSpline = getMonotoneSpline(revPoints, baseline);
  const orderSpline = getMonotoneSpline(orderPoints, baseline);

  // Find peak point for default tooltip
  let peakIdx = 0;
  let maxV = -1;
  finalPoints.forEach((p, idx) => {
    if (p.revenueSek > maxV) {
      maxV = p.revenueSek;
      peakIdx = idx;
    }
  });
  if (maxV <= 0 && isHourly) peakIdx = 3; // default 14:00 (index 3 in 11:00..22:00)

  const activeIdx = hoveredIdx !== null ? hoveredIdx : peakIdx;
  const activePoint = revPoints[activeIdx] || revPoints[0];
  const activeOrderPoint = orderPoints[activeIdx] || orderPoints[0];

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* Top Section matching user reference: Two Metric Cards on left, Legends on right */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
        {/* Left: Two Metric Cards */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Card 1: Total intäkt */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#efe9dc] bg-[#fbf9f4] px-4 py-2 shadow-2xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4ebd9] text-base">
              🪙
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7c828d] leading-tight">Total intäkt</p>
              <p className="text-base sm:text-lg font-bold text-[#1f2328] leading-tight">
                {money(totalRevenue)}
              </p>
            </div>
          </div>

          {/* Card 2: Totalt antal beställningar */}
          <div className="flex items-center gap-3 rounded-2xl border border-[#efe9dc] bg-[#fbf9f4] px-4 py-2 shadow-2xs">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4ebd9] text-base">
              🛒
            </div>
            <div>
              <p className="text-[11px] font-medium text-[#7c828d] leading-tight">Totalt antal beställningar</p>
              <p className="text-base sm:text-lg font-bold text-[#1f2328] leading-tight">
                {totalOrders} st
              </p>
            </div>
          </div>
        </div>

        {/* Right: Legends matching user reference */}
        <div className="flex items-center gap-5 text-xs text-[#555a64]">
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
            {/* Soft, light gradient area fill matching reference images 1 & 3 */}
            <linearGradient id="refRevenueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c99a45" stopOpacity="0.28" />
              <stop offset="60%" stopColor="#c99a45" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#c99a45" stopOpacity="0.0" />
            </linearGradient>
            <filter id="peakGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#c99a45" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* 7 Horizontal Dashed Gridlines & Dual Left/Right Ticks (Both aligned exactly!) */}
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
                  fontSize="11"
                  className="fill-[#7c828d] font-sans font-medium"
                >
                  {revTick} kr
                </text>
                {/* Right Tick: orders */}
                <text
                  x={width - right + 8}
                  y={y + 3.5}
                  textAnchor="start"
                  fontSize="11"
                  className="fill-[#7c828d] font-sans font-medium"
                >
                  {ordTick}
                </text>
              </g>
            );
          })}

          {/* Golden Area Fill Under Revenue Curve */}
          {revSpline.areaPath && (
            <path d={revSpline.areaPath} fill="url(#refRevenueGrad)" />
          )}

          {/* Golden Revenue Curve (Intäkter) */}
          {revSpline.linePath && (
            <path
              d={revSpline.linePath}
              fill="none"
              stroke="#c99a45"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Brown Order Trend Curve (Antal beställningar) */}
          {orderSpline.linePath && (
            <path
              d={orderSpline.linePath}
              fill="none"
              stroke="#5a4d36"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Vertical Dashed Guide Line matching reference images */}
          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                y1={top}
                x2={activePoint.x}
                y2={baseline}
                stroke="#c99a45"
                strokeDasharray="4 4"
                strokeWidth="1.5"
                strokeOpacity="0.6"
              />
              {/* Little accent triangle marker at baseline */}
              <polygon
                points={`${activePoint.x - 3.5},${baseline} ${activePoint.x + 3.5},${baseline} ${activePoint.x},${baseline - 5}`}
                fill="#837147"
              />
            </g>
          )}

          {/* Clean Ribbon: Only ONE Glowing Dot on Active/Hovered Point (Golden Revenue Curve) */}
          {activePoint && (
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="5.5"
              fill="#ffffff"
              stroke="#c99a45"
              strokeWidth="3"
              filter="url(#peakGlow)"
              className="transition-all duration-150"
            />
          )}

          {/* Only ONE Glowing Dot on Active/Hovered Point (Brown Order Curve - if orders > 0) */}
          {activeOrderPoint && activePoint.raw.orders > 0 && (
            <circle
              cx={activeOrderPoint.x}
              cy={activeOrderPoint.y}
              r="4.5"
              fill="#ffffff"
              stroke="#5a4d36"
              strokeWidth="2.5"
              className="transition-all duration-150"
            />
          )}

          {/* X Axis Time Labels */}
          {finalPoints.map((point, index) => (
            <text
              key={point.key}
              x={left + index * step}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              className={`transition-colors font-medium ${
                index === activeIdx ? "fill-[#1f2328] font-bold" : "fill-[#7c828d]"
              }`}
            >
              {point.label}
            </text>
          ))}

          {/* Invisible Hover Rects */}
          {finalPoints.map((point, index) => {
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

        {/* Floating Light Glassy Tooltip (Lighter ivory frosted glass) */}
        {activePoint && (
          <div
            className="pointer-events-none absolute z-30 -translate-x-1/2 rounded-2xl border border-[#e2dac8] bg-[#f8f5ee]/95 px-3.5 py-2 shadow-lg shadow-stone-900/8 backdrop-blur-md text-left transition-all duration-150 ring-1 ring-black/5"
            style={{
              left: `${activePoint.x}px`,
              top: `${Math.max(2, activePoint.y - 66)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#ede5d3] pb-1 mb-1">
              <span className="text-[11px] font-bold tracking-wide uppercase text-[#8c827a]">
                {activePoint.raw.label}
              </span>
              <span className="text-[10px] font-semibold text-[#837147] bg-[#f0e8d6] px-1.5 py-0.5 rounded-md">
                {activePoint.raw.orders} {activePoint.raw.orders === 1 ? "order" : "ordrar"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1f2328] whitespace-nowrap">
              <span className="inline-block size-2 rounded-full bg-[#c99a45] ring-2 ring-[#c99a45]/20" />
              <span className="font-serif text-sm font-bold text-[#1f2328]">
                {activePoint.raw.revenueSek > 0 ? `${money(activePoint.raw.revenueSek)}` : "0 kr"}
              </span>
              <span className="text-[#8c827a] font-normal text-[11px]">
                ({activePoint.raw.orders} {activePoint.raw.orders === 1 ? "beställning" : "beställningar"})
              </span>
            </div>
            {/* Tooltip downward caret */}
            <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-6 border-t-[#f8f5ee] filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]" />
          </div>
        )}
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
    paymentStatus: order.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
    status: styles[order.fulfillmentStatus]?.label as OrderStatus ?? "Ny",
    rawStatus: order.fulfillmentStatus,
    statusBadge: styles[order.fulfillmentStatus] ?? styles.CONFIRMED,
    primaryAction: actions[order.fulfillmentStatus],
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
  const [dateRangeLabel, setDateRangeLabel] = useState(() => datePresets[0].range);
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setDateDropdownOpen(false);
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
    manualOverride === "open"
      ? true
      : manualOverride === "closed" || !isManualEnabled
      ? false
      : isScheduleOpen;

  const isManuallyClosed = manualOverride === "closed" || (!isManualEnabled && isScheduleOpen);

  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const apiFilter: AdminOrderFilter = ({ Alla: "ALL", Nya: "CONFIRMED", Mottagna: "ACKNOWLEDGED", Förbereds: "PREPARING", Klara: "READY_FOR_PICKUP", Slutförda: "PICKED_UP" } as Record<string, AdminOrderFilter>)[orderFilter] ?? "ALL";
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

  // Settings tab form state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPw.length < 8 || newPw !== confirmPw) {
      setPwMsg("Kontrollera det nya lösenordet och bekräftelsen.");
      return;
    }
    setPasswordBusy(true);
    setPwMsg(null);
    try {
      const csrf = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("falken_admin_csrf="))?.split("=")[1];
      const response = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrf ? decodeURIComponent(csrf) : "" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "För många försök. Försök igen senare." : "Lösenordet kunde inte ändras. Kontrollera ditt nuvarande lösenord.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      router.replace("/admin/login");
      router.refresh();
    } catch (error) {
      setPwMsg(error instanceof Error ? error.message : "Lösenordet kunde inte ändras.");
      setPasswordBusy(false);
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

  async function handleCancelOrder(orderId: string) {
    const order = ordersApi.list?.orders.find((item) => item.publicId === orderId);
    if (!order) return;
    if (!window.confirm(`Avbryta beställning ${orderId}? Åtgärden kan inte ångras.`)) return;
    await ordersApi.transition(orderId, order.fulfillmentStatus, "CANCELLED");
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
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#e8e2d5] bg-[#f9f8f4]/95 px-5 py-3.5 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-lg p-1.5 text-[#555a64] hover:bg-black/5 hover:text-[#1f2328] focus:outline-none"
              aria-label="Öppna meny"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h1 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[#1f2328] leading-tight">
                Admin Dashboard
              </h1>
              <p className="text-[11px] text-[#7c828d]">
                Falken Restaurang &amp; Pizzeria
              </p>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {activeTab === "oversikt" && (
              <div className="relative" ref={dateDropdownRef}>
                <button
                  type="button"
                  onClick={() => setDateDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#555a64] shadow-xs hover:border-[#a78347] transition sm:text-xs"
                  aria-expanded={dateDropdownOpen}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#8a7040]" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="whitespace-nowrap">{dateRangeLabel}</span>
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-[#8c827a]" fill="currentColor">
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
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition whitespace-nowrap ${
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
              className="inline-flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#555a64] shadow-xs hover:border-[#b88e4d] transition disabled:opacity-60 sm:text-xs"
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
            <AdminNotificationsDropdown onSelectOrder={handleSelectOrderFromNotification} />

            {/* User Profile Avatar Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-[#e4ded2] bg-white py-1 pl-1 pr-2.5 shadow-xs hover:border-[#b88e4d] transition focus:outline-none"
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
        </header>

        {/* Dashboard Content Container */}
        <main className="p-3 sm:p-4 lg:px-5 lg:py-3 space-y-3 pb-48 sm:pb-60">
          {activeTab === "oversikt" ? (
            <>
              {overviewError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">{overviewError} Visade värden är 0 tills serverdatan kan hämtas.</p>}
              {orderingError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">{orderingError}</p>}
              
              {/* TOP 5 KPI STAT CARDS */}
              <section aria-label="Översikt" aria-busy={overviewLoading}>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-2.5">
                  {[
                    {
                      title: overviewPeriod === "today" ? "Dagens intäkt" : overviewPeriod === "yesterday" ? "Gårdagens intäkt" : "Total intäkt",
                      value: overview ? money(overview.metrics.revenueSek) : "—",
                      change: overview ? `${overview.metrics.paidStripeOrders} betalda online` : "Laddar...",
                      changeColor: "text-[#15803d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                          <circle cx="12" cy="15" r="1.5" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      title: overviewPeriod === "today" ? "Beställningar idag" : overviewPeriod === "yesterday" ? "Beställningar igår" : "Beställningar",
                      value: overview ? `${overview.metrics.orders} st` : "—",
                      change: overview ? `${overview.metrics.orders} genomförda` : "Laddar...",
                      changeColor: "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6" />
                          <circle cx="10" cy="21" r="1" />
                          <circle cx="18" cy="21" r="1" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      title: "Pågående ordrar",
                      value: overview ? `${overview.metrics.activeOrders} st` : "—",
                      change: overview && overview.metrics.activeOrders > 0 ? "Kräver åtgärd" : "Inga aktiva just nu",
                      changeColor: overview && overview.metrics.activeOrders > 0 ? "text-[#b45309]" : "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                    {
                      title: "Ej betalda",
                      value: overview ? `${overview.metrics.unpaidOrders} st` : "—",
                      valueColor: overview && overview.metrics.unpaidOrders > 0 ? "text-[#e04f44]" : "text-[#1f2328]",
                      change: overview ? money(overview.metrics.unpaidSek) : "0 kr",
                      changeColor: "text-[#7c828d]",
                      hasArrow: true,
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                      ),
                      iconBg: "bg-[#fef2f2] text-[#e04f44]",
                    },
                    {
                      title: "Snitt ordervärde",
                      value: overview ? (overview.metrics.averageOrderSek > 0 ? money(overview.metrics.averageOrderSek) : "0 kr") : "—",
                      change: "Per slutförd order",
                      changeColor: "text-[#7c828d]",
                      icon: (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19V5M10 19V9M16 19V3M22 19v-7" />
                        </svg>
                      ),
                      iconBg: "bg-[#f5efdf] text-[#a78347]",
                    },
                  ].map((card, idx) => (
                    <div
                      key={card.title}
                      className={`min-w-0 rounded-xl border border-[#e7e1d5] bg-white p-2.5 sm:p-3 shadow-xs ${
                        idx === 4 ? "col-span-2 sm:col-span-1" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] font-semibold text-[#7c828d] whitespace-nowrap">{card.title}</p>
                        <div className="flex items-center gap-0.5">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${card.iconBg}`}>
                            {card.icon}
                          </span>
                          {card.hasArrow && <span className="text-[10px] text-[#a09a90]">›</span>}
                        </div>
                      </div>
                      <p className={`mt-1 text-base sm:text-lg font-bold tracking-tight ${card.valueColor ?? "text-[#1f2328]"}`}>
                        {card.value}
                      </p>
                      <p className={`mt-0.5 text-[10px] sm:text-[11px] font-medium whitespace-nowrap ${card.changeColor}`}>
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
                    <OverviewChart data={overview?.chart ?? []} totalRevenue={overview?.metrics.revenueSek ?? 0} totalOrders={overview?.metrics.orders ?? 0} />
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
                          {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda"] as const).map((filter) => {
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
                                    {ord.paymentStatus === "Betald" ? (
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
                  {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda"] as const).map((filter) => (
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
                                  {ord.paymentStatus === "Betald" ? (
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
            <div className="max-w-2xl space-y-6">
              <div className="border-b border-[#e8e2d5] pb-4">
                <h2 className="font-serif text-2xl font-bold text-[#1f2328]">Säkerhet &amp; Inställningar</h2>
                <p className="text-xs text-[#7c828d]">Hantera administratörskontot och lösenord</p>
              </div>

              <div className="rounded-2xl border border-[#e7e1d5] bg-white p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-[#1f2328]">Byt lösenord för {adminEmail}</h3>

                {pwMsg && (
                  <div
                    className={`rounded-xl p-3 text-xs font-medium ${
                      pwMsg.startsWith("success:")
                        ? "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]"
                        : "bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]"
                    }`}
                  >
                    {pwMsg.replace("success:", "")}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#1f2328]">
                      Nuvarande lösenord
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPw ? "text" : "password"}
                        required
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                        aria-label={showCurrentPw ? "Dölj lösenord" : "Visa lösenord"}
                        title={showCurrentPw ? "Dölj lösenord" : "Visa lösenord"}
                      >
                        {showCurrentPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#1f2328]">
                      Nytt lösenord
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPw ? "text" : "password"}
                        required
                        placeholder="Minst 8 tecken"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPw((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                        aria-label={showNewPw ? "Dölj lösenord" : "Visa lösenord"}
                        title={showNewPw ? "Dölj lösenord" : "Visa lösenord"}
                      >
                        {showNewPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#1f2328]">
                      Bekräfta nytt lösenord
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPw ? "text" : "password"}
                        required
                        placeholder="Upprepa lösenordet"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        className="w-full rounded-xl border border-[#e4ded2] bg-[#faf8f4] px-3.5 py-2.5 pr-11 text-xs text-[#1f2328] outline-none transition focus:border-[#b88e4d] focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPw((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7c828d] transition hover:text-[#1f2328] focus:outline-none"
                        aria-label={showConfirmPw ? "Dölj lösenord" : "Visa lösenord"}
                        title={showConfirmPw ? "Dölj lösenord" : "Visa lösenord"}
                      >
                        {showConfirmPw ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={passwordBusy}
                    className="rounded-xl bg-[#a78347] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#96743b] transition disabled:opacity-50"
                  >
                    {passwordBusy ? "Uppdaterar…" : "Uppdatera lösenord"}
                  </button>
                </form>
              </div>
            </div>
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
          onViewReceipt={(ord) => {
            setViewingReceipt({
              orderNumber: ord.publicId,
              customerName: ord.customerName,
              phone: ord.phone,
              date: ord.createdAt ? new Date(ord.createdAt).toLocaleDateString("sv-SE") : new Date().toLocaleDateString("sv-SE"),
              paymentMethod: ord.paymentMethod === "card" ? "Stripe · kort" : ord.paymentMethod === "swish" ? "Swish" : "Betala på plats",
              paymentStatus: ord.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
              totalSek: ord.totalSek,
              items: ord.items.map((it) => ({
                description: it.name,
                quantity: it.quantity,
                unitPriceSek: it.basePriceSek || Math.round(it.lineTotalSek / Math.max(1, it.quantity)),
              })),
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

            {/* 3: Avbryt beställning */}
            <button
              type="button"
              onClick={() => {
                const ord = activeActionMenu.order;
                setActiveActionMenu(null);
                void handleCancelOrder(ord.id);
              }}
              className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer border-t border-[#f2ede4] mt-1 pt-1.5"
            >
              <span className="text-sm">🚫</span>
              <span>Avbryt beställning</span>
            </button>
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
