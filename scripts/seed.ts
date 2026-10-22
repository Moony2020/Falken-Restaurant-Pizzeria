// Usage: npm run db:seed   (reads MONGODB_URI from .env.local)
import { connectDb, disconnectDb } from "../src/server/db.ts";
import { seedCatalog } from "../src/server/seed.ts";

try {
  await connectDb();
  const result = await seedCatalog();
  console.log(`Seed finished. Inserted: ${result.categories} categories, ${result.products} products, ${result.modifiers} modifiers.`);
  console.log("Existing documents were left untouched.");
} catch (err) {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
