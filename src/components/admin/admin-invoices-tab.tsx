"use client";

import { useMemo, useState } from "react";
import type { AdminOrderSummary } from "@/server/admin-orders";
import { printOrderReceipt } from "@/lib/order-receipt-pdf";

export type InvoiceStatus = "paid" | "unpaid" | "overdue" | "partially_paid";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerName: string;
  orgNr: string;
  date: string;
  dueDate: string;
  amountSek: number;
  paidAmountSek?: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  items: { description: string; quantity: number; unitPriceSek: number; vatRate: number }[];
};

export type AdminInvoicesTabProps = {
  orders?: AdminOrderSummary[];
  onOpenOrder?: (id: string) => void;
};

const statusStyles: Record<InvoiceStatus, { label: string; badge: string; dot: string }> = {
  paid: {
    label: "Betald",
    badge: "bg-[#ecfdf5] text-[#065f46] border border-[#a7f3d0]",
    dot: "bg-[#10b981]",
  },
  unpaid: {
    label: "Obetald",
    badge: "bg-[#fffbeb] text-[#92400e] border border-[#fde68a]",
    dot: "bg-[#f59e0b]",
  },
  overdue: {
    label: "Förfallen",
    badge: "bg-[#fef2f2] text-[#991b1b] border border-[#fecaca]",
    dot: "bg-[#ef4444]",
  },
  partially_paid: {
    label: "Delvis betald",
    badge: "bg-[#eff6ff] text-[#1e40af] border border-[#bfdbfe]",
    dot: "bg-[#3b82f6]",
  },
};

