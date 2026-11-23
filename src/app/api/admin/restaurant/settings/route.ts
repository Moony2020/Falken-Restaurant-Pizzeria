import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../server/http.ts";
import {
  getAdminRestaurantSettings,
  restaurantSettingsEditSchema,
  updateAdminRestaurantSettings,
} from "../../../../../server/restaurant-settings-service.ts";

export async function GET(request: Request) {
  try {
    await connectDb();
    const config = getAdminAuthConfig();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const data = await getAdminRestaurantSettings();
    return json(data, 200, { "cache-control": "no-store" });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  const refused = guardWrite(request, "admin-restaurant-settings", 30);
  if (refused) return refused;

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return json({ error: "invalid_idempotency_key", message: "Idempotency-Key header is required" }, 400);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = restaurantSettingsEditSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid_request", details: parsed.error.format() }, 400);
  }

  try {
    await connectDb();
    const config = getAdminAuthConfig();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const csrfValid = await verifyAdminCsrfForSession(request, auth.session, config);
    if (!csrfValid) {
      return json({ error: "csrf_failed" }, 403);
    }

    const result = await updateAdminRestaurantSettings(
      parsed.data,
      { id: auth.session.principal.id },
      idempotencyKey,
    );

    if (result.status === "ok") {
      return json({ ok: true, settings: result.settings, replayed: result.replayed }, 200);
    }
    if (result.status === "stale") {
      return json({ error: "stale_settings", settings: result.settings }, 409);
    }
    if (result.status === "idempotency_conflict") {
      return json({ error: "idempotency_conflict", message: "Payload does not match previous idempotent request" }, 409);
    }
    if (result.status === "transactions_required") {
      return json({ error: "transactions_required", message: "MongoDB replica set is required for settings mutations" }, 503);
    }

    return json({ error: "unknown_error" }, 500);
  } catch (error) {
    return serverError(error);
  }
}
