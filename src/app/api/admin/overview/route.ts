import { z } from "zod";
import { getAdminOverview, overviewPeriod } from "../../../../server/admin-overview.ts";
import { getAdminAuthConfig, requireAdmin } from "../../../../server/admin-auth.ts";
import { connectDb } from "../../../../server/db.ts";
import { json, serverError } from "../../../../server/http.ts";

const querySchema = z.object({ period: z.enum(overviewPeriod).default("today"), status: z.enum(["ALL", "CONFIRMED", "ACKNOWLEDGED", "PREPARING", "READY_FOR_PICKUP", "PICKED_UP"]).default("ALL") }).strict();

export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) return json({ error: "invalid_query" }, 400);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return json({ error: "invalid_query" }, 400);
    return json(await getAdminOverview(parsed.data.period, parsed.data.status));
  } catch (error) {
    return serverError(error);
  }
}
