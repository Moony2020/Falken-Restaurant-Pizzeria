import mongoose from "mongoose";
import type { CustomWeeklyHours, Season } from "@/lib/hours";

const { model, models, Schema } = mongoose;

const restaurantSettingsSchema = new Schema(
  {
    _id: { type: String, default: "restaurant" },
    onlineOrderingEnabled: { type: Boolean, default: true, required: true },
    manualOverride: { type: String, enum: ["open", "closed", null], default: null },
    season: { type: String, enum: ["vinter", "sommar"], default: "vinter" },
    hours: { type: Schema.Types.Mixed, default: null },
    announcement: { type: String, default: "" },
    updatedBy: { type: String, maxlength: 100 },
  },
  { timestamps: true, versionKey: false, strict: false },
);

export type RestaurantSettingsDoc = {
  _id: string;
  onlineOrderingEnabled: boolean;
  manualOverride?: "open" | "closed" | null;
  season?: Season;
  hours?: CustomWeeklyHours;
  announcement?: string;
  updatedBy?: string;
};

if (models.RestaurantSettings) {
  delete (models as Record<string, unknown>).RestaurantSettings;
}

export const RestaurantSettingsModel =
  model<RestaurantSettingsDoc>("RestaurantSettings", restaurantSettingsSchema);
