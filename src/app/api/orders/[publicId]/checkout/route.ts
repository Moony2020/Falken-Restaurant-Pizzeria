import { connectDb } from "../../../../../server/db.ts";
import { getOrderTokenSecret } from "../../../../../server/env.ts";
import { guardWrite, json, serverError } from "../../../../../server/http.ts";
import { getPaymentsConfig } from "../../../../../server/payments-config.ts";
import { createCheckout } from "../../../../../server/payments-service.ts";
import { getStripeGateway } from "../../../../../server/stripe-gateway.ts";

/**
 * Starts card payment for an order: returns the address of a Stripe Checkout page (test mode).
 * Needs the order's access token (header `x-order-token`); the public order number alone is refused.
 * The amount is never read from the request: it is the total saved with the order.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[publicId]/checkout">) {
  const refused = guardWrite(request, "checkout", 10);
  if (refused) return refused;

  const { publicId } = await ctx.params;
  try {
    const config = getPaymentsConfig();
    await connectDb();
    const result = await createCheckout({
      publicId,
      token: request.headers.get("x-order-token"),
      origin: new URL(request.url).origin,
      tokenSecret: getOrderTokenSecret(),
      gateway: getStripeGateway(config),
      config,
    });
    switch (result.kind) {
      case "ok":
        return json({ url: result.url });
      case "unavailable":
        return json({ error: "payments_unavailable", message: "Online payment is not available right now" }, 503);
      case "not_found":
        return json({ error: "not_found" }, 404);
      case "not_payable":
        return json({ error: "not_payable", status: result.status }, 409);
      case "expired":
        return json({ error: "order_expired" }, 409);
      case "paid":
        return json({ paid: true });
      case "processing":
        return json({ processing: true }, 202);
      case "too_many_attempts":
        return json({ error: "too_many_attempts" }, 409);
    }
  } catch (err) {
    if (typeof err === "object" && err !== null && String((err as { type?: string }).type).startsWith("Stripe")) {
      console.error("Stripe error:", (err as { type?: string; code?: string }).type, (err as { code?: string }).code ?? "");
      return json({ error: "payment_provider_error" }, 502);
    }
    return serverError(err);
  }
}
