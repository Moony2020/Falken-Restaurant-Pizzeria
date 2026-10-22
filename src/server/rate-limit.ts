// Fixed-window limiter kept in memory. It slows down abuse on a single server instance; a shared store
// (Redis or the platform's edge limiter) is needed once the site runs on several instances.

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export type RateResult = { allowed: boolean; retryAfterSec: number };

export function rateLimit(
  key: string,
  { limit, windowMs, now = Date.now() }: { limit: number; windowMs: number; now?: number },
): RateResult {
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  w.count += 1;
  return w.count <= limit
    ? { allowed: true, retryAfterSec: 0 }
    : { allowed: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
}

export function resetRateLimits(): void {
  windows.clear();
}
