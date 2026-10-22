import type { PaymentsConfig } from "./payments-config.ts";

// The only file that talks to Stripe. Everything else works against the StripeGateway interface, so the payment
// logic can be tested with a local fake and never needs a network or a key. TEST MODE ONLY: the configuration guard
// in payments-config.ts has already refused anything that looks like a live key before we get here.

export type SessionStatus = "open" | "complete" | "expired";

/** The parts of a Checkout Session we use. `paymentStatus` is what counts, not `status`: see applyStripePaid. */
export type CheckoutSessionInfo = {
  id: string;
  url: string | null;
  status: SessionStatus;
  paymentStatus: "paid" | "unpaid" | "no_payment_required";
  /** Smallest currency unit (öre for SEK). */
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  clientReferenceId: string | null;
  /** Unix seconds. */
  expiresAt: number;
};

export type CreateSessionInput = {
  publicId: string;
  orderId: string;
  lines: { name: string; unitAmountOre: number }[];
  successUrl: string;
  cancelUrl: string;
  /** Unix seconds. Stripe requires 30 minutes to 24 hours from now. */
  expiresAt: number;
  /** Same key = same session: a retried request can never create a second payment page. */
  idempotencyKey: string;
};

export type StripeEventLite = { id: string; type: string; sessionId: string | null };

export interface StripeGateway {
  createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSessionInfo>;
  retrieveSession(sessionId: string): Promise<CheckoutSessionInfo>;
  /** Verifies the signature of the RAW request body and returns the event. Throws when it can't be trusted. */
  constructEvent(rawBody: string, signature: string): Promise<StripeEventLite>;
}

type StripeSession = {
  id: string;
  url?: string | null;
  status?: string | null;
  payment_status?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
  client_reference_id?: string | null;
  expires_at?: number | null;
};

const toInfo = (s: StripeSession): CheckoutSessionInfo => ({
  id: s.id,
  url: s.url ?? null,
  status: s.status === "complete" || s.status === "expired" ? s.status : "open",
  paymentStatus: s.payment_status === "paid" || s.payment_status === "no_payment_required" ? s.payment_status : "unpaid",
  amountTotal: typeof s.amount_total === "number" ? s.amount_total : null,
  currency: s.currency ?? null,
  paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
  clientReferenceId: s.client_reference_id ?? null,
  expiresAt: s.expires_at ?? 0,
});

/** The real gateway. The SDK is loaded on first use so code paths that never pay don't pull it in. */
export function createStripeGateway(
  secretKey: string,
  webhookSecret: string | undefined,
  /** Only for tests, to point the SDK at a local fake server instead of api.stripe.com. */
  transport: { host: string; port: number; protocol: "http" | "https" } | null = null,
): StripeGateway {
  let client: Promise<import("stripe").default> | null = null;
  const stripe = () =>
    (client ??= import("stripe").then((m) => new m.default(secretKey, { maxNetworkRetries: transport ? 0 : 2, timeout: 15_000, ...(transport ?? {}) })));
  return {
    async createCheckoutSession(input) {
      const s = await (await stripe()).checkout.sessions.create(
        {
          mode: "payment",
          // Cards only, in SEK only (decision for this phase).
          allowed_payment_method_types: ["card"],
          currency: "sek",
          client_reference_id: input.publicId,
          metadata: { orderId: input.orderId, publicId: input.publicId },
          payment_intent_data: { metadata: { orderId: input.orderId, publicId: input.publicId } },
          line_items: input.lines.map((l) => ({
            quantity: 1,
            price_data: { currency: "sek", unit_amount: l.unitAmountOre, product_data: { name: l.name.slice(0, 250) } },
          })),
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          expires_at: input.expiresAt,
          locale: "sv",
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return toInfo(s as StripeSession);
    },
    async retrieveSession(sessionId) {
      return toInfo((await (await stripe()).checkout.sessions.retrieve(sessionId)) as StripeSession);
    },
    async constructEvent(rawBody, signature) {
      if (!webhookSecret) throw new Error("webhook secret not configured");
      const event = (await stripe()).webhooks.constructEvent(rawBody, signature, webhookSecret);
      const obj = event.data.object as { id?: string; object?: string };
      return { id: event.id, type: event.type, sessionId: obj.object === "checkout.session" && obj.id ? obj.id : null };
    },
  };
}

let cached: { key: string; gateway: StripeGateway } | null = null;
let override: StripeGateway | null = null;

/** Tests plug a fake in here (and pass null to remove it). Never used in production code. */
export function setStripeGatewayForTests(gateway: StripeGateway | null) {
  override = gateway;
}

/** The gateway for the current configuration, or null when Stripe isn't configured or payments are switched off. */
export function getStripeGateway(config: PaymentsConfig): StripeGateway | null {
  if (override) return override;
  if (!config.enabled || !config.stripe) return null;
  const key = `${config.stripe.secretKey}|${config.stripe.webhookSecret ?? ""}`;
  if (cached?.key !== key) cached = { key, gateway: createStripeGateway(config.stripe.secretKey, config.stripe.webhookSecret) };
  return cached.gateway;
}
