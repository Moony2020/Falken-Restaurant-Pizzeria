import { adminCatalogProductsQuerySchema, listAdminCatalogProducts } from "../../../../../server/admin-catalog.ts";
import { getAdminAuthConfig, requireAdmin } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

/** Read-only catalog inventory for the Admin Meny & Produkter tab. */
export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) {
      return json({ error: "invalid_query" }, 400);
    }
    const parsed = adminCatalogProductsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return json({ error: "invalid_query" }, 400);

    return json(await listAdminCatalogProducts(parsed.data));
  } catch (error) {
    return serverError(error);
  }
}
