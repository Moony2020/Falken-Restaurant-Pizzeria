import { OrderModel, type OrderDoc } from "./models/order.ts";
import { KITCHEN_STATUSES } from "./order-state.ts";

// What a kitchen screen is allowed to show. Card orders must be paid. Pay-on-pickup orders are visible after
// automatic confirmation, whether their on-site payment is still outstanding or has already been recorded.

export type KitchenOrder = Pick<OrderDoc, "publicId" | "items" | "totalSek" | "pickupAt" | "contact" | "fulfillmentStatus" | "paidAt">;

export async function listKitchenOrders(limit = 100): Promise<KitchenOrder[]> {
  return (await OrderModel.find({
    // Status alone must never make an unpaid card order visible to the kitchen.
    fulfillmentStatus: { $in: KITCHEN_STATUSES },
    $or: [
      { paymentMethod: "card", paymentStatus: "paid" },
      { paymentMethod: "pay_on_pickup", paymentStatus: { $in: ["unpaid", "paid"] } },
    ],
  })
    .sort({ pickupAt: 1 })
    .limit(limit)
    .select("publicId items totalSek pickupAt contact fulfillmentStatus paidAt")
    .lean()) as KitchenOrder[];
}
