import { z } from "zod";
import { clearAdminSessionCookies, getAdminAuthConfig, resetPasswordWithToken } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "@/server/http.ts";

const resetSchema = z
  .object({
    token: z.string().min(16).max(256),
    password: z.string().min(8, "Lösenordet måste vara minst 8 tecken.").max(512),
  })
  .strict();

export async function POST(request: Request) {
  const refused = guardWrite(request, "admin-reset-password-ip", 10);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = resetSchema.safeParse(body.value);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Ogiltig information.";
    return json({ error: "validation_error", message: errorMsg }, 400);
  }

  try {
    const config = getAdminAuthConfig();
    await connectDb();

    const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password, config);
    if (!result.ok) {
      return json({ error: "reset_failed", message: result.error }, 400);
    }

    const response = json({
      ok: true,
      message: "Lösenordet har uppdaterats. Du kan nu logga in med ditt nya lösenord.",
    });
    // Immediately clear all existing admin session cookies in the browser
    clearAdminSessionCookies(response, request);
    return response;
  } catch (error) {
    return serverError(error);
  }
}

