import { z } from "zod";
import { authenticateStaff, createAdminSession, getAdminAuthConfig, normaliseStaffEmail, publicPrincipal, setAdminSessionCookies } from "../../../../../server/admin-auth.ts";
import { connectDb } from "../../../../../server/db.ts";
import { guardWrite, json, readJsonBody, serverError } from "../../../../../server/http.ts";
import { rateLimit } from "../../../../../server/rate-limit.ts";

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
}).strict();

// Never reveal whether a specific email has a staff account.
const invalidCredentials = () => json({ error: "invalid_credentials" }, 401);

export async function POST(request: Request) {
  const refused = guardWrite(request, "admin-login-ip", 10);
  if (refused) return refused;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) return invalidCredentials();

  const byEmail = rateLimit(`admin-login-email:${normaliseStaffEmail(parsed.data.email)}`, { limit: 8, windowMs: 15 * 60_000 });
  if (!byEmail.allowed) return json({ error: "rate_limited" }, 429, { "retry-after": String(byEmail.retryAfterSec) });

  try {
    const config = getAdminAuthConfig();
    await connectDb();
    const user = await authenticateStaff(parsed.data.email, parsed.data.password);
    if (!user) return invalidCredentials();
    const session = await createAdminSession(user, config);
    const response = json({ staff: publicPrincipal(session.principal) });
    setAdminSessionCookies(response, request, session, config);
    return response;
  } catch (error) {
    return serverError(error);
  }
}
