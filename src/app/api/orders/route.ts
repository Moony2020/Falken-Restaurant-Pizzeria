import { orderRequestSchema } from "../../../server/cart-schema.ts";
import { connectDb } from "../../../server/db.ts";
import { getOrderTokenSecret } from "../../../server/env.ts";
import { guardWrite, json, readJsonBody, serverError, setOrderAccessCookie } from "../../../server/http.ts";
import { createOrder, OrderError } from "../../../server/orders-service.ts";

/**
 * Creates an order for pickup. Card orders wait for Stripe; pay-on-pickup orders are confirmed but stay unpaid.
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
    // The access proof stays in the HttpOnly cookie. Never expose it to JavaScript, URLs or local storage.
    const response = json({ order }, replayed ? 200 : 201);
    if (accessToken) setOrderAccessCookie(response, request, order.publicId, accessToken);
    return response;
  } catch (err) {
    if (err instanceof OrderError) {
      return json({ error: err.code, message: err.message, details: err.details }, err.status);
    }
    return serverError(err);
  }
}
