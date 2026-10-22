import { connection } from "next/server";
import { getPublicMenu } from "../../../server/catalog-repo.ts";
import { connectDb } from "../../../server/db.ts";
import { json, serverError } from "../../../server/http.ts";

export async function GET() {
  // Always request-time: the build must never query the database.
  await connection();
  try {
    await connectDb();
    return json(await getPublicMenu());
  } catch (err) {
    return serverError(err);
  }
}
