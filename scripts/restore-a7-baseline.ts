import mongoose from "mongoose";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { StaffUserModel } from "../src/server/models/staff.ts";
import { AuditLogModel } from "../src/server/models/events.ts";

const TEST_PORT = 27018;
const TEST_DB = "falken_a7_browser_acceptance";

async function main() {
  await mongoose.connect(`mongodb://127.0.0.1:${TEST_PORT}/${TEST_DB}?directConnection=true`);
  if (mongoose.connection.port !== TEST_PORT || mongoose.connection.name !== TEST_DB) {
    throw new Error("FAIL-CLOSED: Not connected to isolated test DB");
  }

  // Restore baseline settings
  await RestaurantSettingsModel.deleteMany({});
  await StaffUserModel.deleteMany({});
  await AuditLogModel.deleteMany({ entityId: "restaurant" });

  await RestaurantSettingsModel.create({
    _id: "restaurant",
    name: "Falken Baseline",
    legalName: "Restaurang & Pizzeria Falken AB",
    tagline: "Restaurang & Pizzeria",
    phone: "019 29 48 98",
    email: "kontakt@falken.se",
    address: {
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
    },
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=Restaurang+%26+Pizzeria+Falken",
    social: {
      facebook: "https://www.facebook.com/FalkenVintrosa/",
      instagram: "https://www.instagram.com/falkenvintrosa/",
    },
    heroImage: "/images/hero/Hero-image.webp",
    menuHeroImage: "/images/menu/menu-hero.webp",
    contactHeroImage: "/images/gallery/restaurant1.webp",
    galleryHeroImage: "/images/gallery/gallery-hero.webp",
    prepMinutes: 10,
    lastPickupBeforeClose: 15,
    onlineOrderingEnabled: true,
    manualOverride: null,
    season: "vinter",
    __v: 0,
  });

  console.log("Restored baseline state in falken_a7_browser_acceptance");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
