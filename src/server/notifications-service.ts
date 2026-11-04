import type { Types } from "mongoose";
import { AdminNotificationModel, type AdminNotificationDoc } from "./models/notification.ts";
import { OrderModel } from "./models/order.ts";

export type AdminNotificationSummary = {
  id: string;
  orderId: string;
  publicId: string;
  customerName: string;
  totalSek: number;
  paymentMethod: "card" | "swish" | "pay_on_pickup";
  paymentStatus: "paid" | "unpaid";
  fulfillmentStatus: string;
  pickupAt: string;
  orderCreatedAt: string;
  read: boolean;
  createdAt: string;
};

function toSummary(doc: AdminNotificationDoc & { _id: Types.ObjectId }): AdminNotificationSummary {
  return {
    id: String(doc._id),
    orderId: String(doc.orderId),
    publicId: doc.publicId,
    customerName: doc.customerName,
    totalSek: doc.totalSek,
    paymentMethod: doc.paymentMethod as "card" | "swish" | "pay_on_pickup",
    paymentStatus: doc.paymentStatus,
    fulfillmentStatus: doc.fulfillmentStatus,
    pickupAt: doc.pickupAt.toISOString(),
    orderCreatedAt: doc.orderCreatedAt.toISOString(),
    read: doc.read,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Creates an admin notification for an order if and only if it is eligible:
 * - Card payment: must be verified PAID.
 * - Swish payment: must be verified PAID.
 * - Pay on pickup: confirmed and unpaid.
 * Pending or failed electronic payments NEVER create notifications.
 */
export async function createNotificationForOrder(orderId: Types.ObjectId): Promise<boolean> {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) return false;

  // Eligibility rules:
  const isCardPaid = order.paymentMethod === "card" && order.paymentStatus === "paid";
  const isSwishPaid = order.paymentMethod === "swish" && order.paymentStatus === "paid";
  const isCashConfirmed = order.paymentMethod === "pay_on_pickup" && order.fulfillmentStatus !== "CANCELLED";

  if (!isCardPaid && !isSwishPaid && !isCashConfirmed) {
    return false;
  }

  // Idempotent upsert by unique orderId
  await AdminNotificationModel.updateOne(
    { orderId: order._id },
    {
      $setOnInsert: {
        orderId: order._id,
        publicId: order.publicId,
        customerName: order.contact.name,
        totalSek: order.totalSek,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus === "paid" ? "paid" : "unpaid",
        fulfillmentStatus: order.fulfillmentStatus,
        pickupAt: order.pickupAt,
        orderCreatedAt: order.createdAt ?? new Date(),
        read: false,
      },
    },
    { upsert: true }
  );

  return true;
}

export async function listAdminNotifications(limit = 40): Promise<{
  notifications: AdminNotificationSummary[];
  unreadCount: number;
}> {
  // Ensure existing eligible orders have notification records
  await backfillEligibleNotifications();

  const [docs, unreadCount] = await Promise.all([
    AdminNotificationModel.find().sort({ createdAt: -1 }).limit(limit).lean(),
    AdminNotificationModel.countDocuments({ read: false }),
  ]);

  return {
    notifications: (docs as unknown as (AdminNotificationDoc & { _id: Types.ObjectId })[]).map(toSummary),
    unreadCount,
  };
}

export async function markNotificationRead(id: string, read = true): Promise<boolean> {
  const result = await AdminNotificationModel.updateOne(
    { _id: id },
    { $set: { read, ...(read ? { readAt: new Date() } : { $unset: { readAt: 1 } }) } }
  );
  return result.matchedCount > 0;
}

export async function markAllNotificationsRead(): Promise<number> {
  const result = await AdminNotificationModel.updateMany(
    { read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return result.modifiedCount;
}

/**
 * Creates notifications for existing confirmed orders that don't have one yet.
 */
let backfilled = false;
export async function backfillEligibleNotifications(): Promise<void> {
  if (backfilled) return;
  backfilled = true;

  try {
    const eligibleOrders = await OrderModel.find({
      $or: [
        { paymentMethod: "card", paymentStatus: "paid" },
        { paymentMethod: "swish", paymentStatus: "paid" },
        { paymentMethod: "pay_on_pickup", fulfillmentStatus: { $ne: "CANCELLED" } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    for (const order of eligibleOrders) {
      await AdminNotificationModel.updateOne(
        { orderId: order._id },
        {
          $setOnInsert: {
            orderId: order._id,
            publicId: order.publicId,
            customerName: order.contact.name,
            totalSek: order.totalSek,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus === "paid" ? "paid" : "unpaid",
            fulfillmentStatus: order.fulfillmentStatus,
            pickupAt: order.pickupAt,
            orderCreatedAt: order.createdAt ?? new Date(),
            read: false,
          },
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error("Backfill notifications error:", err);
  }
}
