import mongoose from "mongoose";
import { hashPassword } from "../src/server/admin-auth.ts";
import { StaffUserModel, StaffSessionModel } from "../src/server/models/staff.ts";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { CategoryModel, ProductModel, ModifierModel } from "../src/server/models/catalog.ts";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { AuditLogModel } from "../src/server/models/events.ts";
import { seedCatalog } from "../src/server/seed.ts";

const TEST_PORT = 27018;
const TEST_DB = "falken_a8_browser_acceptance";
const TEST_URI = `mongodb://127.0.0.1:${TEST_PORT}/${TEST_DB}?directConnection=true`;

async function main() {
  await mongoose.connect(TEST_URI);
  if (mongoose.connection.port !== TEST_PORT || mongoose.connection.name !== TEST_DB) {
    throw new Error(`FAIL-CLOSED: Connected to port ${mongoose.connection.port} / db ${mongoose.connection.name}, expected ${TEST_PORT} / ${TEST_DB}`);
  }

  // 1. Clean test collections
  await Promise.all([
    RestaurantSettingsModel.deleteMany({}),
    StaffUserModel.deleteMany({}),
    StaffSessionModel.deleteMany({}),
    CategoryModel.deleteMany({}),
    ProductModel.deleteMany({}),
    ModifierModel.deleteMany({}),
    OrderModel.deleteMany({}),
    PaymentModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);

  // 2. Seed catalog (pizzas, modifiers, categories)
  const seedResult = await seedCatalog();
  console.log(`Catalog seeded: ${seedResult.categories} categories, ${seedResult.products} products, ${seedResult.modifiers} modifiers.`);

  // 3. Baseline settings document (__v: 0)
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

  // 4. Test Admin user
  const passwordHash = await hashPassword("AdminTest1234!");
  await StaffUserModel.create({
    email: "admin-test@falken-acceptance.local",
    displayName: "Acceptance Test Admin",
    role: "ADMIN",
    passwordHash,
    active: true,
    authVersion: 1,
  });

  console.log("A8 TEST DB READY: Catalog seeded, baseline settings (__v: 0) and Admin user created.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
