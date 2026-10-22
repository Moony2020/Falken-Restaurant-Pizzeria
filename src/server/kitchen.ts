import { OrderModel, type OrderDoc } from "./models/order.ts";
import { KITCHEN_STATUSES } from "./order-state.ts";

// What a kitchen screen is allowed to show. Two independent conditions must both hold, so one bad write can't leak
// an unpaid order into the kitchen: the order's status is a paid-and-active one AND its payment status is "paid".
// There is no HTTP route for this yet (staff screens come with the admin phase); this is the single query to use.

export type KitchenOrder = Pick<OrderDoc, "publicId" | "items" | "totalSek" | "pickupAt" | "contact" | "fulfillmentStatus" | "paidAt">;

export async function listKitchenOrders(limit = 100): Promise<KitchenOrder[]> {
  return (await OrderModel.find({
    fulfillmentStatus: { $in: KITCHEN_STATUSES },
    paymentStatus: "paid",
  })
    .sort({ pickupAt: 1 })
    .limit(limit)
    .select("publicId items totalSek pickupAt contact fulfillmentStatus paidAt")
    .lean()) as KitchenOrder[];
}
