import { connection } from "next/server";
import { CURRENT_SEASON } from "@/data/site";
import { getOpenStatus, type CustomWeeklyHours, type Season } from "@/lib/hours";
import { connectDb } from "@/server/db";
import { json } from "@/server/http";
import { RestaurantSettingsModel } from "@/server/models/restaurant-settings";

export interface RestaurantStatusResponse {
  onlineOrderingEnabled: boolean;
  manualOverride?: "open" | "closed" | null;
  isOpenBySchedule: boolean;
  isOpen: boolean;
  label: string;
  scheduleLabel: string;
  closeReason: "manual" | "schedule" | null;
  serverTime: string;
  season?: Season;
  hours?: CustomWeeklyHours;
  announcement?: string;
}

export async function GET() {
  await connection();
  try {
    await connectDb();
    const settings = await RestaurantSettingsModel.findById("restaurant").lean();
    const onlineOrderingEnabled = settings?.onlineOrderingEnabled ?? true;
    const manualOverride = settings?.manualOverride ?? null;
    const season = (settings?.season as Season) || CURRENT_SEASON;
    const customHours = (settings?.hours as CustomWeeklyHours) ?? null;
    const announcement = settings?.announcement ?? "";

    const now = new Date();
    const scheduleStatus = getOpenStatus(now, season, customHours);
    const isOpenBySchedule = scheduleStatus.isOpen;

    let isOpen: boolean;
    let closeReason: "manual" | "schedule" | null = null;
    let label = scheduleStatus.label;

    if (manualOverride === "open") {
      isOpen = true;
      closeReason = null;
      label = "Öppet nu";
    } else if (manualOverride === "closed") {
      isOpen = false;
      closeReason = "manual";
      label = "Stängt för beställningar";
    } else if (!onlineOrderingEnabled && isOpenBySchedule) {
      isOpen = false;
      closeReason = "manual";
      label = "Stängt för beställningar";
    } else {
      isOpen = isOpenBySchedule;
      if (!isOpen) {
        closeReason = "schedule";
        label = scheduleStatus.label;
      }
    }

    const responseData: RestaurantStatusResponse = {
      onlineOrderingEnabled,
      manualOverride,
      isOpenBySchedule,
      isOpen,
      label,
      scheduleLabel: scheduleStatus.label,
      closeReason,
      serverTime: now.toISOString(),
      season,
      hours: customHours ?? undefined,
      announcement,
    };

    return json(responseData, 200, {
      "cache-control": "no-store, must-revalidate",
    });
  } catch {
    // If DB is unreachable, fallback gracefully to schedule
    const now = new Date();
    const scheduleStatus = getOpenStatus(now, CURRENT_SEASON);
    return json({
      onlineOrderingEnabled: true,
      isOpenBySchedule: scheduleStatus.isOpen,
      isOpen: scheduleStatus.isOpen,
      label: scheduleStatus.label,
      scheduleLabel: scheduleStatus.label,
      closeReason: scheduleStatus.isOpen ? null : "schedule",
      serverTime: now.toISOString(),
    });
  }
}
