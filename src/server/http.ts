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

function parseHostAndPort(rawHost: string): { hostname: string; port: string | null } | null {
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    const closeBracket = trimmed.indexOf("]");
    if (closeBracket === -1) return null; // Malformed IPv6
    const hostname = trimmed.slice(1, closeBracket);
    const rest = trimmed.slice(closeBracket + 1);
    if (!rest) return { hostname: `[${hostname}]`, port: null };
    if (!rest.startsWith(":")) return null; // Malformed
    const port = rest.slice(1);
    if (!/^\d+$/.test(port)) return null;
    return { hostname: `[${hostname}]`, port };
  }

  const parts = trimmed.split(":");
  if (parts.length === 1) {
    return { hostname: parts[0], port: null };
  }
  if (parts.length === 2) {
    if (!/^\d+$/.test(parts[1])) return null;
    return { hostname: parts[0], port: parts[1] };
  }
  // More than one colon without brackets is invalid
  return null;
}

function canonicalHost(rawHost: string, protocol = "https:"): string | null {
  const parsed = parseHostAndPort(rawHost);
  if (!parsed) return null;

  const defaultPort = protocol === "https:" || protocol === "https" ? "443" : protocol === "http:" || protocol === "http" ? "80" : null;
  const isDefaultPort = !parsed.port || parsed.port === defaultPort;

  return isDefaultPort ? parsed.hostname : `${parsed.hostname}:${parsed.port}`;
}

function isInternalHost(rawHost: string): boolean {
  const parsed = parseHostAndPort(rawHost);
  if (!parsed) return false;
  const h = parsed.hostname.startsWith("[") && parsed.hostname.endsWith("]")
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("127.") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    h === "::" ||
    h === "0:0:0:0:0:0:0:1" ||
    h === "0:0:0:0:0:0:0:0"
  );
}

/**
 * Resolves the trusted origin (or allowed origins) for the current deployment environment.
 * In production:
 *   1. Prioritizes explicitly configured SITE_URL (or NEXT_PUBLIC_SITE_URL).
 *      - Fails closed if configured with localhost / loopback (including IPv6 [::1]).
 *      - Fails closed if configured with an insecure http: protocol.
 *      - Fails closed if conflicting with detected hosting platform (e.g. Vercel domain on Render).
 *      - Never silently combines SITE_URL with other platform origins.
 *   2. If SITE_URL is not set, detects whether running on Render (RENDER=true) or Vercel (VERCEL=1),
 *      and binds ONLY to that platform's canonical origin (never both simultaneously).
 *   3. If in production and neither valid SITE_URL nor platform is detected, fails closed (empty set).
 * In non-production (development and testing):
 *   Allows localhost / 127.0.0.1 / [::1] and configured SITE_URL.
 */
export function getDeploymentTrustedOrigins(): Set<string> {
  const isProduction = process.env.NODE_ENV === "production";
  const origins = new Set<string>();

  const isRender = process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
  const isVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);

  const configuredSite = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;

  if (isProduction) {
    if (configuredSite) {
      try {
        const parsed = new URL(configuredSite);
        const host = parsed.host.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();

        // In production, configured site must be https
        if (parsed.protocol !== "https:") {
          return origins; // Fails closed
        }

        // In production, localhost or loopback (IPv4/IPv6) is never a trusted browser origin
        if (isInternalHost(host) || isInternalHost(hostname) || hostname === "localhost" || hostname === "127.0.0.1") {
          return origins; // Fails closed
        }

        // Detect conflicting deployment environment vs SITE_URL
        if (isRender && hostname.endsWith(".vercel.app")) {
          return origins; // Conflicting configuration fails closed
        }
        if (isVercel && hostname.endsWith(".onrender.com")) {
          return origins; // Conflicting configuration fails closed
        }

        // Authoritative configured origin (strictly single deployment origin, no combining)
        origins.add(parsed.origin.toLowerCase());
        return origins;
      } catch {
        // Malformed URL fails closed
        return origins;
      }
    }

    // Platform-specific defaults when SITE_URL is not provided
    if (isRender) {
      origins.add("https://falkenrestaurant.onrender.com");
    } else if (isVercel) {
      origins.add("https://falken-restaurant-pizzeria.vercel.app");
    }
    // If neither SITE_URL nor platform detection is set, fails closed (empty set).
  } else {
    // Non-production (dev, test)
    if (configuredSite) {
      try {
        origins.add(new URL(configuredSite).origin.toLowerCase());
      } catch {
        // ignore malformed in dev
      }
    }
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
    origins.add("http://[::1]:3000");
    origins.add("http://localhost");
    origins.add("http://127.0.0.1");
    origins.add("http://[::1]");
  }

  return origins;
}

