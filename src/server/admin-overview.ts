import { OrderModel, PaymentModel } from "./models/order.ts";
import { RestaurantSettingsModel } from "./models/restaurant-settings.ts";
import { manualOverrideForOrderingToggle } from "../lib/hours.ts";
import { adminVisibleOrderFilter } from "./admin-orders.ts";

const ZONE = "Europe/Stockholm";
const activeStatuses = ["CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP"] as const;
const operationalStatuses = ["CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"] as const;

export const overviewPeriod = ["today", "yesterday", "week", "month", "year"] as const;
export type OverviewPeriod = (typeof overviewPeriod)[number];

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour) };
}

function localDateUtc(date: Date) {
  const { year, month, day } = localParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

function addLocalDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function stockholmMidnight(date: Date) {
  const { year, month, day } = localParts(date);
  const pretendUtc = Date.UTC(year, month - 1, day);
  const represented = localParts(new Date(pretendUtc));
  const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour);
  // Convert a Stockholm wall-clock midnight to an absolute instant. The correction is repeated for DST.
  let result = pretendUtc - (representedAsUtc - pretendUtc);
  for (let i = 0; i < 2; i++) {
    const actual = localParts(new Date(result));
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour);
    result += pretendUtc - actualAsUtc;
  }
  return new Date(result);
}

function dateKey(date: Date, granularity: "hour" | "day" | "month") {
  const p = localParts(date);
  const datePart = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (granularity === "hour") return `${datePart}-${String(p.hour).padStart(2, "0")}`;
  if (granularity === "month") return `${p.year}-${String(p.month).padStart(2, "0")}`;
  return datePart;
}

function formatDay(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ZONE, ...options }).format(date);
}

function periodRange(period: OverviewPeriod, now: Date) {
  const today = localDateUtc(now);
  let first: Date;
  let endExclusive: Date;
  let granularity: "hour" | "day" | "month" = "day";

  if (period === "today" || period === "yesterday") {
    const day = period === "today" ? today : addLocalDays(today, -1);
    first = day;
    endExclusive = addLocalDays(day, 1);
    granularity = "hour";
  } else if (period === "week") {
    const weekday = today.getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    first = addLocalDays(today, -daysSinceMonday);
    endExclusive = addLocalDays(first, 7);
  } else if (period === "month") {
    first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  } else {
    first = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    endExclusive = new Date(Date.UTC(today.getUTCFullYear() + 1, 0, 1));
    granularity = "month";
  }

  const start = stockholmMidnight(first);
  const end = stockholmMidnight(endExclusive);
  return { start, end, first, endExclusive, granularity };
}

function bucketFormat(granularity: "hour" | "day" | "month") {
  return granularity === "hour" ? "%Y-%m-%d-%H" : granularity === "month" ? "%Y-%m" : "%Y-%m-%d";
}

function chartBuckets(period: OverviewPeriod, range: ReturnType<typeof periodRange>) {
  const buckets: {
    key: string;
    label: string;
    orders: number;
    grossRevenueSek: number;
    refundedSek: number;
    netRevenueSek: number;
    revenueSek: number;
  }[] = [];
  if (range.granularity === "hour") {
    for (let hour = 0; hour < 24; hour++) {
      const instant = new Date(range.start.getTime() + hour * 3_600_000);
      buckets.push({
        key: dateKey(instant, "hour"),
        label: `${String(hour).padStart(2, "0")}:00`,
        orders: 0,
        grossRevenueSek: 0,
        refundedSek: 0,
        netRevenueSek: 0,
        revenueSek: 0,
      });
    }
  } else if (range.granularity === "month") {
    const year = range.first.getUTCFullYear();
    for (let month = 0; month < 12; month++) {
      const instant = new Date(Date.UTC(year, month, 1, 12));
      buckets.push({
        key: dateKey(instant, "month"),
        label: formatDay(instant, { month: "short" }),
        orders: 0,
        grossRevenueSek: 0,
        refundedSek: 0,
        netRevenueSek: 0,
        revenueSek: 0,
      });
    }
  } else {
    const days = Math.round((range.endExclusive.getTime() - range.first.getTime()) / 86_400_000);
    for (let day = 0; day < days; day++) {
      const instant = new Date(range.first.getTime() + day * 86_400_000 + 12 * 3_600_000);
      const label = period === "week"
        ? formatDay(instant, { weekday: "short", day: "numeric", month: "short" })
        : formatDay(instant, { day: "numeric" });
      buckets.push({
        key: dateKey(instant, "day"),
        label,
        orders: 0,
        grossRevenueSek: 0,
        refundedSek: 0,
        netRevenueSek: 0,
        revenueSek: 0,
      });
    }
  }
  return buckets;
}

