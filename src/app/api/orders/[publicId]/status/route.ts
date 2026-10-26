import { connectDb } from "../../../../../server/db.ts";
import { getOrderTokenSecret } from "../../../../../server/env.ts";
import { clientIp, json, orderAccessToken, serverError } from "../../../../../server/http.ts";
import { getOrderStatus } from "../../../../../server/payments-service.ts";
import { rateLimit } from "../../../../../server/rate-limit.ts";

/** Current state of an order, read from the database. Needs the access token (header `x-order-token`). */
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[publicId]/status">) {
  const rl = rateLimit(`order-status:${clientIp(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429, { "retry-after": String(rl.retryAfterSec) });

  const { publicId } = await ctx.params;
  try {
    await connectDb();
    const result = await getOrderStatus({ publicId, token: orderAccessToken(request, publicId), tokenSecret: getOrderTokenSecret() });
    return result.kind === "ok" ? json({ order: result.order }) : json({ error: "not_found" }, 404);
  } catch (err) {
    return serverError(err);
  }
}