/**
 * Browsers send Origin on cross-site POSTs. Reject when it names another site (CSRF defence).
 * R2 Security Hardening Rules:
 *  1. In production, Origin MUST use the 'https:' scheme. Any 'http:' Origin is rejected unconditionally.
 *  2. In production, Origin MUST be an approved deployment origin (localhost and loopbacks forbidden).
 *  3. Header-spoofing prevention:
 *     - If the request targets a specific server, the Origin must match the deployment origin that
 *       this specific deployment is serving (verified against host / forwarded-host / direct URL, including canonical ports).
 *     - Conflicting host and x-forwarded-host headers are rejected.
 *  4. Fails closed: if no trusted origins exist or mismatch occurs, returns false.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients; they have no ambient cookies to abuse

  try {
    const originUrl = new URL(origin);
    const originProtocol = originUrl.protocol;
    const originHost = originUrl.host.toLowerCase();
    const isProduction = process.env.NODE_ENV === "production";

    // Non-production (development / test) exact same-origin bypass
    // Allows legitimate local domains such as http://shop.test during tests
    if (!isProduction) {
      try {
        const directOrigin = new URL(request.url).origin.toLowerCase();
        if (originUrl.origin.toLowerCase() === directOrigin) {
          return true;
        }
      } catch {
        // Continue to trusted origins check
      }
    }

    // In production, reject any Origin that does not use https:
    if (isProduction && originProtocol !== "https:") {
      return false;
    }

    // In production, reject any localhost / loopback Origin
    if (isProduction && isInternalHost(originHost)) {
      return false;
    }

    const trustedOrigins = getDeploymentTrustedOrigins();
    if (trustedOrigins.size === 0) {
      return false; // Fail closed if no trusted origins configured or on conflict
    }

    // Origin must be in the approved deployment trusted origins
    const normalizedOrigin = originUrl.origin.toLowerCase();
    if (!trustedOrigins.has(normalizedOrigin)) {
      return false;
    }

    // Determine the host the request actually arrived at
    const rawForwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()?.toLowerCase();
    const rawHostHeader = request.headers.get("host")?.trim()?.toLowerCase();
    const rawUrlHost = new URL(request.url).host.toLowerCase();

    const canonicalOriginHost = canonicalHost(originHost, originProtocol);
    if (!canonicalOriginHost) return false;

    // Verify proxy headers and host consistency
    if (rawForwardedHost) {
      // In reverse-proxy environments (Render/Vercel):
      // forwardedHost must match originHost (including port matching!)
      const canonicalForwarded = canonicalHost(rawForwardedHost, originProtocol);
      if (!canonicalForwarded || canonicalOriginHost !== canonicalForwarded) {
        return false;
      }
      // If hostHeader is also present and represents a public domain (not an internal container host),
      // it must not conflict with forwardedHost
      if (rawHostHeader && !isInternalHost(rawHostHeader)) {
        const canonicalHeader = canonicalHost(rawHostHeader, originProtocol);
        if (!canonicalHeader || canonicalHeader !== canonicalForwarded) {
          return false;
        }
      }
    } else if (rawHostHeader) {
      const canonicalHeader = canonicalHost(rawHostHeader, originProtocol);
      const canonicalUrl = canonicalHost(rawUrlHost, originProtocol);
      if (
        !canonicalHeader ||
        (canonicalOriginHost !== canonicalHeader && canonicalOriginHost !== canonicalUrl)
      ) {
        return false;
      }
    } else {
      const canonicalUrl = canonicalHost(rawUrlHost, originProtocol);
      if (canonicalOriginHost !== canonicalUrl) {
        return false;
      }
    }

    return true;
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
