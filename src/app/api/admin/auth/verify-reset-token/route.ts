import { getAdminAuthConfig, verifyPasswordResetToken } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";
import { json, serverError } from "@/server/http.ts";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return json({ valid: false, reason: "missing_token" }, 400);
  }

  try {
    const config = getAdminAuthConfig();
    await connectDb();

    const check = await verifyPasswordResetToken(token, config);
    if (!check.valid) {
      return json({ valid: false, reason: check.reason }, 200);
    }

    return json({
      valid: true,
      email: check.user.email,
      name: check.user.displayName,
    });
  } catch (error) {
    return serverError(error);
  }
}

