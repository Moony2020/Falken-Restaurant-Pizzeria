import { rateLimit } from "./rate-limit.ts";

// Small helpers shared by the route handlers. Plain Request/Response so tests can call handlers directly.

const MAX_BODY_BYTES = 20_000;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export function clientIp(request: Request): string {
  // Only trustworthy behind a proxy that sets this header (Vercel/Render do). Used for rate limiting only.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Browsers send Origin on cross-site POSTs. Reject when it names another site (CSRF defence). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; they have no ambient cookies to abuse
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

export async function readJsonBody(request: Request): Promise<BodyResult> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: json({ error: "unsupported_media_type" }, 415) };
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, response: json({ error: "payload_too_large" }, 413) };

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { ok: false, response: json({ error: "payload_too_large" }, 413) };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: json({ error: "invalid_json" }, 400) };
  }
}

/** Common guards for a write endpoint. Returns a Response when the request must be refused. */
export function guardWrite(request: Request, bucket: string, limit: number): Response | null {
  if (!sameOrigin(request)) return json({ error: "forbidden_origin" }, 403);
  const rl = rateLimit(`${bucket}:${clientIp(request)}`, { limit, windowMs: 60_000 });
  if (!rl.allowed) return json({ error: "rate_limited" }, 429, { "retry-after": String(rl.retryAfterSec) });
  return null;
}

/** Unexpected failure: log the cause server-side, tell the client nothing about internals. */
export function serverError(err: unknown): Response {
  console.error("API error:", err instanceof Error ? err.message : "unknown");
  const unavailable = err instanceof Error && /Invalid server environment|Invalid payments configuration|ECONNREFUSED|ServerSelection|buffering timed out/i.test(err.message);
  return json({ error: unavailable ? "service_unavailable" : "internal_error" }, unavailable ? 503 : 500);
}
