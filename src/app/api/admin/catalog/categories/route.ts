import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { listAdminCategories } from "../../../../../server/admin-category-editing.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

/** GET /api/admin/catalog/categories - List all categories with product counts */
export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const data = await listAdminCategories();
    return json(data);
  } catch (error) {
    return serverError(error);
  }
}
