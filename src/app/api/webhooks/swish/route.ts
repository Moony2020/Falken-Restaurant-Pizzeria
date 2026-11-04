import { connectDb } from "../../../../server/db.ts";
import { json, serverError } from "../../../../server/http.ts";
import { getPaymentsConfig } from "../../../../server/payments-config.ts";
import { getSwishGateway } from "../../../../server/swish-gateway.ts";
import { handleSwishWebhook } from "../../../../server/swish-service.ts";

const MAX_BODY_BYTES = 500_000;

/**
 * Swish callback endpoint.
 * Swish sends an HTTPS POST callback with payment status updates.
 */
export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

    const gateway = getSwishGateway(getPaymentsConfig());
    if (gateway) await connectDb();

    const result = await handleSwishWebhook({ rawBody, gateway });
    return json(result.body, result.status);
  } catch (err) {
    return serverError(err);
  }
}

