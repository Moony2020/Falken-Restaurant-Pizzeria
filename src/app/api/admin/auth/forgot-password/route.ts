import { z } from "zod";
import { createPasswordResetToken, getAdminAuthConfig, normaliseStaffEmail } from "@/server/admin-auth.ts";
import { connectDb } from "@/server/db.ts";
import { sendPasswordResetEmail } from "@/server/email.ts";
import { guardWrite, json, readJsonBody, serverError } from "@/server/http.ts";
import { rateLimit } from "@/server/rate-limit.ts";

const forgotSchema = z
  .object({
    email: z.string().email().max(320),
  })
  .strict();

export async function POST(request: Request) {
  const refused = guardWrite(request, "admin-forgot-password-ip", 5);
  if (refused) return refused;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = forgotSchema.safeParse(body.value);
  if (!parsed.success) {
    return json({ error: "invalid_email", message: "Vänligen ange en giltig e-postadress." }, 400);
  }

  const normalisedEmail = normaliseStaffEmail(parsed.data.email);
  const byEmail = rateLimit(`admin-forgot-password-email:${normalisedEmail}`, {
    limit: 4,
    windowMs: 15 * 60_000,
  });
  if (!byEmail.allowed) {
    return json(
      { error: "rate_limited", message: "För många förfrågningar. Vänta en stund innan du försöker igen." },
      429,
      { "retry-after": String(byEmail.retryAfterSec) },
    );
  }

  try {
    const config = getAdminAuthConfig();
    await connectDb();

    const tokenResult = await createPasswordResetToken(normalisedEmail, config);

    if (tokenResult.userFound && tokenResult.rawToken) {
      const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
      const resetUrl = `${siteUrl}/admin/reset-password?token=${encodeURIComponent(tokenResult.rawToken)}`;

      await sendPasswordResetEmail({
        to: tokenResult.email,
        name: tokenResult.displayName,
        resetUrl,
      });
    }

    // Always return a positive message to avoid email enumeration
    return json({
      ok: true,
      message: "Om e-postadressen finns i vårt system har en återställningslänk skickats.",
    });
  } catch (error) {
    return serverError(error);
  }
}

