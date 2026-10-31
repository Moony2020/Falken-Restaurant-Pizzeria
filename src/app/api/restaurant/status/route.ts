import { connection } from "next/server";
import { CURRENT_SEASON } from "@/data/site";
import { getOpenStatus } from "@/lib/hours";
import { connectDb } from "@/server/db";
import { json, serverError } from "@/server/http";
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
}

export async function GET() {
  await connection();
  try {
    await connectDb();
    const settings = await RestaurantSettingsModel.findById("restaurant")
      .select("onlineOrderingEnabled manualOverride")
      .lean();
    const onlineOrderingEnabled = settings?.onlineOrderingEnabled ?? true;
    const manualOverride = settings?.manualOverride ?? null;

    const now = new Date();
    const scheduleStatus = getOpenStatus(now, CURRENT_SEASON);
    const isOpenBySchedule = scheduleStatus.isOpen;

    let isOpen: boolean;
    let closeReason: "manual" | "schedule" | null = null;
    let label = scheduleStatus.label;

    if (manualOverride === "open") {
      isOpen = true;
      closeReason = null;
      label = "Öppet nu";
    } else if (manualOverride === "closed" || !onlineOrderingEnabled) {
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
    };

    return json(responseData, 200, {
      "cache-control": "no-store, must-revalidate",
    });
  } catch (err) {
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
