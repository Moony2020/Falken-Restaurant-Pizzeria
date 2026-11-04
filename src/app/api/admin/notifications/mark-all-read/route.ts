import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";
import { markAllNotificationsRead } from "../../../../../server/notifications-service.ts";

export async function POST(request: Request) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const count = await markAllNotificationsRead();
    return json({ ok: true, count });
  } catch (error) {
    return serverError(error);
  }
}

