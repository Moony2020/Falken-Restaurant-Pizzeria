import type { CartIssue } from "./cart-api.ts";

// The browser selects a payment route, while the server remains solely responsible for prices and statuses.

export type PublicOrder = {
  publicId: string;
  status: string;
  paymentStatus: string;
  paymentMethod: "card" | "pay_on_pickup";
  totalSek: number;
  pickupAt: string;
  items: { productNameSnapshot: string; variantNameSnapshot: string; quantity: number; lineTotalSek: number }[];
};

export type OrderResult =
  | { kind: "created" | "replayed"; order: PublicOrder }
  | { kind: "price_changed"; expectedSek: number; actualSek: number }
  | { kind: "issues"; issues: CartIssue[] }
  | { kind: "pickup_unavailable" }
  | { kind: "conflict" }
  | { kind: "rate_limited"; retryAfterSec: number }
  | { kind: "unavailable" }
  | { kind: "invalid" }
  | { kind: "network" };

export type Attempt = { key: string; fingerprint: string };

/** Same cart, contact and pickup time keeps the same key; any change starts a fresh attempt. */
export function resolveAttempt(stored: Attempt | null, fingerprint: string, newKey: () => string): Attempt {
  return stored && stored.fingerprint === fingerprint ? stored : { key: newKey(), fingerprint };
}

export const fingerprintOf = (parts: unknown): string => JSON.stringify(parts);

export type OrderBody = {
  idempotencyKey: string;
  items: unknown[];
  contact: { name: string; phone: string };
  pickupAt: string;
  expectedTotalSek: number;
  paymentMethod: "card" | "pay_on_pickup";
};

const inflight = new Map<string, Promise<OrderResult>>();

/**
 * Sends the order. A second call with the same idempotency key while the first is still running
 * returns the same promise, so a double click or a fast double tap can never send two requests.
 */
export function submitOrder(body: OrderBody, fetchImpl: typeof fetch = fetch): Promise<OrderResult> {
  const running = inflight.get(body.idempotencyKey);
  if (running) return running;
  const p = send(body, fetchImpl).finally(() => inflight.delete(body.idempotencyKey));
  inflight.set(body.idempotencyKey, p);
  return p;
}

async function send(body: OrderBody, fetchImpl: typeof fetch): Promise<OrderResult> {
  let res: Response;
  try {
    res = await fetchImpl("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Unknown outcome: the request may or may not have arrived. Retrying with the same key is safe.
    return { kind: "network" };
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // fall through to status handling
  }

  if (res.status === 201 || res.status === 200) {
    const order = data.order as PublicOrder | undefined;
    return order && typeof order.publicId === "string"
      ? { kind: res.status === 201 ? "created" : "replayed", order }
      : { kind: "unavailable" };
  }
  if (res.status === 429) return { kind: "rate_limited", retryAfterSec: Number(res.headers.get("retry-after")) || 30 };
  if (res.status === 409 && data.error === "price_changed") {
    const d = data.details as { expectedSek?: number; actualSek?: number } | undefined;
    return { kind: "price_changed", expectedSek: d?.expectedSek ?? 0, actualSek: d?.actualSek ?? 0 };
  }
  if (res.status === 409) return { kind: "conflict" };
  if (res.status === 422 && data.error === "pricing") return { kind: "issues", issues: (data.details as CartIssue[]) ?? [] };
  if (res.status === 422 && data.error === "pickup_unavailable") return { kind: "pickup_unavailable" };
  if (res.status === 400 || res.status === 413 || res.status === 415) return { kind: "invalid" };
  return { kind: "unavailable" };
}

/** Swedish text for outcomes that are not a success. */
export function orderFailureSv(result: OrderResult): string {
  switch (result.kind) {
    case "network":
      return "Vi nådde inte servern och vet inte om beställningen kom fram. Kontrollera uppkopplingen och försök igen – du får aldrig två beställningar av samma försök.";
    case "price_changed":
      return "Priset har ändrats sedan du granskade din beställning. Titta på de nya priserna och godkänn dem innan du går vidare.";
    case "issues":
      return "Någon rätt i varukorgen kan inte beställas just nu. Se markeringarna i varukorgen.";
    case "pickup_unavailable":
      return "Den valda hämtningstiden är inte längre tillgänglig. Välj en ny tid.";
    case "conflict":
      return "Det här försöket har redan använts för en annan beställning. Ladda om sidan och försök igen.";
    case "rate_limited":
      return `För många försök på kort tid. Vänta ${result.retryAfterSec} sekunder och försök igen.`;
    case "invalid":
      return "Uppgifterna kunde inte godkännas. Kontrollera namn och telefonnummer.";
    case "unavailable":
      return "Beställning är inte tillgänglig just nu. Försök igen om en stund eller ring oss.";
    default:
      return "";
  }
}
