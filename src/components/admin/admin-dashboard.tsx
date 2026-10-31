"use client";

import { useEffect, useRef, useState } from "react";
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
type OrderStatus = "Ny" | "Förbereds" | "Serverad" | "Klar för avhämtning" | "Slutförd";

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
  type: string;
  itemsText: string;
  items?: OrderDetailItem[];
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
type OverviewData = {
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

function niceAxisMaximum(value: number) {
  if (value <= 0) return 1;
  const roughStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return step * 4;
}

function OverviewChart({ data }: { data: OverviewData["chart"] }) {
  const chartData = data ?? [];
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);

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

  const width = containerWidth > 0 ? containerWidth : 800;
  const height = 260;
  const left = 36;
  const right = 22;
  const top = 18;
  const bottom = 28;
  const plotWidth = Math.max(10, width - left - right);
  const plotHeight = height - top - bottom;

  const rawMaxRevenue = chartData.length > 0 ? Math.max(0, ...chartData.map((point) => point.revenueSek)) : 0;
  const rawMaxOrders = chartData.length > 0 ? Math.max(0, ...chartData.map((point) => point.orders)) : 0;
  const maxRevenue = rawMaxRevenue > 0 ? niceAxisMaximum(rawMaxRevenue) : 200;
  const maxOrders = Math.max(2, niceAxisMaximum(rawMaxOrders));

  const step = chartData.length ? plotWidth / chartData.length : plotWidth;
  const barWidth = Math.min(38, Math.max(8, step * 0.58));
  const points = chartData.map((point, index) => ({
    x: left + step * index + step / 2,
    y: top + plotHeight - (point.orders / maxOrders) * plotHeight,
  }));
  const maxLabels = Math.max(5, Math.floor(plotWidth / 48));
  const showEvery =
    chartData.length > maxLabels
      ? Math.ceil(chartData.length / maxLabels)
      : 1;

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <svg
        className="h-[240px] sm:h-[260px] w-full block"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stapeldiagram över intäkter och antal beställningar"
      >
        {/* Subtle dashed horizontal grid lines and muted axis ticks */}
        {[0, 1, 2, 3, 4].map((index) => {
          const y = top + plotHeight - (plotHeight * index) / 4;
          const revenueVal = Math.round((maxRevenue * index) / 4);
          const revenueTick = index === 0 ? "0" : new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(revenueVal);
          const ordersTick = index === 0 ? "0" : String(Math.round((maxOrders * index) / 4));
          return (
            <g key={index}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="#eee8df"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11.5"
                className="fill-[#9e988f] font-normal"
              >
                {revenueTick}
              </text>
              <text
                x={width - right + 6}
                y={y + 4}
                textAnchor="start"
                fontSize="11.5"
                className="fill-[#9e988f] font-normal"
              >
                {ordersTick}
              </text>
            </g>
          );
        })}

        {/* Revenue columns - clean, light sand/beige solid bars matching reference design */}
        {chartData.map((point, index) => {
          const barHeight = (point.revenueSek / maxRevenue) * plotHeight;
          const x = left + step * index + (step - barWidth) / 2;
          const y = top + plotHeight - barHeight;
          if (barHeight <= 0) return null;
          return (
            <rect
              key={point.key}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="3"
              ry="3"
              fill="#dad1be"
              className="cursor-pointer transition-colors duration-150 hover:fill-[#cfc5b0]"
            >
              <title>{`${point.label}: ${money(point.revenueSek)}, ${point.orders} beställningar`}</title>
            </rect>
          );
        })}

        {/* Order trend polyline - olive/warm brown */}
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#837147"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Order trend dots - solid olive/warm brown circles matching reference */}
        {points.map((point, index) => (
          <circle
            key={chartData[index]?.key ?? index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill="#837147"
            className="cursor-pointer transition-transform hover:scale-125"
          >
            <title>{`${chartData[index]?.label}: ${chartData[index]?.orders ?? 0} beställningar`}</title>
          </circle>
        ))}

        {/* X axis date labels */}
        {chartData.map((point, index) =>
          index % showEvery === 0 || index === chartData.length - 1 ? (
            <text
              key={point.key}
              x={left + step * index + step / 2}
              y={height - 8}
              textAnchor="middle"
              fontSize="11.5"
              className="fill-[#8f8980] font-normal"
            >
              {point.label}
            </text>
          ) : null
        )}
      </svg>
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
    READY_FOR_PICKUP: order.paymentMethod === "card" ? { label: "Markera hämtad", variant: "emerald" } : undefined,
  };
  return {
    id: order.publicId, orderNumber: `#${order.publicId}`, customer: order.customerName,
    phone: order.phone, createdAt: new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Stockholm" }).format(new Date(order.createdAt)),
    type: "Avhämtning",
    itemsText: order.items.map((item) => `${item.quantity} × ${item.name}`).join(", "),
    items: order.items.map((item) => ({ name: item.name, size: item.variant ?? undefined, quantity: item.quantity, price: 0 })),
    total: order.totalSek, paymentMethod: order.paymentMethod === "card" ? "Stripe · Kort" : "Betala på plats",
    paymentStatus: order.paymentStatus === "paid" ? "Betald" : "Väntar på betalning",
    status: styles[order.fulfillmentStatus]?.label as OrderStatus ?? "Ny",
    statusBadge: styles[order.fulfillmentStatus] ?? styles.CONFIRMED,
    primaryAction: actions[order.fulfillmentStatus],
  };
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
  const [overviewPeriod, setOverviewPeriod] = useState<OverviewPeriod>("month");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [dateRangeLabel, setDateRangeLabel] = useState("1 okt. 2026 – 31 okt. 2026");
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

  const datePresets: { id: OverviewPeriod; label: string; range: string }[] = [
    { id: "today", label: "Idag", range: "28 okt. 2026" },
    { id: "yesterday", label: "Igår", range: "27 okt. 2026" },
    { id: "week", label: "Denna vecka", range: "21 okt. – 28 okt. 2026" },
    { id: "month", label: "Denna månad", range: "1 okt. – 31 okt. 2026" },
    { id: "year", label: "Detta år", range: "1 jan. – 31 dec. 2026" },
  ];

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
  const ordersApi = useAdminOrders(activeTab === "bestallningar" || activeTab === "oversikt", apiFilter, debouncedSearch, orderPage);
  const orders = (ordersApi.list?.orders ?? []).map(toDashboardOrder);
  useEffect(() => { const timer = window.setTimeout(() => { setOrderPage(1); setDebouncedSearch(orderSearchQuery.trim()); }, 300); return () => window.clearTimeout(timer); }, [orderSearchQuery]);

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

  async function handleAdvanceOrder(orderId: string) {
    const order = ordersApi.list?.orders.find((item) => item.publicId === orderId);
    if (!order) return;
    const to = ({ CONFIRMED: "ACKNOWLEDGED", ACKNOWLEDGED: "PREPARING", PREPARING: "READY_FOR_PICKUP", READY_FOR_PICKUP: order.paymentMethod === "card" ? "PICKED_UP" : null } as Record<string, string | null>)[order.fulfillmentStatus];
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
              <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#dc2626] p-0 text-center text-[10px] font-bold leading-none tabular-nums text-white">
                {ordersApi.list?.total ?? 0}
              </span>
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
              <span>Fakturor</span>
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
            <button type="button" disabled aria-label="Aviseringar" title="Aviseringar" className="rounded-lg p-2 text-[#9ca0a7]" aria-disabled="true">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </button>

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
        <main className="p-3 sm:p-4 lg:px-5 lg:py-3 space-y-3">
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
              {/* MAIN CONTENT 2-COLUMN GRID (CHART ON LEFT, TOP DISHES + REVIEWS ON RIGHT) */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                {/* Left Column: Intäkter & ordertrend combo chart */}
                <div className="flex min-w-0 flex-col rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs lg:col-span-8">
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

                  {/* Subheader: Legends on left, Total revenue for selected period on right */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-xs text-[#746b64]">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-xs bg-[#dad1be]" />
                        <span>Intäkter (kr)</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-[#837147]" />
                        <span>Antal beställningar</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[#7c828d]">Total intäkt (vald period):</span>
                      <span className="font-bold text-sm text-[#1f2328]">
                        {overview ? money(overview.metrics.revenueSek) : "0 kr"}
                      </span>
                      {overview && (
                        <span className="text-xs text-[#7c828d]">
                          ({overview.metrics.orders} st)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The Combo Chart */}
                  <div className="mt-2 w-full">
                    <OverviewChart data={overview?.chart ?? []} />
                  </div>
                </div>

                {/* Right Column: Stacked Cards (Mest beställt + Betyg & Omdömen) */}
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
                </div>
              </section>

              {/* ROW 3: AKTUALLA BESTÄLLNINGAR (8 COLS) + MENY & PRODUKTER (4 COLS) */}
              <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
                {/* Large Orders Table (8 cols) */}
                <div className="lg:col-span-8 rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs flex flex-col justify-between">
                  {/* Header & Filter Pills */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f2ede4] pb-3">
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#d97706]" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <h2 className="text-sm font-bold text-[#1f2328]">Aktuella beställningar</h2>
                      </div>

                      {/* Filter buttons */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                        {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda"] as const).map((filter) => {
                          return (
                            <button
                              key={filter}
                              type="button"
                              onClick={() => { setOrderPage(1); setOrderFilter(filter); }}
                              className={`rounded-lg px-2.5 py-1 text-xs transition ${
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
                        className="text-xs text-[#8c827a] hover:text-[#1f2328] hover:underline"
                      >
                        Visa alla beställningar →
                      </button>
                    </div>
                  </div>

                  {/* Orders Table */}
                  <div className="mt-3 flex-1 flex flex-col justify-between min-h-0 overflow-x-auto admin-scrollbar pb-1">
                    <table className="w-full min-w-[720px] text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-[#f2ede4] text-[11px] font-semibold text-[#8c827a] whitespace-nowrap">
                          <th className="py-2.5 pr-2 whitespace-nowrap">Ordernr</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Kund</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Typ</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Beställning</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Totalt</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Betalning</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Status</th>
                          <th className="py-2.5 pl-2 text-right whitespace-nowrap">Åtgärder</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f5f1e8]">
                        {filteredOrders.length > 0 ? (
                          filteredOrders.map((ord) => (
                            <tr
                              key={ord.id}
                              onClick={() => void ordersApi.open(ord.id)}
                              onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void ordersApi.open(ord.id); } }}
                              tabIndex={0}
                              aria-label={`Visa beställning ${ord.orderNumber}`}
                              className="hover:bg-[#faf7f2]/80 transition cursor-pointer"
                            >
                              <td className="py-3 pr-2 font-bold text-[#1f2328] whitespace-nowrap">{ord.orderNumber}</td>
                              <td className="py-3 px-2 font-medium text-[#1f2328] whitespace-nowrap">{ord.customer}</td>
                              <td className="py-3 px-2 text-[#555a64] whitespace-nowrap">
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                  {ord.type.includes("Äta") && <span>🍴</span>}
                                  {ord.type.includes("Avhämtning") && <span>🛍️</span>}
                                  {ord.type.includes("Online") && <span>📱</span>}
                                  <span>{ord.type}</span>
                                </span>
                              </td>
                              <td className="py-3 px-2 text-[#555a64] max-w-[220px] truncate whitespace-nowrap" title={ord.itemsText}>
                                {ord.itemsText}
                              </td>
                              <td className="py-3 px-2 font-bold text-[#1f2328] whitespace-nowrap">
                                {ord.total} kr
                              </td>
                              <td className="py-3 px-2 text-[#555a64] whitespace-nowrap">
                                {ord.paymentMethod}
                              </td>
                              <td className="py-3 px-2 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ord.statusBadge.bgColor} ${ord.statusBadge.textColor} whitespace-nowrap`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${ord.statusBadge.dotColor}`} />
                                  {ord.statusBadge.label}
                                </span>
                              </td>
                              <td className="py-3 pl-2 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {ord.primaryAction && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (ord.primaryAction?.label === "Visa") {
                                          void ordersApi.open(ord.id);
                                        } else {
                                          handleAdvanceOrder(ord.id);
                                        }
                                      }}
                                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                                        ord.primaryAction.variant === "gold"
                                          ? "bg-[#a78347] text-white hover:bg-[#96743b] shadow-xs"
                                          : ord.primaryAction.variant === "emerald"
                                          ? "bg-[#16a34a] text-white hover:bg-[#15803d] shadow-xs"
                                          : "border border-[#e4ded2] bg-white text-[#1f2328] hover:bg-[#f5f1e8]"
                                      }`}
                                    >
                                      {ord.primaryAction.label}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void ordersApi.open(ord.id);
                                    }}
                                    className="rounded-lg p-1 text-[#8c827a] hover:bg-[#f5f1e8] hover:text-[#1f2328] transition"
                                    title="Visa orderdetaljer"
                                  >
                                    ⋮
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
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

                {/* Right Box: Meny & Produkter (4 cols) */}
                <div className="flex min-h-48 flex-col rounded-2xl border border-[#e7e1d5] bg-white p-4 sm:p-5 shadow-xs lg:col-span-4">
                  <div className="flex items-center justify-between border-b border-[#f2ede4] pb-2.5">
                    <h2 className="text-sm font-bold text-[#1f2328]">Meny &amp; Produkter</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab("meny")}
                      className="text-xs text-[#8c827a] hover:text-[#1f2328] hover:underline"
                    >
                      Hantera →
                    </button>
                  </div>
                  <p className="m-auto text-sm text-[#7c828d]">Redigering kommer senare.</p>
                </div>
              </section>
            </>
          ) : activeTab === "bestallningar" ? (
            /* ========================================================================= */
            /* TAB: BESTÄLLNINGAR FULL VIEW                                              */
            /* ========================================================================= */
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e8e2d5] pb-4">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#1f2328]">Alla beställningar</h2>
                  <p className="text-xs text-[#7c828d]">Hantera, sök och följ kundordrar och specifikationer i realtid</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("oversikt")}
                  className="rounded-xl border border-[#e4ded2] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#1f2328] hover:bg-[#f5f1e8] transition self-start sm:self-auto"
                >
                  ← Tillbaka till översikt
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
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Sök ordernummer, kund eller telefon..."
                    className="w-full rounded-xl border border-[#e4ded2] bg-white pl-9 pr-8 py-2 text-xs text-[#1f2328] placeholder-[#8c827a] focus:border-[#b88e4d] focus:outline-none shadow-2xs transition"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery("")}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8c827a] hover:text-[#1f2328] text-xs font-bold"
                      title="Rensa sökning"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-white border border-[#e4ded2] p-1 text-xs">
                  {(["Alla", "Nya", "Mottagna", "Förbereds", "Klara", "Slutförda"] as const).map((filter) => {
                    
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => { setOrderPage(1); setOrderFilter(filter); }}
                        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
                          orderFilter === filter
                            ? "bg-[#a78347] font-semibold text-white shadow-2xs"
                            : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
                        }`}
                      >
                        <span>{filter}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {ordersApi.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{ordersApi.error}</p>}
              {ordersApi.loading && <p role="status" className="text-sm text-[#7c828d]">Laddar beställningar…</p>}
              {/* Table or Empty state */}
              <div className="rounded-2xl border border-[#e7e1d5] bg-white p-5 shadow-xs">
                {ordersApi.error || ordersApi.loading ? null : filteredOrders.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
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
                      className="rounded-xl border border-[#e4ded2] bg-[#fdfbf7] px-3.5 py-1.5 text-xs font-semibold text-[#1f2328] hover:bg-[#f5f1e8] transition"
                    >
                      Återställ sökning &amp; filter
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto admin-scrollbar pb-1">
                    <table className="w-full min-w-[760px] text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-[#f2ede4] text-[11px] font-semibold text-[#8c827a] whitespace-nowrap">
                          <th className="py-2.5 pr-2 whitespace-nowrap">Ordernr</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Kund</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Typ</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Artiklar &amp; Specifikationer</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Belopp</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Betalmetod</th>
                          <th className="py-2.5 px-2 whitespace-nowrap">Status</th>
                          <th className="py-2.5 pl-2 text-right whitespace-nowrap">Åtgärd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f5f1e8]">
                        {filteredOrders.map((ord) => (
                          <tr
                            key={ord.id}
                            onClick={() => void ordersApi.open(ord.id)}
                            onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void ordersApi.open(ord.id); } }}
                            tabIndex={0}
                            aria-label={`Visa beställning ${ord.orderNumber}`}
                            className="hover:bg-[#faf7f2] transition cursor-pointer"
                          >
                            <td className="py-3 pr-2 font-bold text-[#1f2328] whitespace-nowrap">
                              <span className="hover:text-[#a78347] underline decoration-dotted underline-offset-4">
                                {ord.orderNumber}
                              </span>
                            </td>
                            <td className="py-3 px-2 font-medium text-[#1f2328] whitespace-nowrap">
                              <div>{ord.customer}</div>
                              {ord.phone && (
                                <div className="text-[10px] text-[#8c827a]">{ord.phone}</div>
                              )}
                            </td>
                            <td className="py-3 px-2 text-[#555a64] whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                {ord.type.includes("Äta") && <span>🍴</span>}
                                {ord.type.includes("Avhämtning") && <span>🛍️</span>}
                                {ord.type.includes("Online") && <span>📱</span>}
                                <span>{ord.type}</span>
                              </span>
                            </td>
                            <td className="py-3 px-2 text-[#555a64] max-w-xs truncate" title={ord.itemsText}>
                              <div className="font-medium text-[#1f2328] truncate">{ord.itemsText}</div>
                              {ord.items && ord.items[0]?.size && (
                                <div className="text-[10px] text-[#8c827a]">
                                  {ord.items.map((it) => it.size).filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-2 font-bold text-[#1f2328] whitespace-nowrap">
                              {ord.total} kr
                            </td>
                            <td className="py-3 px-2 text-[#555a64] whitespace-nowrap">
                              <div>{ord.paymentMethod}</div>
                              <span className="text-[10px] font-semibold text-[#15803d]">
                                {ord.paymentStatus || "Betald"}
                              </span>
                            </td>
                            <td className="py-3 px-2 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ord.statusBadge.bgColor} ${ord.statusBadge.textColor}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${ord.statusBadge.dotColor}`} />
                                {ord.statusBadge.label}
                              </span>
                            </td>
                            <td className="py-3 pl-2 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {ord.primaryAction && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (ord.primaryAction?.label === "Visa") {
                                        void ordersApi.open(ord.id);
                                      } else {
                                        handleAdvanceOrder(ord.id);
                                      }
                                    }}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                                      ord.primaryAction.variant === "gold"
                                        ? "bg-[#a78347] text-white hover:bg-[#96743b] shadow-xs"
                                        : ord.primaryAction.variant === "emerald"
                                        ? "bg-[#16a34a] text-white hover:bg-[#15803d] shadow-xs"
                                        : "border border-[#e4ded2] bg-white text-[#1f2328] hover:bg-[#f5f1e8]"
                                    }`}
                                  >
                                    {ord.primaryAction.label}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void ordersApi.open(ord.id);
                                  }}
                                  className="rounded-lg p-1 text-[#8c827a] hover:bg-[#f5f1e8] hover:text-[#1f2328] transition"
                                  title="Visa orderdetaljer"
                                >
                                  ⋮
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              {!!ordersApi.list?.total && <div className="flex items-center justify-between text-xs text-[#555a64]"><span>{ordersApi.list.total} beställningar · sida {orderPage} av {Math.ceil(ordersApi.list.total / ordersApi.list.limit)}</span><div className="flex gap-2"><button type="button" disabled={orderPage <= 1} onClick={() => setOrderPage(orderPage - 1)} className="rounded-lg border border-[#e4ded2] bg-white px-3 py-2 disabled:opacity-40">Föregående</button><button type="button" disabled={orderPage * ordersApi.list.limit >= ordersApi.list.total} onClick={() => setOrderPage(orderPage + 1)} className="rounded-lg border border-[#e4ded2] bg-white px-3 py-2 disabled:opacity-40">Nästa</button></div></div>}
            </div>
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

      {ordersApi.selected && <AdminOrderDialog order={ordersApi.selected} busy={ordersApi.busy} onClose={() => ordersApi.setSelected(null)} onTransition={(to) => void ordersApi.transition(ordersApi.selected!.publicId, ordersApi.selected!.fulfillmentStatus, to)} />}
    </div>
  );
}
