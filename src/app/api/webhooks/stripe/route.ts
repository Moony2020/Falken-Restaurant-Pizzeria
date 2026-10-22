import { connectDb } from "../../../../server/db.ts";
import { json, serverError } from "../../../../server/http.ts";
import { getPaymentsConfig } from "../../../../server/payments-config.ts";
import { handleStripeWebhook } from "../../../../server/payments-service.ts";
import { getStripeGateway } from "../../../../server/stripe-gateway.ts";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Stripe's event endpoint. The signature is checked against the raw body before anything else happens, so a request
 * that Stripe did not sign is refused. No origin or CSRF check here: Stripe is not a browser.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
    const gateway = getStripeGateway(getPaymentsConfig());
    // The database is only needed once the signature has passed, but connecting first keeps the handler simple.
    if (gateway) await connectDb();
    const result = await handleStripeWebhook({ rawBody, signature: request.headers.get("stripe-signature"), gateway });
    return json(result.body, result.status);
  } catch (err) {
    return serverError(err);
  }
}
