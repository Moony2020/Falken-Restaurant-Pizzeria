import { getAdminAuthConfig, publicPrincipal, requireAdmin } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

export async function GET(request: Request) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, auth.status);
    return json({ staff: publicPrincipal(auth.session.principal) });
  } catch (error) {
    return serverError(error);
  }
}