export type OrderingUpdateOptions = {
  enabled?: boolean;
  targetState?: boolean;
  manualOverride?: "open" | "closed" | null;
};

export function resolveOrderingUpdate(options: boolean | OrderingUpdateOptions): {
  onlineOrderingEnabled?: boolean;
  manualOverride?: "open" | "closed" | null;
} {
  if (typeof options === "boolean") {
    return options
      ? { onlineOrderingEnabled: true, manualOverride: manualOverrideForOrderingToggle(true) }
      : { manualOverride: manualOverrideForOrderingToggle(false) };
  }

  const update: {
    onlineOrderingEnabled?: boolean;
    manualOverride?: "open" | "closed" | null;
  } = {};
  if (options.enabled !== undefined) update.onlineOrderingEnabled = options.enabled;
  if (options.targetState !== undefined) {
    update.manualOverride = manualOverrideForOrderingToggle(options.targetState);
    if (options.targetState && options.enabled === undefined) update.onlineOrderingEnabled = true;
  } else if (options.manualOverride !== undefined) {
    update.manualOverride = options.manualOverride;
    if (options.manualOverride === "open" && options.enabled === undefined) update.onlineOrderingEnabled = true;
  }
  return update;
}

export async function getRestaurantSettings(): Promise<{
  onlineOrderingEnabled: boolean;
  manualOverride: "open" | "closed" | null;
}> {
  const settings = await RestaurantSettingsModel.findById("restaurant")
    .select("onlineOrderingEnabled manualOverride")
    .lean();
  return {
    onlineOrderingEnabled: settings?.onlineOrderingEnabled ?? true,
    manualOverride: settings?.manualOverride ?? null,
  };
}

export async function setOnlineOrdering(options: boolean | OrderingUpdateOptions, staffId: string) {
  const update = resolveOrderingUpdate(options);
  const setFields = { ...update, updatedBy: staffId };

  const settings = await RestaurantSettingsModel.findOneAndUpdate(
    { _id: "restaurant" },
    { $set: setFields },
    { upsert: true, new: true, runValidators: true, projection: { onlineOrderingEnabled: 1, manualOverride: 1 } },
  ).lean();

  return {
    onlineOrderingEnabled: settings?.onlineOrderingEnabled ?? update.onlineOrderingEnabled ?? true,
    manualOverride: settings?.manualOverride ?? update.manualOverride ?? null,
  };
}

export type FinancialMetrics = {
  grossRevenueSek: number;
  refundedSek: number;
  netRevenueSek: number;
  revenueSek: number; // backward-compatible alias for netRevenueSek
  orders: number;
  activeOrders: number;
  paidStripeOrders: number;
  paidSwishOrders: number;
  paidOnlineOrders: number;
  collectedCashOrders: number;
  collectedCardTerminalOrders: number;
  unpaidOrders: number;
  unpaidSek: number;
  averageOrderSek: number;
  reviewCount: number;
  averageRating: number | null;
  refundBreakdown: {
    totalRefundedSek: number;
    adminAttestedSek: number;
    providerConfirmedSek: number;
    adminAttestedCount: number;
    providerConfirmedCount: number;
    refundCount: number;
  };
  reconciliation: {
    status: "clean" | "discrepancy_detected";
    discrepancies: Array<{ orderId: string; type: string; detail: string }>;
    verifiedGrossSalesCount: number;
    unverifiedGrossSalesCount: number;
  };
};

