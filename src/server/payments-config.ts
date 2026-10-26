import { z } from "zod";

// Payment configuration with a hard "test mode only" guard for this phase.
// There is no way to configure live payments here: a live Stripe key or
// PAYMENTS_MODE=live makes startup fail. Real payments need a separate, explicit decision and code change.
// Nothing here connects to a provider; it only validates configuration the owner puts in .env.local.

const stripeSecret = z
  .string()
  .regex(/^(sk|rk)_test_[A-Za-z0-9]+$/, "STRIPE_SECRET_KEY must be a TEST mode key (sk_test_… or rk_test_…)")
  .optional();

const schema = z.object({
  /** Master switch. Off by default: no checkout session is created until the owner turns this on. */
  PAYMENTS_ENABLED: z.enum(["true", "false"], { error: "PAYMENTS_ENABLED must be 'true' or 'false'" }).default("false"),
  /** Public address of the site, used for the return links after paying. Falls back to the request's own origin. */
  SITE_URL: z.url({ error: "SITE_URL must be a full URL such as https://example.com" }).optional(),
  PAYMENTS_MODE: z.literal("test", { error: "PAYMENTS_MODE must be 'test' in this phase" }).default("test"),
  STRIPE_SECRET_KEY: stripeSecret,
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9]+$/, "STRIPE_WEBHOOK_SECRET must look like whsec_…").optional(),
});

export type PaymentsConfig = {
  mode: "test";
  enabled: boolean;
  siteUrl?: string;
  stripe: { secretKey: string; webhookSecret?: string } | null;
};

const LIVE_PATTERNS = [/(^|[^a-z])(sk|rk|pk)_live_/i];

/** Parses payment settings. Errors name the variable that is wrong and never echo a secret value. */
export function getPaymentsConfig(source: Record<string, string | undefined> = process.env): PaymentsConfig {
  const pick = {
    PAYMENTS_ENABLED: source.PAYMENTS_ENABLED || undefined,
    SITE_URL: source.SITE_URL || undefined,
    PAYMENTS_MODE: source.PAYMENTS_MODE || undefined,
    STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: source.STRIPE_WEBHOOK_SECRET || undefined,
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

  return {
    mode: "test",
    enabled: c.PAYMENTS_ENABLED === "true",
    siteUrl: c.SITE_URL?.replace(/\/+$/, ""),
    stripe: c.STRIPE_SECRET_KEY ? { secretKey: c.STRIPE_SECRET_KEY, webhookSecret: c.STRIPE_WEBHOOK_SECRET } : null,
  };
}

/** Timings agreed for the payment flow. Stripe's minimum Checkout Session lifetime is 30 minutes. */
export const PAYMENT_SESSION_MINUTES = 30;
export const ORDER_EXPIRY_MINUTES = 45;
