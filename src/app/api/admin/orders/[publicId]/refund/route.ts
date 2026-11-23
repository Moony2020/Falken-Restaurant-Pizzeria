import { z } from "zod";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../../server/admin-auth.ts";
import { validAdminOrderId } from "../../../../../../server/admin-orders.ts";
import { connectDb } from "../../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../../server/http.ts";
import { recordFullRefund, type CanonicalRefundProvider, type RefundReasonCategory } from "../../../../../../server/refund-service.ts";

const refundBodySchema = z
  .object({
    amountSek: z.number().int().positive(),
    reasonCategory: z.enum(["customer_cancellation", "out_of_stock", "kitchen_delay", "quality_issue", "other"]),
    reasonNote: z.string().max(300).optional(),
    method: z.enum(["stripe", "swish", "cash", "card_terminal"]).optional(),
    externalReference: z.string().min(1).max(120),
    idempotencyKey: z.string().min(16).max(100),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ publicId: string }> }) {
  const refused = guardWrite(request, "admin-refund", 20);
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

    const parsed = refundBodySchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "invalid_refund_payload", details: parsed.error.issues }, 400);

    const result = await recordFullRefund({
      publicId,
      amountSek: parsed.data.amountSek,
      reasonCategory: parsed.data.reasonCategory as RefundReasonCategory,
      reasonNote: parsed.data.reasonNote,
      method: parsed.data.method as CanonicalRefundProvider | undefined,
      externalReference: parsed.data.externalReference,
      idempotencyKey: parsed.data.idempotencyKey,
      staff: auth.session.principal,
    });

    if (!result.ok) {
      let status = 400;
      if (result.reason === "transactions_required") {
        status = 503;
      } else if (result.reason === "not_found") {
        status = 404;
      } else if (
        result.reason === "already_refunded" ||
        result.reason === "idempotency_conflict" ||
        result.reason === "duplicate_external_reference" ||
        result.reason === "order_not_paid" ||
        result.reason === "conflict"
      ) {
        status = 409;
      } else if (
        result.reason === "payment_record_missing" ||
        result.reason === "payment_already_refunded" ||
        result.reason === "inconsistent_payment_refund" ||
        result.reason === "on_site_collection_missing" ||
        result.reason === "method_mismatch" ||
        result.reason === "refund_amount_mismatch"
      ) {
        status = 422;
      } else if (result.reason === "invalid_reference_format") {
        status = 400;
      }
      return json({ error: result.reason }, status);
    }

    return json({ order: result.order, changed: result.changed }, 200);
  } catch (error) {
    return serverError(error);
  }
}
