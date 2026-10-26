// Browser side of card payment. The browser only ever asks the server to start a payment or to report an order's
// state; it never says how much to charge and never decides that something is paid.

export type StartPaymentResult =
  | { kind: "redirect"; url: string }
  | { kind: "paid" }
  | { kind: "processing" }
  | { kind: "unavailable" } // payments switched off or not set up yet
  | { kind: "expired" }
  | { kind: "not_payable" }
  | { kind: "rate_limited" }
  | { kind: "network" }
  | { kind: "error" };

const authHeader = (token?: string): Record<string, string> =>
  token ? { "x-order-token": token } : {};

export async function startCardPayment(
  publicId: string,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StartPaymentResult> {
  let res: Response;
  try {
    res = await fetchImpl(
      `/api/orders/${encodeURIComponent(publicId)}/checkout`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader(token) },
        body: "{}",
      },
    );
  } catch {
    return { kind: "network" };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // handled by status below
  }
  // Only an https address is ever followed, so a tampered answer can't send the customer somewhere odd.
  if (
    res.status === 200 &&
    typeof data.url === "string" &&
    /^https:\/\//.test(data.url)
  )
    return { kind: "redirect", url: data.url };
  if (res.status === 200 && data.paid === true) return { kind: "paid" };
  if (res.status === 202) return { kind: "processing" };
  if (res.status === 503) return { kind: "unavailable" };
  if (res.status === 429) return { kind: "rate_limited" };
  if (res.status === 409)
    return { kind: data.error === "order_expired" ? "expired" : "not_payable" };
  return { kind: res.status === 404 ? "not_payable" : "error" };
}

export type OrderStatusView = {
  publicId: string;
  status: string;
  paymentStatus: string;
  paymentMethod: "card" | "pay_on_pickup";
  totalSek: number;
  pickupAt: string;
  paidAt: string | null;
  items: {
    productNameSnapshot: string;
    variantNameSnapshot: string;
    quantity: number;
    lineTotalSek: number;
    modifiersSnapshot: {
      labelSv: string;
      priceSek: number;
      quantity: number;
    }[];
    removedIngredients: string[];
    note: string;
  }[];
};

export type StatusResult =
  | { kind: "ok"; order: OrderStatusView }
  | { kind: "denied" }
  | { kind: "network" }
  | { kind: "error" };

export async function fetchOrderStatus(
  publicId: string,
  token?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<StatusResult> {
  try {
    const res = await fetchImpl(
      `/api/orders/${encodeURIComponent(publicId)}/status`,
      { headers: authHeader(token), cache: "no-store" },
    );
    if (res.status === 404) return { kind: "denied" };
    if (!res.ok) return { kind: "error" };
    const data = (await res.json()) as { order?: OrderStatusView };
    return data.order ? { kind: "ok", order: data.order } : { kind: "error" };
  } catch {
    return { kind: "network" };
  }
}

/** Swedish text for a payment that could not be started. */
export function startPaymentFailureSv(result: StartPaymentResult): string {
  switch (result.kind) {
    case "unavailable":
      return "Betalning online är inte tillgänglig just nu. Din beställning är sparad men obetald. Ring oss så hjälper vi dig.";
    case "expired":
      return "Tiden för att betala den här beställningen har gått ut. Gör en ny beställning.";
    case "not_payable":
      return "Betalningen kunde inte startas för den här beställningen. Påbörja en ny beställning eller ring oss så hjälper vi dig.";
    case "rate_limited":
      return "För många försök på kort tid. Vänta en stund och försök igen.";
    case "network":
      return "Vi nådde inte servern. Kontrollera uppkopplingen och försök igen – du debiteras inte två gånger.";
    case "processing":
      return "Din betalning är på väg och bekräftas inom kort.";
    default:
      return "Betalningen kunde inte startas. Försök igen om en stund.";
  }
}