export async function getFinancialReport(rangeInput: { from: Date; to: Date; timeZone?: string }) {
  const from = rangeInput.from;
  const to = rangeInput.to;

  const [electronicOrders, onSiteOrders, refundOrders] = await Promise.all([
    OrderModel.find({
      paymentMethod: { $in: ["card", "swish"] },
      paymentStatus: { $in: ["paid", "refunded"] },
      paidAt: { $gte: from, $lt: to },
    })
      .select("publicId totalSek paymentMethod paymentProvider paymentStatus paidAt paymentId fulfillmentStatus items totalRefundedSek")
      .lean(),
    OrderModel.find({
      paymentMethod: "pay_on_pickup",
      paymentStatus: { $in: ["paid", "refunded"] },
      "onSiteCollection.collectedAt": { $gte: from, $lt: to },
    })
      .select("publicId totalSek paymentMethod paymentStatus onSiteCollection fulfillmentStatus items")
      .lean(),
    OrderModel.find({
      totalRefundedSek: { $gt: 0 },
      refundRecord: { $exists: true },
      "refundRecord.recordedAt": { $gte: from, $lt: to },
    })
      .select("publicId totalRefundedSek refundRecord")
      .lean(),
  ]);

  // Payment reconciliation check
  const paymentIds = electronicOrders
    .map((o) => o.paymentId)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));

  const paymentRecords = paymentIds.length > 0
    ? await PaymentModel.find({ _id: { $in: paymentIds } })
        .select("_id orderId status amountSek provider refundedSek")
        .lean()
    : [];
  const paymentMap = new Map(paymentRecords.map((p) => [String(p._id), p]));

  const discrepancies: Array<{ orderId: string; type: string; detail: string }> = [];
  let verifiedGrossSalesCount = 0;
  let unverifiedGrossSalesCount = 0;

  type GrossSaleItem = {
    publicId: string;
    totalSek: number;
    paymentMethod: string;
    provider?: string;
    onSiteMethod?: string;
    eventAt: Date;
  };
  const grossSalesMap = new Map<string, GrossSaleItem>();

  let paidStripeOrders = 0;
  let paidSwishOrders = 0;
  let collectedCashOrders = 0;
  let collectedCardTerminalOrders = 0;

  for (const ord of electronicOrders) {
    let isVerified = false;

    if (!ord.paymentId) {
      discrepancies.push({
        orderId: ord.publicId,
        type: "missing_payment_id",
        detail: "Electronic order is marked paid/refunded but lacks paymentId reference",
      });
      unverifiedGrossSalesCount++;
    } else {
      const p = paymentMap.get(String(ord.paymentId));
      if (!p) {
        discrepancies.push({
          orderId: ord.publicId,
          type: "missing_payment_record",
          detail: `Referenced Payment ${String(ord.paymentId)} was not found in PaymentModel`,
        });
        unverifiedGrossSalesCount++;
      } else if (String(p.orderId) !== String(ord._id)) {
        discrepancies.push({
          orderId: ord.publicId,
          type: "order_id_mismatch",
          detail: `Payment references orderId ${String(p.orderId)}, does not match order _id ${String(ord._id)}`,
        });
        unverifiedGrossSalesCount++;
      } else if (p.amountSek !== ord.totalSek) {
        discrepancies.push({
          orderId: ord.publicId,
          type: "payment_amount_mismatch",
          detail: `Payment amount (${p.amountSek} kr) does not match order total (${ord.totalSek} kr)`,
        });
        unverifiedGrossSalesCount++;
      } else if (
        (ord.paymentMethod === "card" && p.provider !== "stripe") ||
        (ord.paymentMethod === "swish" && p.provider !== "swish") ||
        (ord.paymentProvider && ord.paymentProvider !== p.provider)
      ) {
        discrepancies.push({
          orderId: ord.publicId,
          type: "provider_mismatch",
          detail: `Payment provider (${p.provider}) does not match order payment method/provider (${ord.paymentMethod}/${ord.paymentProvider ?? "none"})`,
        });
        unverifiedGrossSalesCount++;
      } else {
        // Explicit, exhaustive financial-state validation:
        const orderRefundedSek = ord.totalRefundedSek ?? 0;
        const paymentRefundedSek = p.refundedSek ?? 0;

        // CASE A — ORDER PAID, NOT REFUNDED
        const isCaseA =
          ord.paymentStatus === "paid" &&
          orderRefundedSek === 0 &&
          p.status === "paid" &&
          paymentRefundedSek === 0;

        // CASE B — ORDER FULLY REFUNDED
        const isCaseB =
          ord.paymentStatus === "refunded" &&
          orderRefundedSek === ord.totalSek &&
          p.status === "refunded" &&
          paymentRefundedSek === orderRefundedSek;

        if (isCaseA || isCaseB) {
          isVerified = true;
          verifiedGrossSalesCount++;
        } else {
          // Explicitly classify the discrepancy for clear reporting and auditing
          let discrepancyType = "inconsistent_payment_refund";
          let detail = `Inconsistent electronic payment state: order(paymentStatus=${ord.paymentStatus}, totalRefundedSek=${orderRefundedSek}, totalSek=${ord.totalSek}) vs payment(status=${p.status}, refundedSek=${paymentRefundedSek})`;

          if (p.status !== "paid" && p.status !== "refunded") {
            discrepancyType = "payment_status_mismatch";
            detail = `Payment status is ${p.status}, expected paid or refunded`;
          } else if (p.status !== ord.paymentStatus) {
            discrepancyType = "payment_status_mismatch";
            detail = `Payment status (${p.status}) does not match order paymentStatus (${ord.paymentStatus})`;
          } else if (orderRefundedSek !== paymentRefundedSek) {
            discrepancyType = "inconsistent_payment_refund";
            detail = `Payment refundedSek (${paymentRefundedSek} kr) does not match order totalRefundedSek (${orderRefundedSek} kr)`;
          } else if (ord.paymentStatus === "refunded" && orderRefundedSek !== ord.totalSek) {
            discrepancyType = "inconsistent_payment_refund";
            detail = `Order totalRefundedSek (${orderRefundedSek} kr) does not equal totalSek (${ord.totalSek} kr)`;
          } else if (ord.paymentStatus === "paid" && (orderRefundedSek !== 0 || paymentRefundedSek !== 0)) {
            discrepancyType = "inconsistent_payment_refund";
            detail = `Order is marked paid but has non-zero refund amounts: order=${orderRefundedSek} kr, payment=${paymentRefundedSek} kr`;
          }

          discrepancies.push({
            orderId: ord.publicId,
            type: discrepancyType,
            detail,
          });
          unverifiedGrossSalesCount++;
        }
      }
    }

    // CRITICAL: Only verified electronic orders with authoritative PaymentModel enter grossSalesMap
    if (isVerified && ord.paidAt) {
      grossSalesMap.set(ord.publicId, {
        publicId: ord.publicId,
        totalSek: ord.totalSek,
        paymentMethod: ord.paymentMethod,
        provider: ord.paymentProvider,
        eventAt: ord.paidAt,
      });

      if (ord.paymentMethod === "card" || ord.paymentProvider === "stripe") {
        paidStripeOrders++;
      } else if (ord.paymentMethod === "swish" || ord.paymentProvider === "swish") {
        paidSwishOrders++;
      }
    }
  }

  for (const ord of onSiteOrders) {
    if (!grossSalesMap.has(ord.publicId)) {
      const collAt = ord.onSiteCollection?.collectedAt;
      if (collAt) {
        const amt = ord.onSiteCollection?.amountSek ?? ord.totalSek;
        grossSalesMap.set(ord.publicId, {
          publicId: ord.publicId,
          totalSek: amt,
          paymentMethod: "pay_on_pickup",
          onSiteMethod: ord.onSiteCollection?.method,
          eventAt: collAt,
        });
        verifiedGrossSalesCount++;

        if (ord.onSiteCollection?.method === "cash") {
          collectedCashOrders++;
        } else if (ord.onSiteCollection?.method === "card_terminal") {
          collectedCardTerminalOrders++;
        }
      }
    }
  }

  const grossRevenueSek = Array.from(grossSalesMap.values()).reduce((sum, item) => sum + item.totalSek, 0);

  // Process refunds
  let refundedSek = 0;
  let adminAttestedSek = 0;
  let providerConfirmedSek = 0;
  let adminAttestedCount = 0;
  let providerConfirmedCount = 0;

  for (const ro of refundOrders) {
    const amt = ro.refundRecord?.amountSek ?? ro.totalRefundedSek ?? 0;
    refundedSek += amt;
    if (ro.refundRecord?.verificationTier === "provider_confirmed") {
      providerConfirmedSek += amt;
      providerConfirmedCount++;
    } else {
      adminAttestedSek += amt;
      adminAttestedCount++;
    }
  }

  const netRevenueSek = grossRevenueSek - refundedSek;

  return {
    grossRevenueSek,
    refundedSek,
    netRevenueSek,
    grossSalesMap,
    refundOrders,
    paidStripeOrders,
    paidSwishOrders,
    paidOnlineOrders: paidStripeOrders + paidSwishOrders,
    collectedCashOrders,
    collectedCardTerminalOrders,
    refundBreakdown: {
      totalRefundedSek: refundedSek,
      adminAttestedSek,
      providerConfirmedSek,
      adminAttestedCount,
      providerConfirmedCount,
      refundCount: refundOrders.length,
    },
    reconciliation: {
      status: (discrepancies.length === 0 ? "clean" : "discrepancy_detected") as "clean" | "discrepancy_detected",
      discrepancies,
      verifiedGrossSalesCount,
      unverifiedGrossSalesCount,
    },
  };
}

