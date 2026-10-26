import { OrderModel, type OrderDoc } from "./models/order.ts";
import { KITCHEN_STATUSES } from "./order-state.ts";

// What a kitchen screen is allowed to show. Card orders must be paid. A pay-on-pickup order is intentionally
// admitted while payment is pending only after it has been explicitly confirmed at creation.

export type KitchenOrder = Pick<OrderDoc, "publicId" | "items" | "totalSek" | "pickupAt" | "contact" | "fulfillmentStatus" | "paidAt">;

export async function listKitchenOrders(limit = 100): Promise<KitchenOrder[]> {
  return (await OrderModel.find({
    $or: [
      { fulfillmentStatus: { $in: KITCHEN_STATUSES.filter((status) => status !== "CONFIRMED") }, paymentStatus: "paid" },
      { fulfillmentStatus: "CONFIRMED", paymentMethod: "pay_on_pickup", paymentStatus: "unpaid" },
    ],
  })
    .sort({ pickupAt: 1 })
    .limit(limit)
    .select("publicId items totalSek pickupAt contact fulfillmentStatus paidAt")
    .lean()) as KitchenOrder[];
}
