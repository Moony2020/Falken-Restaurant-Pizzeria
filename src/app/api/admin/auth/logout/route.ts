import { clearAdminSessionCookies, getAdminAuthConfig, requireAdmin, revokeAdminSession, verifyAdminCsrfForSession } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { json, serverError } from "../../../../../server/http.ts";

export async function POST(request: Request) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, auth.status);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) return json({ error: "forbidden" }, 403);
    await revokeAdminSession(auth.session.sessionId);
    const response = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    clearAdminSessionCookies(response, request);
    return response;
  } catch (error) {
    return serverError(error);
  }
}
