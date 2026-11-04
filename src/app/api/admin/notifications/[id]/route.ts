import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, readJsonBody, serverError } from "../../../../../server/http.ts";
import { markNotificationRead } from "../../../../../server/notifications-service.ts";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const read = typeof (body.value as { read?: unknown }).read === "boolean" ? (body.value as { read: boolean }).read : true;
    const updated = await markNotificationRead(id, read);
    if (!updated) return json({ error: "not_found" }, 404);

    return json({ ok: true, id, read });
  } catch (error) {
    return serverError(error);
  }
}