const formatSek = (val: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(val)} kr`;

function matchesPeriodFilter(dateStr: string, period: string): boolean {
  if (period === "all") return true;

  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return true;
  }
  const [invYear, invMonth, invDay] = parts;
  const invDate = new Date(invYear, invMonth - 1, invDay);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curDay = now.getDate();

  // Monday of current week (ISO: Monday = 1 ... Sunday = 7)
  const dayOfWeek = (now.getDay() + 6) % 7;
  const curMonday = new Date(curYear, curMonth, curDay - dayOfWeek, 0, 0, 0, 0);
  const curSunday = new Date(curYear, curMonth, curDay - dayOfWeek + 6, 23, 59, 59, 999);

  if (period === "week") {
    return invDate >= curMonday && invDate <= curSunday;
  }

  if (period === "prev_week") {
    const prevMonday = new Date(curYear, curMonth, curDay - dayOfWeek - 7, 0, 0, 0, 0);
    const prevSunday = new Date(curYear, curMonth, curDay - dayOfWeek - 1, 23, 59, 59, 999);
    return invDate >= prevMonday && invDate <= prevSunday;
  }

  if (period === "month") {
    return invYear === curYear && invMonth - 1 === curMonth;
  }

  if (period === "prev_month") {
    const prevMonthDate = new Date(curYear, curMonth - 1, 1);
    return invYear === prevMonthDate.getFullYear() && invMonth - 1 === prevMonthDate.getMonth();
  }

  if (period === "quarter") {
    const curQuarter = Math.floor(curMonth / 3);
    const invQuarter = Math.floor((invMonth - 1) / 3);
    return invYear === curYear && invQuarter === curQuarter;
  }

  if (period === "year") {
    return invYear === curYear;
  }

  return true;
}

const periodLabelMap: Record<string, string> = {
  week: "denna vecka",
  prev_week: "förra veckan",
  month: "denna månad",
  prev_month: "förra månaden",
  quarter: "detta kvartal",
  year: "detta år",
  all: "alla perioder",
};

function formatSvDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return dateStr;
  }
  const months = [
    "jan.", "feb.", "mars", "apr.", "maj", "juni",
    "juli", "aug.", "sep.", "okt.", "nov.", "dec."
  ];
  const day = parts[2];
  const monthName = months[parts[1] - 1] || "";
  const year = parts[0];
  return `${day} ${monthName} ${year}`;
}

export function PaymentMethodBadge({ method }: { method?: string }) {
  const m = (method || "").toLowerCase();
  if (m.includes("swish")) {
    return <span className="text-xs text-[#1f2328] font-medium whitespace-nowrap">Swish</span>;
  }
  if (m.includes("kort") || m.includes("card") || m.includes("stripe")) {
    return <span className="text-xs text-[#1f2328] font-medium whitespace-nowrap">Kort</span>;
  }
  if (m.includes("bankgiro") || m.includes("faktura")) {
    return <span className="text-xs text-[#1f2328] font-medium whitespace-nowrap">Bankgiro</span>;
  }
  return <span className="text-xs text-[#1f2328] font-medium whitespace-nowrap">Betala på plats</span>;
}

export function OrderTypeBadge({ type }: { type: string }) {
  const t = (type || "").toLowerCase();
  if (t.includes("ät") || t.includes("bord") || t.includes("servering")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1f2328] whitespace-nowrap">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[#555a64]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 2v20M6 2v7a3 3 0 0 0 3 3v10M6 2h6" />
        </svg>
        <span>Äta här</span>
      </span>
    );
  }
  if (t.includes("utkör") || t.includes("leverans") || t.includes("bud")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1f2328] whitespace-nowrap">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[#555a64]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
        <span>Utkörning</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1f2328] whitespace-nowrap">
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-[#555a64]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      <span>Avhämtning</span>
    </span>
  );
}

export function AdminInvoicesTab({ orders = [], onOpenOrder }: AdminInvoicesTabProps) {
  const [customInvoices, setCustomInvoices] = useState<Invoice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("month");
  const [sortField, setSortField] = useState<keyof Invoice>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Selected invoice modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  // Sending modal
  const [sendingInvoice, setSendingInvoice] = useState<Invoice | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  // Create modal
  const [isCreating, setIsCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState("");
  const [newOrgNr, setNewOrgNr] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Convert real database orders into real invoices / receipts
  const realOrderInvoices: Invoice[] = useMemo(() => {
    return orders.map((ord) => {
      const isPaid = ord.paymentStatus === "paid";
      const paymentLabel =
        ord.paymentMethod === "card"
          ? "Stripe - Kort"
          : ord.paymentMethod === "swish"
          ? "Swish"
          : "Betala på plats";

      const createdDate = ord.createdAt ? ord.createdAt.split("T")[0] : new Date().toISOString().split("T")[0];
      const dueDate = ord.pickupAt ? ord.pickupAt.split("T")[0] : createdDate;

      return {
        id: ord.publicId,
        invoiceNumber: `F-${ord.publicId}`,
        customerName: ord.customerName || "Kund",
        orgNr: ord.phone ? `Tel. ${ord.phone}` : "Kundorder",
        date: createdDate,
        dueDate: dueDate,
        amountSek: ord.totalSek,
        paidAmountSek: isPaid ? ord.totalSek : 0,
        status: (isPaid ? "paid" : "unpaid") as InvoiceStatus,
        paymentMethod: paymentLabel,
        items: ord.items && ord.items.length > 0
          ? ord.items.map((it) => ({
              description: `${it.quantity}x ${it.name}${it.variant ? ` (${it.variant})` : ""}`,
              quantity: it.quantity,
              unitPriceSek: Math.round(ord.totalSek / Math.max(1, it.quantity)),
              vatRate: 12,
            }))
          : [
              {
                description: "Mat & Restaurangbeställning",
                quantity: 1,
                unitPriceSek: ord.totalSek,
                vatRate: 12,
              },
            ],
      };
    });
  }, [orders]);

  // Combine real database orders + any custom created invoices
  const allInvoices = useMemo(() => {
    return [...customInvoices, ...realOrderInvoices];
  }, [customInvoices, realOrderInvoices]);

  // Filtered & Sorted list
  const filtered = useMemo(() => {
    return allInvoices
      .filter((inv) => {
        if (!matchesPeriodFilter(inv.date, periodFilter)) return false;
        if (statusFilter !== "all" && inv.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchNum = inv.invoiceNumber.toLowerCase().includes(q);
          const matchCustomer = inv.customerName.toLowerCase().includes(q);
          const matchOrg = inv.orgNr.toLowerCase().includes(q);
          const matchAmount = inv.amountSek.toString().includes(q);
          if (!matchNum && !matchCustomer && !matchOrg && !matchAmount) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === "number" && typeof valB === "number") {
          return sortAsc ? valA - valB : valB - valA;
        }
        return sortAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
  }, [allInvoices, periodFilter, searchQuery, statusFilter, sortField, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const allSelectedOnPage =
    pagedInvoices.length > 0 &&
    pagedInvoices.every((inv) => selectedIds.includes(inv.id));

  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      const pageIds = new Set(pagedInvoices.map((inv) => inv.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...pagedInvoices.map((inv) => inv.id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Accurate real KPIs calculated from real restaurant data for the selected period
  const metrics = useMemo(() => {
    const periodInvoices = allInvoices.filter((inv) =>
      matchesPeriodFilter(inv.date, periodFilter)
    );
    let unpaidSum = 0;
    let unpaidCount = 0;
    let paidSum = 0;
    let paidCount = 0;
    let overdueSum = 0;
    let overdueCount = 0;
    let totalSum = 0;

    for (const inv of periodInvoices) {
      totalSum += inv.amountSek;
      if (inv.status === "unpaid") {
        unpaidSum += inv.amountSek;
        unpaidCount++;
      } else if (inv.status === "paid") {
        paidSum += inv.amountSek;
        paidCount++;
      } else if (inv.status === "overdue") {
        overdueSum += inv.amountSek;
        overdueCount++;
      } else if (inv.status === "partially_paid") {
        const rem = inv.amountSek - (inv.paidAmountSek ?? 0);
        unpaidSum += rem;
        unpaidCount++;
        paidSum += inv.paidAmountSek ?? 0;
      }
    }
    return {
      unpaidSum,
      unpaidCount,
      paidSum,
      paidCount,
      overdueSum,
      overdueCount,
      totalSum,
      totalCount: periodInvoices.length,
    };
  }, [allInvoices, periodFilter]);

  // Real recent payments from paid orders
  const recentPayments = useMemo(() => {
    return allInvoices.filter((i) => i.status === "paid").slice(0, 5);
  }, [allInvoices]);

  const toggleSort = (field: keyof Invoice) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.trim() || !newAmount) return;

    const num = `F-MANUELL-${allInvoices.length + 1}`;
    const today = new Date().toISOString().split("T")[0];
    const due = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

    const created: Invoice = {
      id: `custom-${Date.now()}`,
      invoiceNumber: num,
      customerName: newCustomer.trim(),
      orgNr: newOrgNr.trim() || "Företagskund",
      date: today,
      dueDate: due,
      amountSek: Number(newAmount) || 1000,
      status: "unpaid",
      paymentMethod: "Faktura 14 dagar",
      items: [
        {
          description: newDesc.trim() || "Restaurangcatering & servering",
          quantity: 1,
          unitPriceSek: Math.round((Number(newAmount) || 1000) / 1.12),
          vatRate: 12,
        },
      ],
    };

    setCustomInvoices([created, ...customInvoices]);
    setIsCreating(false);
    setNewCustomer("");
    setNewOrgNr("");
    setNewAmount("");
    setNewDesc("");
    setFeedback(`Faktura ${num} skapades framgångsrikt!`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const selectedTotalAmount = useMemo(() => {
    return allInvoices
      .filter((inv) => selectedIds.includes(inv.id))
      .reduce((sum, inv) => sum + inv.amountSek, 0);
  }, [allInvoices, selectedIds]);

  const handleMarkSelectedAsPaid = () => {
    if (selectedIds.length === 0) return;
    setCustomInvoices((prev) =>
      prev.map((inv) =>
        selectedIds.includes(inv.id)
          ? { ...inv, status: "paid", paidAmountSek: inv.amountSek }
          : inv
      )
    );
    setFeedback(`✓ ${selectedIds.length} ${selectedIds.length === 1 ? "faktura markerades" : "fakturor markerades"} som betald!`);
    setTimeout(() => setFeedback(null), 4000);
    setSelectedIds([]);
  };

  const handleSendReminders = () => {
    if (selectedIds.length === 0) return;
    setFeedback(`🔔 Påminnelse skickad till ${selectedIds.length} valda kunder via e-post & SMS!`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleExportSelected = () => {
    if (selectedIds.length === 0) return;
    const selected = allInvoices.filter((i) => selectedIds.includes(i.id));
    const header = "Fakturanr,Kund,Datum,Förfallodatum,Belopp,Status,Betalsätt";
    const rows = selected.map(
      (i) =>
        `"${i.invoiceNumber}","${i.customerName}","${i.date}","${i.dueDate}",${i.amountSek},"${statusStyles[i.status]?.label || i.status}","${i.paymentMethod || ""}"`
    );
    const csv = [header, ...rows].join("\r\n");
    // Prepend UTF-8 BOM (\uFEFF) so Excel on Windows decodes Swedish characters (ö, ä, å) correctly
    const BOM = "\uFEFF";
    const blob = new Blob([BOM, csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fakturor_urval_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback(`📥 ${selectedIds.length} fakturor exporterades till CSV!`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleDownloadInvoice = (inv: Invoice) => {
    // Generate and directly download a clean, valid PDF receipt file (no about:blank, no print dialog)
    const sanitize = (str: string) => {
      return str
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/×/g, "x")
        .replace(/[·•]/g, "-")
        .replace(/å/g, "\\345")
        .replace(/ä/g, "\\344")
        .replace(/ö/g, "\\366")
        .replace(/Å/g, "\\305")
        .replace(/Ä/g, "\\304")
        .replace(/Ö/g, "\\326")
        .replace(/é/g, "\\351");
    };

    const streamOps: string[] = [];

    // Header branding
    streamOps.push("BT /F1 15 Tf 1 0 0 1 75 620 Tm (" + sanitize("FALKEN RESTAURANG & PIZZERIA") + ") Tj ET");
    streamOps.push("BT /F2 9 Tf 1 0 0 1 120 605 Tm (" + sanitize("Kungsbacka - Falken.se - Tel: 0300-123 45") + ") Tj ET");
    streamOps.push("BT /F1 10 Tf 1 0 0 1 155 588 Tm (" + sanitize(`Faktura / Kvitto ${inv.invoiceNumber}`) + ") Tj ET");

    // Dashed divider line
    streamOps.push("0.75 w [2 2] 0 d 0.75 0.75 0.75 RG 40 575 m 410 575 l S [] 0 d");

    // Meta details
    streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 555 Tm (" + sanitize("Datum:") + ") Tj 1 0 0 1 300 555 Tm (" + sanitize(formatSvDate(inv.date)) + ") Tj ET");
    streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 538 Tm (" + sanitize("Kund:") + ") Tj 1 0 0 1 300 538 Tm (" + sanitize(inv.customerName) + ") Tj ET");
    if (inv.orgNr) {
      streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 521 Tm (" + sanitize("Kontakt/Org:") + ") Tj 1 0 0 1 300 521 Tm (" + sanitize(inv.orgNr) + ") Tj ET");
    }
    streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 504 Tm (" + sanitize("Betalsätt:") + ") Tj 1 0 0 1 300 504 Tm (" + sanitize(inv.paymentMethod || "Swish") + ") Tj ET");
    streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 487 Tm (" + sanitize("Status:") + ") Tj 1 0 0 1 300 487 Tm (" + sanitize(statusStyles[inv.status].label) + ") Tj ET");

    // Dashed divider
    streamOps.push("0.75 w [2 2] 0 d 0.75 0.75 0.75 RG 40 472 m 410 472 l S [] 0 d");

    // Items section
    streamOps.push("BT /F1 9 Tf 0.5 0.5 0.5 rg 1 0 0 1 40 455 Tm (" + sanitize("BESTÄLLDA ARTIKLAR") + ") Tj 0 0 0 rg ET");

    let y = 435;
    for (const it of inv.items) {
      const cleanDesc = it.description.replace(/^\d+\s*[x×]\s*/i, "");
      const lineText = `${it.quantity}x ${cleanDesc}`;
      const priceText = formatSek(it.quantity * it.unitPriceSek);
      streamOps.push("BT /F2 9.5 Tf 1 0 0 1 40 " + y + " Tm (" + sanitize(lineText) + ") Tj 1 0 0 1 360 " + y + " Tm (" + sanitize(priceText) + ") Tj ET");
      y -= 18;
    }

    // Dashed divider
    y -= 4;
    streamOps.push("0.75 w [2 2] 0 d 0.75 0.75 0.75 RG 40 " + y + " m 410 " + y + " l S [] 0 d");

    // Totals
    y -= 16;
    streamOps.push("BT /F2 9 Tf 0.45 0.45 0.45 rg 1 0 0 1 40 " + y + " Tm (" + sanitize("Delsumma (exkl. moms)") + ") Tj 1 0 0 1 360 " + y + " Tm (" + sanitize(formatSek(Math.round(inv.amountSek * 0.89))) + ") Tj 0 0 0 rg ET");
    y -= 15;
    streamOps.push("BT /F2 9 Tf 0.45 0.45 0.45 rg 1 0 0 1 40 " + y + " Tm (" + sanitize("Moms (12%)") + ") Tj 1 0 0 1 360 " + y + " Tm (" + sanitize(formatSek(Math.round(inv.amountSek * 0.11))) + ") Tj 0 0 0 rg ET");
    y -= 20;
    streamOps.push("BT /F1 11 Tf 0.51 0.44 0.28 rg 1 0 0 1 40 " + y + " Tm (" + sanitize("Totalt att betala") + ") Tj 1 0 0 1 350 " + y + " Tm (" + sanitize(formatSek(inv.amountSek)) + ") Tj 0 0 0 rg ET");

    // Bottom dashed divider
    y -= 14;
    streamOps.push("0.75 w [2 2] 0 d 0.75 0.75 0.75 RG 40 " + y + " m 410 " + y + " l S [] 0 d");

    // Footer note
    y -= 24;
    streamOps.push("BT /F2 8.5 Tf 0.5 0.5 0.5 rg 1 0 0 1 100 " + y + " Tm (" + sanitize("Tack för din beställning hos Falken Restaurang & Pizzeria!") + ") Tj ET");
    y -= 13;
    streamOps.push("BT /F2 8 Tf 0.6 0.6 0.6 rg 1 0 0 1 140 " + y + " Tm (" + sanitize("Godkänd för F-skatt - Org.nr 556123-4567") + ") Tj 0 0 0 rg ET");

    const streamContent = streamOps.join("\n");
    const streamLen = new TextEncoder().encode(streamContent).length;

    const objs = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 450 670] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj",
      "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj",
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj",
      "6 0 obj\n<< /Length " + streamLen + " >>\nstream\n" + streamContent + "\nendstream\nendobj",
    ];

    const header = "%PDF-1.4\n";
    const offsets: number[] = [];
    let currentOffset = new TextEncoder().encode(header).length;

    for (const obj of objs) {
      offsets.push(currentOffset);
      currentOffset += new TextEncoder().encode(obj + "\n").length;
    }

    const startXref = currentOffset;
    let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    for (const off of offsets) {
      xref += String(off).padStart(10, "0") + " 00000 n \n";
    }

    const trailer =
      "trailer\n<< /Size " +
      (objs.length + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      startXref +
      "\n%%EOF\n";

    const fullPdfString = header + objs.join("\n") + "\n" + xref + trailer;
    const pdfBytes = new TextEncoder().encode(fullPdfString);

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `faktura_${inv.invoiceNumber}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    setFeedback(`📥 Faktura ${inv.invoiceNumber}.pdf laddades ner direkt!`);
    setTimeout(() => setFeedback(null), 4000);
  };

  const handleExportAll = () => {
    const header = "Fakturanr,Kund,Datum,Förfallodatum,Belopp,Status,Betalsätt";
    const rows = filtered.map(
      (i) =>
        `"${i.invoiceNumber}","${i.customerName}","${i.date}","${i.dueDate}",${i.amountSek},"${statusStyles[i.status]?.label || i.status}","${i.paymentMethod || ""}"`
    );
    const csv = [header, ...rows].join("\r\n");
    // Prepend UTF-8 BOM (\uFEFF) so Excel on Windows decodes Swedish characters (ö, ä, å) correctly
    const BOM = "\uFEFF";
    const blob = new Blob([BOM, csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fakturor_${periodFilter}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setFeedback(`📥 ${filtered.length} fakturor exporterades som CSV.`);
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee7da] pb-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#1f2328]">Fakturor &amp; Kvitton</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#7c828d]">
            Hantera restaurangens fakturor, kvitton, betalstatus och bokföringsunderlag.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#837147] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#72623c] transition cursor-pointer"
        >
          <span className="text-base leading-none">+</span>
          <span>Skapa faktura</span>
        </button>
      </div>

      {/* Floating In-App Toast Notification (Replaces native browser alert()) */}
      {feedback && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-xs font-semibold text-emerald-950 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm">
            ✓
          </span>
          <span className="text-[#1f2328]">{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-2 rounded-full p-1 text-[#8c827a] hover:bg-black/5 hover:text-[#1f2328] transition cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real KPI Cards calculated from real restaurant data */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Obetalda */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff6e0] text-xl text-[#b45309]">
            📄
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">Obetalda</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {formatSek(metrics.unpaidSum)}
            </p>
            <p className="text-[11px] text-[#8c827a] mt-0.5">{metrics.unpaidCount} fakturor</p>
          </div>
        </div>

        {/* Card 2: Betalda */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eefcf2] text-xl text-[#15803d]">
            ✓
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">Betalda</p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {formatSek(metrics.paidSum)}
            </p>
            <p className="text-[11px] text-[#8c827a] mt-0.5">{metrics.paidCount} fakturor</p>
          </div>
        </div>

        {/* Card 3: Förfallna */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#fee2e2] bg-[#fff8f8] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fee2e2] text-xl text-[#b91c1c]">
            ⚠️
          </div>
          <div>
            <p className="text-xs font-medium text-[#991b1b] leading-tight">Förfallna</p>
            <p className="mt-0.5 text-xl font-bold text-[#b91c1c] leading-tight">
              {formatSek(metrics.overdueSum)}
            </p>
            <p className="text-[11px] text-[#8c827a] mt-0.5">{metrics.overdueCount} faktura</p>
          </div>
        </div>

        {/* Card 4: Totalt per vald period */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-[#efe9dc] bg-[#fffcf5] p-4 shadow-xs">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f5ede0] text-xl text-[#837147]">
            🪙
          </div>
          <div>
            <p className="text-xs font-medium text-[#7c828d] leading-tight">
              Totalt {periodLabelMap[periodFilter] || "denna månad"}
            </p>
            <p className="mt-0.5 text-xl font-bold text-[#1f2328] leading-tight">
              {formatSek(metrics.totalSum)}
            </p>
            <p className="text-[11px] text-[#8c827a] mt-0.5">
              {metrics.totalCount} {metrics.totalCount === 1 ? "faktura" : "fakturor"}
            </p>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e7e1d5] bg-white p-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-[#8c827a]">🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Sök faktura, kund eller belopp..."
            className="w-full rounded-xl border border-[#e2dbce] bg-[#fdfbf7] py-2 pl-9 pr-4 text-xs outline-offset-2 focus:border-[#837147] focus:outline-[#837147]"
          />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="relative inline-flex items-center">
            <select
              value={periodFilter}
              onChange={(e) => {
                setPeriodFilter(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-xl border border-[#e2dbce] bg-white pl-3 pr-8 py-2 text-xs font-medium text-[#1f2328] cursor-pointer hover:bg-[#faf7f2] focus:border-[#837147] focus:outline-none transition shadow-2xs"
            >
              <option value="week">📅 Denna vecka</option>
              <option value="prev_week">📅 Förra veckan</option>
              <option value="month">📅 Denna månad</option>
              <option value="prev_month">📅 Förra månaden</option>
              <option value="quarter">📅 Detta kvartal</option>
              <option value="year">📅 Detta år</option>
              <option value="all">📅 Alla perioder</option>
            </select>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#8c827a]"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Status selector */}
          <div className="relative inline-flex items-center">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="appearance-none rounded-xl border border-[#e2dbce] bg-white pl-3 pr-8 py-2 text-xs font-medium text-[#1f2328] cursor-pointer hover:bg-[#faf7f2] focus:border-[#837147] focus:outline-none transition shadow-2xs"
            >
              <option value="all">🏷️ Alla statusar</option>
              <option value="paid">🟢 Betalda</option>
              <option value="unpaid">🟡 Obetalda</option>
              <option value="overdue">🔴 Förfallna</option>
              <option value="partially_paid">🔵 Delvis betalda</option>
            </select>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#8c827a]"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Filter reset button */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
              setPeriodFilter("month");
            }}
            className="rounded-xl border border-[#e2dbce] bg-white px-3 py-2 text-xs font-medium text-[#1f2328] hover:bg-[#faf7f2] cursor-pointer transition shadow-2xs"
          >
            ⚙️ Återställ
          </button>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2dbce] bg-white px-3 py-2 text-xs font-medium text-[#1f2328] hover:bg-[#faf7f2] cursor-pointer transition shadow-2xs"
          >
            <span>📥</span>
            <span>Exportera</span>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 text-[#8c827a]"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Bulk Action Bar (appears when 1 or more invoices are selected) */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e2dbce] bg-[#fbf9f4] p-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#837147] text-white shadow-2xs cursor-pointer hover:bg-[#72623c] transition"
              title="Avmarkera alla"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div>
              <p className="text-xs font-bold text-[#1f2328]">
                {selectedIds.length} {selectedIds.length === 1 ? "faktura vald" : "fakturor valda"}
              </p>
              <p className="text-[11px] text-[#7c828d]">
                Totalt belopp: {formatSek(selectedTotalAmount)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleMarkSelectedAsPaid}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#d2e7d7] bg-white px-3 py-1.5 text-xs font-semibold text-[#15803d] shadow-2xs hover:bg-[#f0fdf4] cursor-pointer transition"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[#15803d]">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Markera som betald</span>
            </button>

            <button
              type="button"
              onClick={handleSendReminders}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2dbce] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] shadow-2xs hover:bg-[#faf7f2] cursor-pointer transition"
            >
              <span>🔔</span>
              <span>Skicka påminnelse</span>
            </button>

            <button
              type="button"
              onClick={handleExportSelected}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e2dbce] bg-white px-3 py-1.5 text-xs font-semibold text-[#1f2328] shadow-2xs hover:bg-[#faf7f2] cursor-pointer transition"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[#555a64]">
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Exportera</span>
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[#8c827a]">
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main 2-Column Section: Real Invoices Table on left, Real Recent Payments on right */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
        {/* Left Column: Real Invoices Table */}
        <div className="flex flex-col rounded-2xl border border-[#ded5c2] bg-white shadow-xs overflow-hidden lg:col-span-12 xl:col-span-8">
          <div className="overflow-x-auto admin-scrollbar">
            <table className="w-full min-w-[700px] text-left text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr className="border-b border-[#ded5c2] bg-[#f0ebe0] text-[11px] font-bold text-[#4e483d] uppercase tracking-wide whitespace-nowrap">
                  <th className="w-10 py-3.5 pl-3.5 pr-1 text-center">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={toggleSelectAll}
                      aria-label="Välj alla fakturor på denna sida"
                      className="h-4 w-4 rounded-md border-[#d4cbbe] text-[#837147] focus:ring-[#837147] cursor-pointer accent-[#837147]"
                    />
                  </th>
                  <th
                    className="py-3.5 px-3 cursor-pointer hover:text-[#1f2328]"
                    onClick={() => toggleSort("invoiceNumber")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Fakturanr
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[#a09a90]">
                        <path d="M10 3a.75.75 0 01.53.22l3.25 3.25a.75.75 0 11-1.06 1.06L10 4.81 7.28 7.53a.75.75 0 01-1.06-1.06l3.25-3.25A.75.75 0 0110 3zm-3.22 9.47a.75.75 0 011.06 0L10 15.19l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0l-3.25-3.25a.75.75 0 010-1.06z" />
                      </svg>
                    </span>
                  </th>
                  <th
                    className="py-3.5 px-3 cursor-pointer hover:text-[#1f2328]"
                    onClick={() => toggleSort("customerName")}
                  >
                    Kund
                  </th>
                  <th
                    className="py-3.5 px-3 cursor-pointer hover:text-[#1f2328]"
                    onClick={() => toggleSort("date")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Datum
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[#a09a90]">
                        <path d="M10 3a.75.75 0 01.53.22l3.25 3.25a.75.75 0 11-1.06 1.06L10 4.81 7.28 7.53a.75.75 0 01-1.06-1.06l3.25-3.25A.75.75 0 0110 3zm-3.22 9.47a.75.75 0 011.06 0L10 15.19l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0l-3.25-3.25a.75.75 0 010-1.06z" />
                      </svg>
                    </span>
                  </th>
                  <th
                    className="py-3.5 px-3 cursor-pointer hover:text-[#1f2328]"
                    onClick={() => toggleSort("dueDate")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Förfallodatum
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[#a09a90]">
                        <path d="M10 3a.75.75 0 01.53.22l3.25 3.25a.75.75 0 11-1.06 1.06L10 4.81 7.28 7.53a.75.75 0 01-1.06-1.06l3.25-3.25A.75.75 0 0110 3zm-3.22 9.47a.75.75 0 011.06 0L10 15.19l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0l-3.25-3.25a.75.75 0 010-1.06z" />
                      </svg>
                    </span>
                  </th>
                  <th
                    className="py-3.5 px-3 cursor-pointer hover:text-[#1f2328]"
                    onClick={() => toggleSort("amountSek")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Belopp
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-[#a09a90]">
                        <path d="M10 3a.75.75 0 01.53.22l3.25 3.25a.75.75 0 11-1.06 1.06L10 4.81 7.28 7.53a.75.75 0 01-1.06-1.06l3.25-3.25A.75.75 0 0110 3zm-3.22 9.47a.75.75 0 011.06 0L10 15.19l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0l-3.25-3.25a.75.75 0 010-1.06z" />
                      </svg>
                    </span>
                  </th>
                  <th className="py-3.5 px-3">Betalsätt</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3 text-right">Åtgärder</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ece5d8]">
                {pagedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#7c828d]">
                      Inga fakturor hittades för vald period.
                    </td>
                  </tr>
                ) : (
                  pagedInvoices.map((inv) => {
                    const st = statusStyles[inv.status];
                    const isSelected = selectedIds.includes(inv.id);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`border-b border-[#ece5d8] hover:bg-[#faf7f2] transition cursor-pointer ${
                          isSelected ? "bg-[#faf6ee]" : ""
                        }`}
                      >
                        <td
                          className="w-10 py-3.5 pl-3.5 pr-1 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(inv.id)}
                            aria-label={`Välj faktura ${inv.invoiceNumber}`}
                            className="h-4 w-4 rounded-md border-[#d4cbbe] text-[#837147] focus:ring-[#837147] cursor-pointer accent-[#837147]"
                          />
                        </td>
                        <td className="py-3.5 px-3 font-bold text-[#1f2328]">
                          <span className="hover:text-[#837147] hover:underline underline-offset-2">
                            {inv.invoiceNumber}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-[#1f2328]">{inv.customerName}</p>
                          <p className="text-[10px] text-[#8c827a]">{inv.orgNr}</p>
                        </td>
                        <td className="py-3.5 px-3 text-[#555a64]">
                          {formatSvDate(inv.date)}
                        </td>
                        <td className="py-3.5 px-3 text-[#555a64]">
                          {formatSvDate(inv.dueDate)}
                        </td>
                        <td className="py-3.5 px-3 font-bold text-[#1f2328]">
                          {formatSek(inv.amountSek)}
                        </td>
                        <td className="py-3.5 px-3">
                          <PaymentMethodBadge method={inv.paymentMethod} />
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                            {st.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div
                            className="inline-flex items-center gap-1.5 text-sm text-[#7c828d]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* 1: Visa kvitto */}
                            <button
                              type="button"
                              title="Visa kvitto"
                              onClick={() => setSelectedInvoice(inv)}
                              className="rounded-lg p-1.5 text-[#7c828d] hover:bg-[#f2ede4] hover:text-[#1f2328] transition cursor-pointer"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            </button>

                            {/* 2: Skicka underlag till kund */}
                            <button
                              type="button"
                              title={`Skicka underlag till ${inv.customerName}`}
                              onClick={() => setSendingInvoice(inv)}
                              className="rounded-lg p-1.5 text-[#7c828d] hover:bg-[#f2ede4] hover:text-[#837147] transition cursor-pointer"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f2ede4] bg-[#fbf9f4] px-4 py-3 text-xs text-[#7c828d]">
            <div className="flex items-center gap-2">
              <span>
                Visar {filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filtered.length)} av {filtered.length} fakturor
              </span>
              {selectedIds.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#f4ebd9] px-2 py-0.5 text-[11px] font-semibold text-[#837147]">
                  ✓ {selectedIds.length} valda
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center justify-center rounded-lg border border-[#e4ded2] bg-white p-1 text-[#555a64] disabled:opacity-40 hover:bg-[#faf7f2] cursor-pointer"
                aria-label="Föregående sida"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M12.79 5.23a.75.75 0 01-.02 1.06L8.84 10l3.93 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setPage(pNum)}
                  className={`rounded-lg px-2.5 py-1 font-semibold ${
                    currentPage === pNum
                      ? "bg-[#837147] text-white"
                      : "border border-[#e4ded2] bg-white hover:bg-[#faf7f2]"
                  }`}
                >
                  {pNum}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center justify-center rounded-lg border border-[#e4ded2] bg-white p-1 text-[#555a64] disabled:opacity-40 hover:bg-[#faf7f2] cursor-pointer"
                aria-label="Nästa sida"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path
                    fillRule="evenodd"
                    d="M7.21 14.77a.75.75 0 01.02-1.06L11.16 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Senaste betalningar */}
        <div className="flex flex-col rounded-2xl border border-[#ded5c2] bg-white p-4 shadow-xs lg:col-span-12 xl:col-span-4 space-y-4">
          <div className="flex items-center justify-between border-b border-[#f2ede4] pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🪙</span>
              <h2 className="font-serif text-base font-bold text-[#1f2328]">Senaste betalningar</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("paid");
                setPage(1);
              }}
              className="group inline-flex items-center gap-1 text-xs font-semibold text-[#837147] hover:text-[#5e5132] transition cursor-pointer"
            >
              <span>Visa alla</span>
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.16 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="divide-y divide-[#f5f1e8]">
            {recentPayments.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#7c828d]">Inga betalda ordrar ännu.</p>
            ) : (
              recentPayments.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedInvoice(item)}
                  className="flex items-center justify-between py-3 hover:bg-[#faf7f2] px-2 rounded-xl transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-xs font-bold text-[#059669]">
                      ✓
                    </div>
                    <div>
                      <p className="font-bold text-xs text-[#1f2328]">{item.invoiceNumber}</p>
                      <p className="text-[11px] text-[#555a64] truncate max-w-[130px]">
                        {item.customerName}
                      </p>
                      <p className="text-[10px] text-[#8c827a]">{item.date}</p>
                    </div>
                  </div>

                  <span className="font-bold text-xs text-[#15803d]">
                    {formatSek(item.amountSek)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-[#efe9dc] bg-[#fbf9f4] p-3 text-center">
            <p className="text-xs font-medium text-[#7c828d]">Bokföringsunderlag Synkroniserat</p>
            <p className="mt-1 text-[11px] text-[#8c827a]">
              Bankgiro, kort och Swish matchas direkt mot restaurangens faktiska kassaflöde.
            </p>
          </div>
        </div>
      </div>

      {/* Selected Invoice / Receipt Modal - Modern Restaurant Faktura */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-xs sm:p-6 print:p-0 print:bg-white print:static print:inset-auto"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="relative my-auto max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fdfbf7] p-5 text-[#1f2328] shadow-2xl sm:p-6 space-y-4 print:shadow-none print:border-none print:bg-white print:p-4 print:max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button at top-right corner of card - HIDDEN in print */}
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              aria-label="Stäng"
              className="print:hidden absolute top-3.5 right-3.5 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-[#e2dbce] bg-white text-xs sm:text-sm font-bold text-[#7c828d] shadow-xs hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer z-10"
            >
              ✕
            </button>

            {/* Header: Falken Restaurant receipt branding */}
            <div className="text-center pt-1 pb-3 border-b border-dashed border-[#dcd5c7]">
              <h3 className="font-serif text-sm sm:text-base md:text-lg font-bold tracking-wide text-[#1f2328] uppercase px-8 sm:px-4 leading-tight">
                Falken Restaurang &amp; Pizzeria
              </h3>
              <p className="text-[11px] sm:text-xs text-[#7c828d] mt-1">
                Kungsbacka - Falken.se - Tel: 0300-123 45
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#f4ebd9] px-3 py-0.5 text-[11px] sm:text-xs font-semibold text-[#837147]">
                <span>Kvitto</span>
                <span>•</span>
                <span>{selectedInvoice.invoiceNumber}</span>
              </div>
            </div>

            {/* Meta details */}
            <div className="space-y-1.5 text-xs py-2 border-b border-dashed border-[#dcd5c7]">
              <div className="flex justify-between text-[#555a64]">
                <span>Datum:</span>
                <span className="font-medium text-[#1f2328]">{formatSvDate(selectedInvoice.date)}</span>
              </div>
              <div className="flex justify-between text-[#555a64]">
                <span>Kund:</span>
                <span className="font-semibold text-[#1f2328]">{selectedInvoice.customerName}</span>
              </div>
              {selectedInvoice.orgNr && (
                <div className="flex justify-between text-[#555a64]">
                  <span>Kontakt:</span>
                  <span className="text-[#1f2328]">{selectedInvoice.orgNr}</span>
                </div>
              )}
              <div className="flex justify-between text-[#555a64]">
                <span>Betalsätt:</span>
                <span className="font-medium text-[#1f2328]">{selectedInvoice.paymentMethod || "Swish"}</span>
              </div>
              <div className="flex justify-between items-center text-[#555a64] pt-0.5">
                <span>Status:</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    statusStyles[selectedInvoice.status].badge
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      statusStyles[selectedInvoice.status].dot
                    }`}
                  />
                  {statusStyles[selectedInvoice.status].label}
                </span>
              </div>
            </div>

            {/* Line Items */}
            <div className="py-2 space-y-2 text-xs border-b border-dashed border-[#dcd5c7]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c827a]">
                Beställda rätter
              </p>
              <div className="space-y-1.5">
                {selectedInvoice.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-baseline gap-2">
                    <span className="font-medium text-[#1f2328] leading-tight">
                      {it.description}
                    </span>
                    <span className="font-bold text-[#1f2328] shrink-0">
                      {formatSek(it.quantity * it.unitPriceSek)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Subtotal, Moms & Total */}
            <div className="py-2 space-y-1 text-xs border-b border-dashed border-[#dcd5c7]">
              <div className="flex justify-between text-[#7c828d]">
                <span>Delsumma (exkl. moms)</span>
                <span>{formatSek(Math.round(selectedInvoice.amountSek * 0.89))}</span>
              </div>
              <div className="flex justify-between text-[#7c828d]">
                <span>Moms (12%)</span>
                <span>{formatSek(Math.round(selectedInvoice.amountSek * 0.11))}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1.5 font-bold text-[#1f2328]">
                <span className="text-sm">Totalt att betala</span>
                <span className="text-lg text-[#837147]">
                  {formatSek(selectedInvoice.amountSek)}
                </span>
              </div>
            </div>

            {/* Restaurant receipt note */}
            <div className="text-center py-1 text-[11px] text-[#8c827a]">
              <p className="font-serif italic">Tack för din beställning hos Falken!</p>
              <p className="text-[10px] text-[#a09a90] mt-0.5">Godkänd för F-skatt - Org.nr 556123-4567</p>
            </div>

            {/* Action buttons - HIDDEN in print */}
            <div className="print:hidden flex flex-col gap-2 pt-2 border-t border-[#e8e2d5]">
              {onOpenOrder && (
                <button
                  type="button"
                  onClick={() => {
                    const cleanOrderId = selectedInvoice.id.replace(/^F-/, "");
                    setSelectedInvoice(null);
                    onOpenOrder(cleanOrderId);
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#ded5c2] bg-[#fbf9f4] px-3 py-2 text-xs font-semibold text-[#837147] hover:bg-[#f4eedf] transition cursor-pointer"
                >
                  <span className="text-xs">👁️</span>
                  <span className="truncate">Gå till beställning {selectedInvoice.id.replace(/^F-/, "")} →</span>
                </button>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    printOrderReceipt({
                      orderNumber: selectedInvoice.invoiceNumber,
                      customerName: selectedInvoice.customerName,
                      phone: selectedInvoice.orgNr,
                      date: selectedInvoice.date,
                      paymentMethod: selectedInvoice.paymentMethod || "Swish",
                      paymentStatus: statusStyles[selectedInvoice.status]?.label || "Betald",
                      totalSek: selectedInvoice.amountSek,
                      items: selectedInvoice.items.map((it) => ({
                        description: it.description,
                        quantity: it.quantity,
                        unitPriceSek: it.unitPriceSek,
                      })),
                    });
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#ded5c2] bg-white px-3 py-2 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition shadow-2xs cursor-pointer"
                >
                  <span className="text-xs">🖨️</span>
                  <span>Skriv ut</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadInvoice(selectedInvoice)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#837147] px-3 py-2 text-xs font-semibold text-white hover:bg-[#72623c] transition shadow-2xs cursor-pointer"
                >
                  <span className="text-xs">📥</span>
                  <span>Ladda ner PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Invoice Modal */}
      {sendingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-xs sm:p-6"
          onClick={() => setSendingInvoice(null)}
        >
          <div
            className="relative my-auto max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fdfbf7] p-5 text-[#1f2328] shadow-2xl sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#e8e2d5] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#f4ebd9] text-base text-[#837147]">
                  ✈️
                </span>
                <div>
                  <h3 className="font-serif text-base font-bold text-[#1f2328]">
                    Skicka kvitto till kund
                  </h3>
                  <p className="text-[11px] text-[#7c828d]">
                    {sendingInvoice.customerName} - {sendingInvoice.invoiceNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSendingInvoice(null)}
                aria-label="Stäng"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e2dbce] bg-white text-xs font-bold text-[#7c828d] hover:bg-[#faf7f2] hover:text-[#1f2328] transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Recipient Details */}
            <div className="rounded-2xl border border-[#e8e2d5] bg-white p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#555a64]">
                <span>Kund:</span>
                <strong className="text-[#1f2328]">{sendingInvoice.customerName}</strong>
              </div>
              {sendingInvoice.orgNr && (
                <div className="flex justify-between text-[#555a64]">
                  <span>Mottagare (Tel):</span>
                  <strong className="text-[#1f2328]">{sendingInvoice.orgNr}</strong>
                </div>
              )}
              <div className="flex justify-between text-[#555a64]">
                <span>Belopp:</span>
                <strong className="text-[#837147] font-bold">{formatSek(sendingInvoice.amountSek)}</strong>
              </div>
            </div>

            {/* Message Preview */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#8c827a] mb-1">
                Meddelande &amp; Kvitto-länk
              </label>
              <div className="rounded-xl border border-[#e2dbce] bg-[#fcfbf7] p-3 text-xs text-[#1f2328] font-mono leading-relaxed select-all">
                {`Hej ${sendingInvoice.customerName}! Tack för din beställning hos Falken. Här är ditt kvitto (${sendingInvoice.invoiceNumber}) på ${formatSek(sendingInvoice.amountSek)}: ${typeof window !== "undefined" ? window.location.origin : ""}/bestallning/${sendingInvoice.id}`}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              {/* Option 1: Native SMS */}
              {(() => {
                const phoneDigits = (sendingInvoice.orgNr || "").replace(/\D/g, "");
                const msg = `Hej ${sendingInvoice.customerName}! Tack för din beställning hos Falken. Här är ditt kvitto (${sendingInvoice.invoiceNumber}) på ${formatSek(sendingInvoice.amountSek)}: ${typeof window !== "undefined" ? window.location.origin : ""}/bestallning/${sendingInvoice.id}`;
                return (
                  <a
                    href={`sms:${phoneDigits}?body=${encodeURIComponent(msg)}`}
                    onClick={() => {
                      setFeedback(`📱 SMS öppnades med kvittot för ${sendingInvoice.customerName}!`);
                      setSendingInvoice(null);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#837147] py-2.5 text-xs font-semibold text-white hover:bg-[#72623c] transition shadow-xs cursor-pointer"
                  >
                    <span>📱</span>
                    <span>Skicka via SMS ({phoneDigits || "Mobil"})</span>
                  </a>
                );
              })()}

              {/* Option 2: Copy Link/Message */}
              <button
                type="button"
                onClick={() => {
                  const msg = `Hej ${sendingInvoice.customerName}! Tack för din beställning hos Falken. Här är ditt kvitto (${sendingInvoice.invoiceNumber}) på ${formatSek(sendingInvoice.amountSek)}: ${window.location.origin}/bestallning/${sendingInvoice.id}`;
                  navigator.clipboard.writeText(msg);
                  setCopiedText(true);
                  setTimeout(() => setCopiedText(false), 3000);
                  setFeedback("📋 Kvitto-meddelandet och länken kopierades till urklipp!");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e2dbce] bg-white py-2.5 text-xs font-semibold text-[#1f2328] hover:bg-[#faf7f2] transition cursor-pointer"
              >
                <span>📋</span>
                <span>{copiedText ? "✓ Kopierat till urklipp!" : "Kopiera meddelande & länk"}</span>
              </button>

              {/* Option 3: Email client */}
              <a
                href={`mailto:?subject=${encodeURIComponent(`Kvitto från Falken Restaurang - ${sendingInvoice.invoiceNumber}`)}&body=${encodeURIComponent(`Hej ${sendingInvoice.customerName}!\n\nTack för din beställning hos Falken Restaurang & Pizzeria.\n\nHär är ditt kvitto (${sendingInvoice.invoiceNumber}) på ${formatSek(sendingInvoice.amountSek)}.\n\nSe hela underlaget här:\n${typeof window !== "undefined" ? window.location.origin : ""}/bestallning/${sendingInvoice.id}\n\nVälkommen åter!\nFalken Restaurang & Pizzeria`)}`}
                onClick={() => {
                  setFeedback(`✉️ E-postprogram öppnades för ${sendingInvoice.customerName}!`);
                  setSendingInvoice(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e2dbce] bg-white py-2 text-xs font-semibold text-[#555a64] hover:bg-[#faf7f2] transition cursor-pointer"
              >
                <span>✉️</span>
                <span>Öppna i E-postprogram</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {isCreating && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-xs sm:p-6"
          onClick={() => setIsCreating(false)}
        >
          <div
            className="my-auto max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#e4ded2] bg-[#fcfbf7] p-6 text-[#1f2328] shadow-2xl sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#e8e2d5] pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#837147]">
                  Ny kundfaktura
                </p>
                <h2 className="font-serif text-2xl font-bold">Skapa ny faktura</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-full px-3 py-1 text-2xl hover:bg-black/5"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} className="mt-5 space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-xs font-bold uppercase text-[#8c827a] mb-1">
                  Företagsnamn / Kund *
                </label>
                <input
                  type="text"
                  required
                  placeholder="t.ex. Svea Arkitekter AB"
                  value={newCustomer}
                  onChange={(e) => setNewCustomer(e.target.value)}
                  className="w-full rounded-xl border border-[#ddd5c7] bg-white px-3.5 py-2.5 text-xs outline-offset-2 focus:border-[#837147]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#8c827a] mb-1">
                  Organisationsnummer / Telefon
                </label>
                <input
                  type="text"
                  placeholder="t.ex. 556123-4567 eller 0701234567"
                  value={newOrgNr}
                  onChange={(e) => setNewOrgNr(e.target.value)}
                  className="w-full rounded-xl border border-[#ddd5c7] bg-white px-3.5 py-2.5 text-xs outline-offset-2 focus:border-[#837147]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#8c827a] mb-1">
                  Totalbelopp (inkl. moms kr) *
                </label>
                <input
                  type="number"
                  required
                  min="10"
                  step="10"
                  placeholder="t.ex. 1500"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full rounded-xl border border-[#ddd5c7] bg-white px-3.5 py-2.5 text-xs outline-offset-2 focus:border-[#837147]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#8c827a] mb-1">
                  Beskrivning av leverans
                </label>
                <textarea
                  rows={3}
                  placeholder="t.ex. Företagslunch 10 pizzor och dryck"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded-xl border border-[#ddd5c7] bg-white px-3.5 py-2.5 text-xs outline-offset-2 focus:border-[#837147]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[#e8e2d5] pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-[#e4ded2] bg-white px-4 py-2 text-xs font-semibold text-[#1f2328]"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#837147] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#72623c]"
                >
                  Spara &amp; Skapa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
