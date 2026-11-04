import { getAdminAuthConfig, requireAdmin } from "../../../../server/admin-auth.ts";
import { connectDb } from "../../../../server/db.ts";
import { json, serverError } from "../../../../server/http.ts";
import { listAdminNotifications } from "../../../../server/notifications-service.ts";

export async function GET(request: Request) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const result = await listAdminNotifications();
    return json(result);
  } catch (error) {
    return serverError(error);
  }
}

