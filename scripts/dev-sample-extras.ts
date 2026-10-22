// DEV PREVIEW ONLY. Fills a throwaway LOCAL database with SAMPLE extras so the customiser can be looked at.
//
// These names and prices are placeholders, NOT the restaurant's: the owner sets the real extras and prices
// (plan §5). The script refuses to run against anything but a local database, so it can never put sample
// prices into Atlas.
//
// Usage (PowerShell/bash), after seeding the same local database:
//   MONGODB_URI=mongodb://127.0.0.1:27018/ MONGODB_DB=falken_preview node scripts/dev-sample-extras.ts
import mongoose from "mongoose";

const uri = process.env.MONGODB_URI ?? "";
const dbName = process.env.MONGODB_DB ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(uri) || !/preview|test/.test(dbName)) {
  console.error("Refusing to run: needs a local mongodb:// URI and a database name containing 'preview' or 'test'.");
  process.exit(1);
}

const sample: { group: string; names: [string, number][]; categories: string[] }[] = [
  {
    group: "extra",
    categories: ["pizza", "kebabpizza"],
    names: [["Extra ost", 10], ["Bacon", 20], ["Köttfärs", 20], ["Skinka", 20], ["Räkor", 20], ["Tonfisk", 20], ["Pepperoni", 20], ["Kebabkött", 20], ["Pommes", 20], ["Pizzasallad", 20]],
  },
  {
    group: "gronsaker",
    categories: ["pizza", "kebabpizza"],
    names: [["Champinjoner", 10], ["Lök", 10], ["Paprika", 10], ["Oliver", 10], ["Ananas", 10], ["Banan", 10], ["Tomat", 10], ["Fetaost", 15], ["Ruccola", 10]],
  },
  {
    group: "saser",
    categories: ["pizza", "kebabpizza", "kebab"],
    names: [["Bearnaisesås", 10], ["Vitlökssås", 10], ["Mild sås", 10], ["Kebabsås", 10], ["Stark sås", 10], ["Ketchup", 10]],
  },
];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");

await mongoose.connect(uri, { dbName });
const col = mongoose.connection.collection("modifiers");
let n = 0;
for (const g of sample) {
  for (const [name, price] of g.names) {
    await col.updateOne(
      { slug: `sample-${slug(name)}` },
      {
        $setOnInsert: {
          slug: `sample-${slug(name)}`,
          labelSv: name,
          groupSlug: g.group,
          priceByVariantSek: { normal: price, familj: price + 5 },
          maxQty: 1,
          compatibleCategories: g.categories,
          active: true,
          priceStatus: "confirmed",
        },
      },
      { upsert: true },
    );
    n++;
  }
}
console.log(`Sample extras ensured in ${dbName}: ${n} (SAMPLE prices, local preview only).`);
await mongoose.disconnect();
