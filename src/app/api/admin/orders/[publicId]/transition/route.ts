import { adminTransitionSchema, advanceAdminOrder, validAdminOrderId } from "../../../../../../server/admin-orders.ts";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../../server/db.ts";
import { json, readJsonBody, serverError } from "../../../../../../server/http.ts";

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) return json({ error: "forbidden" }, 403);
    const { publicId } = await context.params;
    if (!validAdminOrderId(publicId)) return json({ error: "not_found" }, 404);
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = adminTransitionSchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "invalid_transition" }, 400);
    const result = await advanceAdminOrder(publicId, parsed.data.expectedStatus, parsed.data.to, auth.session.principal);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "payment_required" || result.reason === "conflict" ? 409 : 400;
      return json({ error: result.reason }, status);
    }
    return json({ order: result.order, changed: result.changed });
  } catch (error) {
    return serverError(error);
  }
}
