import { connection } from "next/server";
import { adminOrderQuerySchema, listAdminOrders } from "../../../../server/admin-orders.ts";
import { getAdminAuthConfig, requireAdmin } from "../../../../server/admin-auth.ts";
import { connectDb } from "../../../../server/db.ts";
import { json, serverError } from "../../../../server/http.ts";

export async function GET(request: Request) {
  await connection();
  try {
    request.headers.get("cookie");
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams);
    if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) return json({ error: "invalid_query" }, 400);
    const parsed = adminOrderQuerySchema.safeParse(raw);
    if (!parsed.success) return json({ error: "invalid_query" }, 400);
    return json(await listAdminOrders(parsed.data));
  } catch (error) {
    return serverError(error);
  }
}