export async function getAdminOverview(period: OverviewPeriod, status = "ALL", now = new Date()) {
  const range = periodRange(period, now);
  const visibleOrderBase = adminVisibleOrderFilter(status);
  const createdRange = { createdAt: { $gte: range.start, $lt: range.end } };
  const inRangeVisible = { ...visibleOrderBase, ...createdRange };

  const [
    financialData,
    orderCount,
    activeCount,
    unpaidOrders,
    orderCreationBuckets,
    bestSellers,
    settings,
  ] = await Promise.all([
    getFinancialReport({ from: range.start, to: range.end }),
    OrderModel.countDocuments({ ...inRangeVisible, fulfillmentStatus: { $in: operationalStatuses } }),
    OrderModel.countDocuments({ ...inRangeVisible, fulfillmentStatus: { $in: activeStatuses } }),
    OrderModel.find({ ...inRangeVisible, paymentStatus: "unpaid" }).select("totalSek").lean(),
    OrderModel.aggregate([
      { $match: { ...visibleOrderBase, ...createdRange, fulfillmentStatus: { $in: operationalStatuses } } },
      { $group: { _id: { $dateToString: { format: bucketFormat(range.granularity), date: "$createdAt", timezone: ZONE } }, count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { ...visibleOrderBase, ...createdRange, fulfillmentStatus: { $in: operationalStatuses } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.productNameSnapshot", quantity: { $sum: "$items.quantity" } } },
      { $sort: { quantity: -1, _id: 1 } },
      { $limit: 5 },
    ]),
    getRestaurantSettings(),
  ]);

  const {
    grossRevenueSek,
    refundedSek,
    netRevenueSek,
    grossSalesMap,
    refundOrders,
    paidStripeOrders,
    paidSwishOrders,
    paidOnlineOrders,
    collectedCashOrders,
    collectedCardTerminalOrders,
    refundBreakdown,
    reconciliation,
  } = financialData;

  const buckets = chartBuckets(period, range);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

  for (const item of orderCreationBuckets as { _id: string; count: number }[]) {
    const bucket = byKey.get(item._id);
    if (bucket) bucket.orders = item.count;
  }

  for (const item of grossSalesMap.values()) {
    const key = dateKey(item.eventAt, range.granularity);
    const bucket = byKey.get(key);
    if (bucket) {
      bucket.grossRevenueSek += item.totalSek;
    }
  }

  for (const ro of refundOrders) {
    const refInstant = ro.refundRecord?.recordedAt;
    if (refInstant) {
      const key = dateKey(refInstant, range.granularity);
      const bucket = byKey.get(key);
      if (bucket) {
        const amt = ro.refundRecord?.amountSek ?? ro.totalRefundedSek ?? 0;
        bucket.refundedSek += amt;
      }
    }
  }

  for (const b of buckets) {
    b.netRevenueSek = b.grossRevenueSek - b.refundedSek;
    b.revenueSek = b.netRevenueSek;
  }

  const divider = orderCount > 0 ? orderCount : grossSalesMap.size;
  const averageSek = divider > 0 ? Math.round(grossRevenueSek / divider) : 0;

  const metrics: FinancialMetrics = {
    grossRevenueSek,
    refundedSek,
    netRevenueSek,
    revenueSek: netRevenueSek, // backward-compatible alias
    orders: orderCount,
    activeOrders: activeCount,
    paidStripeOrders,
    paidSwishOrders,
    paidOnlineOrders,
    collectedCashOrders,
    collectedCardTerminalOrders,
    unpaidOrders: unpaidOrders.length,
    unpaidSek: unpaidOrders.reduce((sum, order) => sum + order.totalSek, 0),
    averageOrderSek: averageSek,
    reviewCount: 0,
    averageRating: null,
    refundBreakdown,
    reconciliation,
  };

  return {
    period,
    range: { from: range.start.toISOString(), to: range.end.toISOString(), timeZone: ZONE },
    metrics,
    chart: buckets,
    bestSellers: (bestSellers as { _id: string; quantity: number }[]).map((item) => ({ name: item._id, quantity: item.quantity })),
    settings,
    definitions: {
      orders: "Operational orders created in Europe/Stockholm during the period.",
      grossRevenue: "Operational gross sales completed (paid electronic or collected pay-on-pickup) during the period (SEK, incl. applicable VAT).",
      refunds: "Completed refunds recorded during the period (SEK). Attributed by internal registration timestamp (recordedAt). Includes both admin-attested and provider-confirmed refunds.",
      netRevenue: "Operational Gross Revenue minus Completed Refunds during the period (SEK, incl. applicable VAT). This represents operational cash/card transaction flow, not statutory accrual-basis accounting revenue.",
      timeAttribution: "Gross sales attributed to paidAt (electronic) or collectedAt (pay-on-pickup). Refunds attributed to internal registration timestamp (recordedAt), not a provider-confirmed transfer time.",
      accountingNotice: "Operational totals reflect point-of-sale event flow and do not constitute statutory tax or financial statements without external certified accounting reconciliation.",
    },
  };
}
