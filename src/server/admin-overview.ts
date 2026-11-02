import { OrderModel } from "./models/order.ts";
import { RestaurantSettingsModel } from "./models/restaurant-settings.ts";
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
  const buckets: { key: string; label: string; orders: number; revenueSek: number }[] = [];
  if (range.granularity === "hour") {
    for (let hour = 0; hour < 24; hour++) {
      const instant = new Date(range.start.getTime() + hour * 3_600_000);
      buckets.push({ key: dateKey(instant, "hour"), label: `${String(hour).padStart(2, "0")}:00`, orders: 0, revenueSek: 0 });
    }
  } else if (range.granularity === "month") {
    const year = range.first.getUTCFullYear();
    for (let month = 0; month < 12; month++) {
      const instant = new Date(Date.UTC(year, month, 1, 12));
      buckets.push({ key: dateKey(instant, "month"), label: formatDay(instant, { month: "short" }), orders: 0, revenueSek: 0 });
    }
  } else {
    const days = Math.round((range.endExclusive.getTime() - range.first.getTime()) / 86_400_000);
    for (let day = 0; day < days; day++) {
      const instant = new Date(range.first.getTime() + day * 86_400_000 + 12 * 3_600_000);
      const label = period === "week"
        ? formatDay(instant, { weekday: "short", day: "numeric", month: "short" })
        : formatDay(instant, { day: "numeric" });
      buckets.push({ key: dateKey(instant, "day"), label, orders: 0, revenueSek: 0 });
    }
  }
  return buckets;
}

import { CURRENT_SEASON } from "../data/site.ts";
import { getOpenStatus } from "../lib/hours.ts";

export type OrderingUpdateOptions = {
  enabled?: boolean;
  targetState?: boolean;
  manualOverride?: "open" | "closed" | null;
};

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
  let targetState: boolean;
  let manualOverride: "open" | "closed" | null;

  const now = new Date();
  const schedule = getOpenStatus(now, CURRENT_SEASON);
  const isScheduleOpen = schedule.isOpen;

  if (typeof options === "boolean") {
    targetState = options;
  } else if (options.targetState !== undefined) {
    targetState = options.targetState;
  } else if (options.enabled !== undefined) {
    targetState = options.enabled;
  } else if (options.manualOverride !== undefined) {
    targetState = options.manualOverride === "open";
  } else {
    targetState = true;
  }

  if (targetState) {
    // Admin wants the restaurant to be OPEN:
    // If during normal hours, remove any manual closure.
    // If outside normal hours, force open.
    manualOverride = isScheduleOpen ? null : "open";
  } else {
    // Admin wants the restaurant to be CLOSED:
    // If during normal hours, set manual close.
    // If outside normal hours, clear manual open so it returns to closed schedule.
    manualOverride = isScheduleOpen ? "closed" : null;
  }

  // Keep onlineOrderingEnabled true unless explicitly set to false via options.enabled
  const enabled =
    typeof options !== "boolean" && options.enabled !== undefined
      ? options.enabled
      : true;

  const settings = await RestaurantSettingsModel.findOneAndUpdate(
    { _id: "restaurant" },
    { $set: { onlineOrderingEnabled: enabled, manualOverride, updatedBy: staffId } },
    { upsert: true, new: true, runValidators: true, projection: { onlineOrderingEnabled: 1, manualOverride: 1 } },
  ).lean();

  return {
    onlineOrderingEnabled: settings?.onlineOrderingEnabled ?? enabled,
    manualOverride: settings?.manualOverride ?? manualOverride,
  };
}

export async function getAdminOverview(period: OverviewPeriod, status = "ALL", now = new Date()) {
  const range = periodRange(period, now);
  const visibleOrderBase = adminVisibleOrderFilter(status);
  const createdRange = { createdAt: { $gte: range.start, $lt: range.end } };
  const paidRange = { paidAt: { $gte: range.start, $lt: range.end } };
  const inRangeVisible = { ...visibleOrderBase, ...createdRange };

  const [
    periodOrders,
    orderCount,
    activeCount,
    unpaidOrders,
    paidStripeOrderCount,
    orderBuckets,
    revenueBuckets,
    bestSellers,
    settings,
  ] = await Promise.all([
    OrderModel.find(inRangeVisible).select("totalSek fulfillmentStatus paymentStatus paymentMethod").lean(),
    OrderModel.countDocuments({ ...inRangeVisible, fulfillmentStatus: { $in: operationalStatuses } }),
    OrderModel.countDocuments({ ...inRangeVisible, fulfillmentStatus: { $in: activeStatuses } }),
    OrderModel.find({ ...inRangeVisible, paymentStatus: "unpaid" }).select("totalSek").lean(),
    OrderModel.countDocuments({ ...visibleOrderBase, ...paidRange, paymentMethod: "card", paymentProvider: "stripe", paymentStatus: "paid", paymentId: { $exists: true } }),
    OrderModel.aggregate([
      { $match: { ...visibleOrderBase, ...createdRange, fulfillmentStatus: { $in: operationalStatuses } } },
      { $group: { _id: { $dateToString: { format: bucketFormat(range.granularity), date: "$createdAt", timezone: ZONE } }, count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: { ...visibleOrderBase, ...createdRange, fulfillmentStatus: { $in: operationalStatuses } } },
      {
        $group: {
          _id: { $dateToString: { format: bucketFormat(range.granularity), date: "$createdAt", timezone: ZONE } },
          sek: { $sum: "$totalSek" },
        },
      },
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

  const buckets = chartBuckets(period, range);
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  for (const item of orderBuckets as { _id: string; count: number }[]) {
    const bucket = byKey.get(item._id);
    if (bucket) bucket.orders = item.count;
  }
  for (const item of revenueBuckets as { _id: string; sek: number }[]) {
    const bucket = byKey.get(item._id);
    if (bucket) bucket.revenueSek = item.sek;
  }
  const operationalSet = new Set<string>(operationalStatuses);
  const operationalOrders = periodOrders.filter((order) => operationalSet.has(order.fulfillmentStatus));
  const totalSalesSek = operationalOrders.reduce((sum, order) => sum + order.totalSek, 0);
  const averageSek = operationalOrders.length
    ? Math.round(totalSalesSek / operationalOrders.length)
    : 0;

  return {
    period,
    range: { from: range.start.toISOString(), to: range.end.toISOString(), timeZone: ZONE },
    metrics: {
      revenueSek: totalSalesSek,
      orders: orderCount,
      activeOrders: activeCount,
      paidStripeOrders: paidStripeOrderCount,
      unpaidOrders: unpaidOrders.length,
      unpaidSek: unpaidOrders.reduce((sum, order) => sum + order.totalSek, 0),
      averageOrderSek: averageSek,
      reviewCount: 0,
      averageRating: null,
    },
    chart: buckets,
    bestSellers: (bestSellers as { _id: string; quantity: number }[]).map((item) => ({ name: item._id, quantity: item.quantity })),
    settings,
    definitions: {
      orders: "Order counts use order creation time in Europe/Stockholm.",
      revenue: "Revenue uses verified Stripe payments by paidAt, less recorded refunds. Pay on pickup is not revenue until collected.",
    },
  };
}
