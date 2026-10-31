import mongoose from "mongoose";

const { model, models, Schema } = mongoose;

const restaurantSettingsSchema = new Schema(
  {
    _id: { type: String, default: "restaurant" },
    onlineOrderingEnabled: { type: Boolean, default: true, required: true },
    manualOverride: { type: String, enum: ["open", "closed", null], default: null },
    updatedBy: { type: String, maxlength: 100 },
  },
  { timestamps: true, versionKey: false, strict: false },
);

export type RestaurantSettingsDoc = {
  _id: string;
  onlineOrderingEnabled: boolean;
  manualOverride?: "open" | "closed" | null;
  updatedBy?: string;
};

if (models.RestaurantSettings) {
  delete (models as Record<string, unknown>).RestaurantSettings;
}

export const RestaurantSettingsModel =
  model<RestaurantSettingsDoc>("RestaurantSettings", restaurantSettingsSchema);
