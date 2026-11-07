import { z } from "zod";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../../server/admin-auth.ts";
import { validAdminOrderId, getAdminOrder } from "../../../../../../server/admin-orders.ts";
import { connectDb } from "../../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../../server/http.ts";
import { collectPayOnPickupPayment } from "../../../../../../server/pay-on-pickup-collection.ts";

const bodySchema = z.object({
  method: z.enum(["cash", "card_terminal"]),
  idempotencyKey: z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const refused = guardWrite(request, "admin-pay-on-pickup", 20);
  if (refused) return refused;
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
    const parsed = bodySchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "invalid_collection" }, 400);
    const result = await collectPayOnPickupPayment({ publicId, ...parsed.data, staff: auth.session.principal });
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : result.reason === "wrong_payment_method" ? 400 : 409;
      return json({ error: result.reason }, status);
    }
    return json({ order: await getAdminOrder(publicId), changed: result.changed });
  } catch (error) {
    return serverError(error);
  }
}
