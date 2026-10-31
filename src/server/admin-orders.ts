import { z } from "zod";
import { OrderModel, type OrderDoc } from "./models/order.ts";
import type { FulfillmentStatus } from "./models/constants.ts";
import { audit, transitionOrder } from "./order-transitions.ts";
import type { AdminPrincipal } from "./admin-auth.ts";

const visibleStatuses = ["CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"] as const;
const publicIdPattern = /^[0-9A-HJKMNP-TV-Z]{10}$/;
export const adminOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(["ALL", ...visibleStatuses]).default("ALL"),
  q: z.string().trim().max(80).default(""),
}).strict();
export const adminTransitionSchema = z.object({
  to: z.enum(["ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"]),
  expectedStatus: z.enum(visibleStatuses),
}).strict();

type OrderRow = OrderDoc & { createdAt: Date };
type Filter = Record<string, unknown>;

export function validAdminOrderId(value: string): boolean {
  return publicIdPattern.test(value);
}

function escapeRegex(value: string) {
  return [...value].map((char) => "\\^$.*+?()[]{}|".includes(char) ? `\\${char}` : char).join("");
}

export function adminVisibleOrderFilter(status: string = "ALL", q = ""): Filter {
  const filter: Filter = {
    fulfillmentStatus: { $in: status === "ALL" ? visibleStatuses : [status] },
    $or: [
      { paymentMethod: "card", paymentProvider: "stripe", paymentStatus: "paid", paymentId: { $exists: true }, paidAt: { $exists: true } },
      { paymentMethod: "pay_on_pickup", paymentStatus: { $in: ["unpaid", "paid"] } },
    ],
  };
  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$and = [{ $or: [
      { publicId: regex },
      { "contact.name": regex },
      { "contact.phone": regex },
    ] }];
  }
  return filter;
}

function summary(order: OrderRow) {
  return {
    publicId: order.publicId,
    customerName: order.contact.name,
    phone: order.contact.phone,
    createdAt: order.createdAt.toISOString(),
    pickupAt: order.pickupAt.toISOString(),
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalSek: order.totalSek,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      variant: item.variantNameSnapshot,
      quantity: item.quantity,
    })),
    acknowledgedAt: order.acknowledgedAt?.toISOString() ?? null,
  };
}

export type AdminOrderSummary = ReturnType<typeof summary>;

export async function listAdminOrders(input: z.infer<typeof adminOrderQuerySchema>) {
  const filter = adminVisibleOrderFilter(input.status, input.q);
  const [rows, total] = await Promise.all([
    OrderModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((input.page - 1) * input.limit).limit(input.limit)
      .select("publicId contact createdAt pickupAt fulfillmentStatus paymentStatus paymentMethod totalSek items acknowledgedAt")
      .lean(),
    OrderModel.countDocuments(filter),
  ]);
  return { orders: (rows as unknown as OrderRow[]).map(summary), total, page: input.page, limit: input.limit };
}

export async function getAdminOrder(publicId: string) {
  if (!validAdminOrderId(publicId)) return null;
  const order = await OrderModel.findOne({ publicId, ...adminVisibleOrderFilter() })
    .select("publicId contact createdAt pickupAt fulfillmentStatus paymentStatus paymentMethod paymentProvider totalSek subtotalSek discountSek currency items acknowledgedAt acknowledgedBy statusHistory paidAt")
    .lean() as OrderRow | null;
  if (!order) return null;
  return {
    ...summary(order),
    subtotalSek: order.subtotalSek,
    discountSek: order.discountSek,
    currency: order.currency,
    paidAt: order.paidAt?.toISOString() ?? null,
    acknowledgedBy: order.acknowledgedBy ?? null,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      variant: item.variantNameSnapshot,
      quantity: item.quantity,
      basePriceSek: item.basePriceSek,
      lineTotalSek: item.lineTotalSek,
      modifiers: item.modifiersSnapshot.map((m) => ({ label: m.labelSv, quantity: m.quantity, priceSek: m.priceSek })),
      removedIngredients: item.removedIngredients,
      note: item.note,
    })),
    statusHistory: order.statusHistory.map((entry) => ({
      at: entry.at.toISOString(), from: entry.from, to: entry.to,
      actorType: entry.actorType, actorId: entry.actorId,
    })),
  };
}

export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof getAdminOrder>>>;

export async function advanceAdminOrder(publicId: string, expectedStatus: FulfillmentStatus, to: FulfillmentStatus, staff: AdminPrincipal) {
  if (!validAdminOrderId(publicId)) return { ok: false as const, reason: "not_found" as const };
  const order = await OrderModel.findOne({ publicId, ...adminVisibleOrderFilter() }).select("_id fulfillmentStatus paymentMethod paymentStatus").lean();
  if (!order) return { ok: false as const, reason: "not_found" as const };
  if (order.fulfillmentStatus !== expectedStatus) return { ok: false as const, reason: "conflict" as const };
  if (to === "PICKED_UP" && order.paymentMethod === "pay_on_pickup") {
    // A5 will introduce verified on-site collection. A3 cannot infer payment from a status field.
    return { ok: false as const, reason: "payment_required" as const };
  }
  const result = await transitionOrder({ orderId: order._id, to, actor: { type: "staff", id: staff.id } });
  if (!result.ok) return { ok: false as const, reason: result.reason };
  if (!result.changed) return { ok: false as const, reason: "conflict" as const };
  await audit("admin_order_status_changed", String(order._id), { type: "staff", id: staff.id }, new Date(), { from: expectedStatus, to });
  return { ok: true as const, changed: result.changed, order: await getAdminOrder(publicId) };
}
