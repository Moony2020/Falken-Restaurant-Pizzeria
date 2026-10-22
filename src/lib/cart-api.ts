import type { CartLine } from "./cart-store.ts";

// Talking to POST /api/cart/validate: the server prices the cart, the browser only displays the answer.

export type PricedLineView = {
  productSlug: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  basePriceSek: number;
  removedIngredients: string[];
  modifiersSnapshot: { modifierSlug: string; labelSv: string; priceSek: number; quantity: number }[];
  quantity: number;
  lineTotalSek: number;
};

export type CartIssue = { index: number; code: string; message: string };

export type CartPricing =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lines: PricedLineView[]; subtotalSek: number; totalSek: number }
  | { status: "issues"; issues: CartIssue[] }
  | { status: "error"; reason: "network" | "server" | "rate_limited" };

/** What the server is told about the cart. Deliberately no price, name or total. */
export function toPayloadItems(lines: CartLine[]) {
  return lines.map((l) => ({
    productSlug: l.productSlug,
    variantId: l.variantId,
    quantity: l.quantity,
    removedIngredients: l.removed,
    modifiers: l.modifiers,
    note: l.note,
    ifUnavailable: l.ifUnavailable,
  }));
}

const isReady = (v: unknown, expectedLines: number): v is { lines: PricedLineView[]; subtotalSek: number; totalSek: number } => {
  if (!v || typeof v !== "object") return false;
  const r = v as { lines?: unknown; subtotalSek?: unknown; totalSek?: unknown };
  return Array.isArray(r.lines) && r.lines.length === expectedLines && Number.isInteger(r.subtotalSek) && Number.isInteger(r.totalSek);
};

export async function validateCart(lines: CartLine[], fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<CartPricing> {
  let res: Response;
  try {
    res = await fetchImpl("/api/cart/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: toPayloadItems(lines) }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { status: "error", reason: "network" };
  }

  if (res.status === 429) return { status: "error", reason: "rate_limited" };

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { status: "error", reason: "server" };
  }

  if (res.status === 422) {
    const issues = (data as { issues?: CartIssue[] }).issues;
    return Array.isArray(issues) ? { status: "issues", issues } : { status: "error", reason: "server" };
  }
  if (res.ok && isReady(data, lines.length)) {
    return { status: "ready", lines: data.lines, subtotalSek: data.subtotalSek, totalSek: data.totalSek };
  }
  return { status: "error", reason: "server" };
}

export type PriceChange = { key: string; from: number; to: number };

/** Lines whose server price differs from the total the customer last saw. */
export function priceChanges(lines: CartLine[], priced: PricedLineView[]): PriceChange[] {
  const out: PriceChange[] = [];
  lines.forEach((line, i) => {
    const now = priced[i]?.lineTotalSek;
    if (now !== undefined && line.seenTotalSek !== undefined && line.seenTotalSek !== now) {
      out.push({ key: line.key, from: line.seenTotalSek, to: now });
    }
  });
  return out;
}

/** Totals for lines the customer has not seen priced yet (first sighting; no change warning). */
export function firstSightings(lines: CartLine[], priced: PricedLineView[]): Record<string, number> {
  const out: Record<string, number> = {};
  lines.forEach((line, i) => {
    const now = priced[i]?.lineTotalSek;
    if (now !== undefined && line.seenTotalSek === undefined) out[line.key] = now;
  });
  return out;
}

/** Customer-facing Swedish text for the reasons the server can refuse a line. */
export function issueMessageSv(code: string, productName?: string): string {
  const text = issueTextSv(code);
  return productName ? `${productName}: ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

function issueTextSv(code: string): string {
  switch (code) {
    case "unknown_product":
    case "product_unavailable":
      return `rätten är inte tillgänglig just nu.`;
    case "unknown_variant":
    case "variant_unavailable":
      return `den valda storleken är inte tillgänglig just nu.`;
    case "price_unconfirmed":
      return `priset är inte bekräftat än, så rätten kan inte beställas online just nu.`;
    case "removal_not_allowed":
    case "unknown_ingredient":
      return `det går inte att ta bort den valda ingrediensen.`;
    case "unknown_modifier":
    case "modifier_unavailable":
    case "modifier_not_allowed":
    case "modifier_price_unconfirmed":
    case "modifier_quantity":
    case "duplicate_modifier":
      return `ett tillval är inte tillgängligt just nu.`;
    default:
      return `raden kan inte beställas just nu.`;
  }
}
