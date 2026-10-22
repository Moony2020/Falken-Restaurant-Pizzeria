import { z } from "zod";

// Payment configuration with a hard "test mode only" guard for this phase.
// There is no way to configure live payments here: a live Stripe key, a live PayPal host or
// PAYMENTS_MODE=live makes startup fail. Real payments need a separate, explicit decision and code change.
// Nothing here connects to a provider; it only validates configuration the owner puts in .env.local.

const stripeSecret = z
  .string()
  .regex(/^(sk|rk)_test_[A-Za-z0-9]+$/, "STRIPE_SECRET_KEY must be a TEST mode key (sk_test_… or rk_test_…)")
  .optional();

const schema = z.object({
  PAYMENTS_MODE: z.literal("test", { error: "PAYMENTS_MODE must be 'test' in this phase" }).default("test"),
  STRIPE_SECRET_KEY: stripeSecret,
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9]+$/, "STRIPE_WEBHOOK_SECRET must look like whsec_…").optional(),
  PAYPAL_ENV: z.literal("sandbox", { error: "PAYPAL_ENV must be 'sandbox' in this phase" }).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().min(10).optional(),
  PAYPAL_CLIENT_SECRET: z.string().min(10).optional(),
  PAYPAL_WEBHOOK_ID: z.string().min(5).optional(),
});

export type PaymentsConfig = {
  mode: "test";
  stripe: { secretKey: string; webhookSecret?: string } | null;
  paypal: { env: "sandbox"; baseUrl: string; clientId: string; clientSecret: string; webhookId?: string } | null;
};

export const PAYPAL_SANDBOX_URL = "https://api-m.sandbox.paypal.com";

const LIVE_PATTERNS = [/(^|[^a-z])(sk|rk|pk)_live_/i, /api-m\.paypal\.com/i, /api\.paypal\.com/i];

/** Parses payment settings. Errors name the variable that is wrong and never echo a secret value. */
export function getPaymentsConfig(source: Record<string, string | undefined> = process.env): PaymentsConfig {
  const pick = {
    PAYMENTS_MODE: source.PAYMENTS_MODE || undefined,
    STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: source.STRIPE_WEBHOOK_SECRET || undefined,
    PAYPAL_ENV: source.PAYPAL_ENV || undefined,
    PAYPAL_CLIENT_ID: source.PAYPAL_CLIENT_ID || undefined,
    PAYPAL_CLIENT_SECRET: source.PAYPAL_CLIENT_SECRET || undefined,
    PAYPAL_WEBHOOK_ID: source.PAYPAL_WEBHOOK_ID || undefined,
  };

  // A live credential anywhere is refused outright, with a message that doesn't repeat the value.
  for (const [name, value] of Object.entries(pick)) {
    if (value && LIVE_PATTERNS.some((p) => p.test(value))) {
      throw new Error(`Invalid payments configuration: ${name} looks like a LIVE credential. Live payments are disabled in this phase.`);
    }
  }

  const parsed = schema.safeParse(pick);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid payments configuration: ${problems}`);
  }
  const c = parsed.data;

  if (!!c.PAYPAL_CLIENT_ID !== !!c.PAYPAL_CLIENT_SECRET) {
    throw new Error("Invalid payments configuration: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set together");
  }

  return {
    mode: "test",
    stripe: c.STRIPE_SECRET_KEY ? { secretKey: c.STRIPE_SECRET_KEY, webhookSecret: c.STRIPE_WEBHOOK_SECRET } : null,
    paypal:
      c.PAYPAL_CLIENT_ID && c.PAYPAL_CLIENT_SECRET
        ? { env: "sandbox", baseUrl: PAYPAL_SANDBOX_URL, clientId: c.PAYPAL_CLIENT_ID, clientSecret: c.PAYPAL_CLIENT_SECRET, webhookId: c.PAYPAL_WEBHOOK_ID }
        : null,
  };
}

/** Timings agreed for the payment flow. Stripe's minimum Checkout Session lifetime is 30 minutes. */
export const PAYMENT_SESSION_MINUTES = 30;
export const ORDER_EXPIRY_MINUTES = 45;
