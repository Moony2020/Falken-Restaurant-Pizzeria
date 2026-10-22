import { cartSchema } from "../../../../server/cart-schema.ts";
import { connectDb } from "../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../server/http.ts";
import { priceCartFromDb } from "../../../../server/orders-service.ts";

/** Prices a cart on the server so the browser can show authoritative totals. Stores nothing. */
export async function POST(request: Request) {
  const refused = guardWrite(request, "cart", 60);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = cartSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid_request", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }

  try {
    await connectDb();
    const result = await priceCartFromDb(parsed.data);
    if (!result.ok) return json({ error: "pricing", issues: result.issues }, 422);
    return json({
      lines: result.lines,
      subtotalSek: result.subtotalSek,
      totalSek: result.totalSek,
      currency: "SEK",
    });
  } catch (err) {
    return serverError(err);
  }
}
