import { rateLimit } from "./rate-limit.ts";

// Small helpers shared by the route handlers. Plain Request/Response so tests can call handlers directly.

const MAX_BODY_BYTES = 20_000;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const orderCookie = (publicId: string) => `falken_order_${publicId}`;

/** A same-browser, HttpOnly proof that survives the return from Stripe without exposing a token in a URL. */
export function setOrderAccessCookie(response: Response, request: Request, publicId: string, token: string) {
  const secure = request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
  response.headers.append("set-cookie", `${orderCookie(publicId)}=${encodeURIComponent(token)}; Path=/; Max-Age=2700; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`);
}

export function orderAccessToken(request: Request, publicId: string): string | null {
  const header = request.headers.get("x-order-token");
  if (header) return header;
  const prefix = `${orderCookie(publicId)}=`;
  const part = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(prefix));
  if (!part) return null;
  try { return decodeURIComponent(part.slice(prefix.length)); } catch { return null; }
}

export function clientIp(request: Request): string {
  // Only trustworthy behind a proxy that sets this header (Vercel/Render do). Used for rate limiting only.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Resolves trusted site hosts from environment and approved deployment platforms.
 */
function getTrustedHosts(): Set<string> {
  const hosts = new Set<string>();

  const configuredSite = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredSite) {
    try {
      hosts.add(new URL(configuredSite).host.toLowerCase());
    } catch {
      // ignore malformed custom env
    }
  }

  // Known production platforms for this project
  hosts.add("falkenrestaurant.onrender.com");
  hosts.add("falken-restaurant-pizzeria.vercel.app");

  // Local development / tests
  hosts.add("localhost:3000");
  hosts.add("127.0.0.1:3000");
  hosts.add("localhost");
  hosts.add("127.0.0.1");

  return hosts;
}

/** Browsers send Origin on cross-site POSTs. Reject when it names another site (CSRF defence). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; they have no ambient cookies to abuse
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    const originProtocol = originUrl.protocol;

    // Reject non-HTTPS origin in production
    const isProduction = process.env.NODE_ENV === "production";
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isHttpsRequest = forwardedProto === "https" || new URL(request.url).protocol === "https:";
    if (isProduction && isHttpsRequest && originProtocol !== "https:") {
      return false;
    }

    const trustedHosts = getTrustedHosts();

    // Check if originHost is directly recognized
    if (trustedHosts.has(originHost)) {
      const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()?.toLowerCase();
      const hostHeader = request.headers.get("host")?.trim()?.toLowerCase();
      const urlHost = new URL(request.url).host.toLowerCase();

      // Ensure the request itself target matches the origin
      if (
        originHost === forwardedHost ||
        originHost === hostHeader ||
        originHost === urlHost
      ) {
        return true;
      }
    }

    // Strict same-origin match when request.url host equals origin host
    const directUrl = new URL(request.url);
    if (originUrl.origin === directUrl.origin) {
      return true;
    }

    return false;
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
