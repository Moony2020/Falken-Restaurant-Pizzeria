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
    // A7 Identity & Contact fields
    name: { type: String, maxlength: 60 },
    legalName: { type: String, maxlength: 100 },
    tagline: { type: String, maxlength: 100 },
    phone: { type: String, maxlength: 30 },
    email: { type: String, maxlength: 100 },
    address: {
      street: { type: String, maxlength: 100 },
      zip: { type: String, maxlength: 20 },
      city: { type: String, maxlength: 50 },
      country: { type: String, maxlength: 50, default: "Sverige" },
    },
    mapsUrl: { type: String, maxlength: 500 },
    social: {
      facebook: { type: String, maxlength: 300 },
      instagram: { type: String, maxlength: 300 },
    },
    heroImage: { type: String, maxlength: 200 },
    menuHeroImage: { type: String, maxlength: 200 },
    contactHeroImage: { type: String, maxlength: 200 },
    galleryHeroImage: { type: String, maxlength: 200 },
    prepMinutes: { type: Number, min: 5, max: 120 },
    lastPickupBeforeClose: { type: Number, min: 0, max: 60 },
    __v: { type: Number, default: 0 },
  },
  { timestamps: true, strict: false },
);

export type RestaurantSettingsDoc = {
  _id: string;
  onlineOrderingEnabled: boolean;
  manualOverride?: "open" | "closed" | null;
  season?: Season;
  hours?: CustomWeeklyHours;
  announcement?: string;
  updatedBy?: string;
  name?: string;
  legalName?: string;
  tagline?: string;
  phone?: string;
  email?: string;
  address?: {
    street?: string;
    zip?: string;
    city?: string;
    country?: string;
  };
  mapsUrl?: string;
  social?: {
    facebook?: string;
    instagram?: string;
  };
  heroImage?: string;
  menuHeroImage?: string;
  contactHeroImage?: string;
  galleryHeroImage?: string;
  prepMinutes?: number;
  lastPickupBeforeClose?: number;
  __v?: number;
  updatedAt?: Date | string;
  createdAt?: Date | string;
};

if (models.RestaurantSettings) {
  delete (models as Record<string, unknown>).RestaurantSettings;
}

export const RestaurantSettingsModel =
  model<RestaurantSettingsDoc>("RestaurantSettings", restaurantSettingsSchema);
