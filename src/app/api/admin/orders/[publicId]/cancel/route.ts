import { z } from "zod";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../../server/admin-auth.ts";
import { validAdminOrderId } from "../../../../../../server/admin-orders.ts";
import { connectDb } from "../../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../../server/http.ts";
import { cancelUnpaidOrder, type RefundReasonCategory } from "../../../../../../server/refund-service.ts";

const cancelBodySchema = z
  .object({
    reasonCategory: z.enum(["customer_cancellation", "out_of_stock", "kitchen_delay", "quality_issue", "other"]),
    reasonNote: z.string().max(300).optional(),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const refused = guardWrite(request, "admin-cancel", 20);
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

    const parsed = cancelBodySchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "invalid_cancel_payload", details: parsed.error.issues }, 400);

    const result = await cancelUnpaidOrder({
      publicId,
      reasonCategory: parsed.data.reasonCategory as RefundReasonCategory,
      reasonNote: parsed.data.reasonNote,
      staff: auth.session.principal,
    });

    if (!result.ok) {
      const status =
        result.reason === "transactions_required"
          ? 503
          : result.reason === "not_found"
            ? 404
            : result.reason === "refund_required" || result.reason === "cancellation_blocked_session_active" || result.reason === "conflict"
              ? 409
              : 400;
      return json({ error: result.reason }, status);
    }

    return json({ order: result.order, changed: result.changed }, 200);
  } catch (error) {
    return serverError(error);
  }
}
