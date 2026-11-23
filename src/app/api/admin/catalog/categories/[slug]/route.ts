import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../../server/admin-auth.ts";
import { categoryEditSchema, getAdminCategory, updateAdminCategory } from "../../../../../../server/admin-category-editing.ts";
import { connectDb } from "../../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../../server/http.ts";

const slugOk = (slug: string) => /^[a-z0-9-]{1,120}$/.test(slug);
const idempotencyKeyOk = (key: string) => /^[A-Za-z0-9_-]{16,100}$/.test(key);

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    const { slug } = await params;
    if (!slugOk(slug)) return json({ error: "not_found" }, 404);
    const category = await getAdminCategory(slug);
    return category ? json(category) : json({ error: "not_found" }, 404);
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await connectDb();
    const config = getAdminAuthConfig();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    if (auth.session.principal.role !== "ADMIN") return json({ error: "forbidden" }, 403);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) return json({ error: "forbidden" }, 403);

    const blocked = guardWrite(request, "admin-category-edit", 30);
    if (blocked) return blocked;
    const { slug } = await params;
    if (!slugOk(slug)) return json({ error: "not_found" }, 404);

    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    if (!idempotencyKeyOk(idempotencyKey)) return json({ error: "invalid_idempotency_key" }, 400);

    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const parsed = categoryEditSchema.safeParse(body.value);
    if (!parsed.success) return json({ error: "validation", issues: parsed.error.flatten() }, 422);

    const result = await updateAdminCategory(slug, parsed.data, idempotencyKey, auth.session.principal);
    if (result.status === "missing") return json({ error: "not_found" }, 404);
    if (result.status === "stale") return json({ error: "stale_category", category: result.category }, 409);
    if (result.status === "idempotency_conflict") return json({ error: "idempotency_key_reused" }, 409);
    if (result.status === "transactions_required") return json({ error: "transactions_required" }, 503);
    return json({ category: result.category, replayed: result.replayed });
  } catch (error) {
    return serverError(error);
  }
}
