import { getAdminOrder, validAdminOrderId } from "../../../../../server/admin-orders.ts";
import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

export async function GET(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    request.headers.get("cookie");
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    const { publicId } = await context.params;
    if (!validAdminOrderId(publicId)) return json({ error: "not_found" }, 404);
    const order = await getAdminOrder(publicId);
    return order ? json({ order }) : json({ error: "not_found" }, 404);
  } catch (error) {
    return serverError(error);
  }
}
