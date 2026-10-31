import { z } from "zod";
import { changeStaffPassword, clearAdminSessionCookies, getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../server/http.ts";
import { rateLimit } from "../../../../../server/rate-limit.ts";

const schema = z.object({ currentPassword: z.string().min(1).max(512), newPassword: z.string().min(8).max(512) }).strict();

export async function POST(request: Request) {
  const refused = guardWrite(request, "admin-password-ip", 5);
  if (refused) return refused;
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) return json({ error: "forbidden" }, 403);
    const limited = rateLimit(`admin-password-user:${auth.session.principal.id}`, { limit: 5, windowMs: 15 * 60_000 });
    if (!limited.allowed) return json({ error: "rate_limited" }, 429, { "retry-after": String(limited.retryAfterSec) });
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.value);
    if (!parsed.success || parsed.data.currentPassword === parsed.data.newPassword) return json({ error: "invalid_password" }, 400);
    if (!(await changeStaffPassword(auth.session.principal.id, parsed.data.currentPassword, parsed.data.newPassword))) {
      return json({ error: "invalid_password" }, 400);
    }
    const response = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    clearAdminSessionCookies(response, request);
    return response;
  } catch (error) {
    return serverError(error);
  }
}
