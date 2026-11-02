import { z } from "zod";
import { DEFAULT_HOURS, formatMinutes, type CustomWeeklyHours, type Season } from "@/lib/hours";
import { getAdminAuthConfig, requireAdmin, verifyAdminCsrfForSession } from "@/server/admin-auth";
import { connectDb } from "@/server/db";
import { guardWrite, json, readJsonBody, serverError } from "@/server/http";
import { RestaurantSettingsModel } from "@/server/models/restaurant-settings";

const dayHoursSchema = z.object({
  open: z.string().regex(/^\d{1,2}:\d{2}$/),
  close: z.string().regex(/^\d{1,2}:\d{2}$/),
  closed: z.boolean().optional(),
});

const patchSchema = z
  .object({
    season: z.enum(["vinter", "sommar"]).optional(),
    hours: z.record(z.string(), dayHoursSchema).optional(),
    announcement: z.string().max(500).optional(),
    manualOverride: z.enum(["open", "closed", "auto"]).nullable().optional(),
    onlineOrderingEnabled: z.boolean().optional(),
  })
  .strict();

function getDefaultWeeklyHours(season: Season): CustomWeeklyHours {
  const table = DEFAULT_HOURS[season];
  const result: CustomWeeklyHours = {};
  for (let d = 0; d < 7; d++) {
    result[d] = {
      open: formatMinutes(table[d].open * 60),
      close: formatMinutes(table[d].close * 60),
      closed: false,
    };
  }
  return result;
}

export async function GET(request: Request) {
  try {
    await connectDb();
    const auth = await requireAdmin(request, getAdminAuthConfig());
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);

    const doc = await RestaurantSettingsModel.findById("restaurant").lean();
    const season: Season = (doc?.season as Season) || "vinter";
    const hours = (doc?.hours as CustomWeeklyHours) || getDefaultWeeklyHours(season);
    const announcement = doc?.announcement ?? "";
    const manualOverride = doc?.manualOverride ?? null;
    const onlineOrderingEnabled = doc?.onlineOrderingEnabled ?? true;

    return json({
      season,
      hours,
      announcement,
      manualOverride,
      onlineOrderingEnabled,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: Request) {
  const refused = guardWrite(request, "admin-restaurant-hours", 30);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = patchSchema.safeParse(body.value);
  if (!parsed.success) return json({ error: "invalid_request", details: parsed.error.format() }, 400);

  try {
    await connectDb();
    const config = getAdminAuthConfig();
    const auth = await requireAdmin(request, config);
    if (!auth.ok) return json({ error: "unauthenticated" }, 401);
    if (!(await verifyAdminCsrfForSession(request, auth.session, config))) {
      return json({ error: "csrf_failed" }, 403);
    }

    const updateFields: Record<string, unknown> = {
      updatedBy: auth.session.principal.id,
    };

    if (parsed.data.season !== undefined) {
      updateFields.season = parsed.data.season;
    }

    if (parsed.data.hours !== undefined) {
      updateFields.hours = parsed.data.hours;
    }

    if (parsed.data.announcement !== undefined) {
      updateFields.announcement = parsed.data.announcement.trim();
    }

    if (parsed.data.manualOverride !== undefined) {
      updateFields.manualOverride =
        parsed.data.manualOverride === "auto" ? null : parsed.data.manualOverride;
    }

    if (parsed.data.onlineOrderingEnabled !== undefined) {
      updateFields.onlineOrderingEnabled = parsed.data.onlineOrderingEnabled;
    }

    const updatedDoc = await RestaurantSettingsModel.findOneAndUpdate(
      { _id: "restaurant" },
      { $set: updateFields },
      { upsert: true, new: true, runValidators: true },
    ).lean();

    const activeSeason: Season = (updatedDoc.season as Season) || "vinter";
    const effectiveHours =
      (updatedDoc.hours as CustomWeeklyHours) || getDefaultWeeklyHours(activeSeason);

    return json({
      ok: true,
      season: activeSeason,
      hours: effectiveHours,
      announcement: updatedDoc.announcement ?? "",
      manualOverride: updatedDoc.manualOverride ?? null,
      onlineOrderingEnabled: updatedDoc.onlineOrderingEnabled ?? true,
    });
  } catch (error) {
    return serverError(error);
  }
}
