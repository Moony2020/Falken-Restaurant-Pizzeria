import mongoose from "mongoose";
import { RestaurantSettingsModel } from "../src/server/models/restaurant-settings.ts";
import { AuditLogModel } from "../src/server/models/events.ts";

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27018/falken_a7_browser_acceptance?directConnection=true";
  await mongoose.connect(uri);
  
  const settings = await RestaurantSettingsModel.findById("restaurant").lean();
  const audit = await AuditLogModel.find({ action: "restaurant_settings_updated" }).sort({ _id: -1 }).limit(2).lean();
  
  console.log("=== DB SETTINGS ===");
  console.log(JSON.stringify(settings, null, 2));
  console.log("=== DB AUDIT LOG ===");
  console.log(JSON.stringify(audit, null, 2));
  
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

