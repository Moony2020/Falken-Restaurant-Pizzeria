import { connectDb } from "../../../../server/db.ts";
import { json } from "../../../../server/http.ts";
import { getEffectiveRestaurantSettings } from "../../../../server/restaurant-settings-service.ts";

export async function GET() {
  try {
    await connectDb();
    const settings = await getEffectiveRestaurantSettings();
    return json(settings, 200, {
      "cache-control": "no-store, must-revalidate",
    });
  } catch {
    // If DB is unreachable, return safe static defaults
    const fallback = await getEffectiveRestaurantSettings();
    return json(fallback, 200, {
      "cache-control": "no-store, must-revalidate",
    });
  }
}
