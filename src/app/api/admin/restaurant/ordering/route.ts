import { z } from "zod";
import { getRestaurantSettings, setOnlineOrdering } from "../../../../../server/admin-overview.ts";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../server/http.ts";

const bodySchema = z
  .object({
    enabled: z.boolean().optional(),
    targetState: z.boolean().optional(),
    manualOverride: z.enum(["open", "closed", "auto"]).nullable().optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.enabled !== undefined ||
      data.targetState !== undefined ||
      data.manualOverride !== undefined,
    { message: "At least one setting parameter must be provided" },
  );

export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    return json(await getRestaurantSettings());
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  const refused = guardWrite(request, "admin-restaurant-ordering", 20);
  if (refused) return refused;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  try {
    await connectDb();
    const config = getAdminAuthConfig();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) return json({ error: "csrf_failed" }, 403);
    const updateOpt = {
      enabled: parsed.data.enabled,
      targetState: parsed.data.targetState,
      manualOverride: parsed.data.manualOverride === "auto" ? null : parsed.data.manualOverride,
    };
    return json(await setOnlineOrdering(updateOpt, auth.session.principal.id));
  } catch (error) {
    return serverError(error);
  }
}
