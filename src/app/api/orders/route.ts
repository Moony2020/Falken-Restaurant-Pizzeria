import { orderRequestSchema } from "../../../server/cart-schema.ts";
import { connectDb } from "../../../server/db.ts";
import { getOrderTokenSecret } from "../../../server/env.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../server/http.ts";
import { createOrder, OrderError } from "../../../server/orders-service.ts";

/**
 * Creates an order for pickup. The order is stored as PENDING_PAYMENT and stays that way:
 * nothing in this endpoint takes money or confirms an order. A verified payment webhook does that later.
 */
export async function POST(request: Request) {
  const refused = guardWrite(request, "orders", 10);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  // Malformed or forged requests are refused before the database is touched.
  const shape = orderRequestSchema.safeParse(body.value);
  if (!shape.success) {
    return json({ error: "invalid_request", message: "The order request is invalid", details: shape.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  try {
    await connectDb();
    // The access token proves later that a request comes from whoever created the order. It is what pay/cancel
    // endpoints will require; the public order number alone is not enough.
    const { replayed, order, accessToken } = await createOrder(body.value, new Date(), { tokenSecret: getOrderTokenSecret() });
    return json({ order, accessToken }, replayed ? 200 : 201);
  } catch (err) {
    if (err instanceof OrderError) {
      return json({ error: err.code, message: err.message, details: err.details }, err.status);
    }
    return serverError(err);
  }
}
