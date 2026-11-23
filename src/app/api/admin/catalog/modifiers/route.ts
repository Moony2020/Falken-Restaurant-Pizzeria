import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { listAdminModifiers } from "../../../../../server/admin-modifier-editing.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

/** GET /api/admin/catalog/modifiers - List all modifiers */
export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const data = await listAdminModifiers();
    return json(data);
  } catch (error) {
    return serverError(error);
  }
}
