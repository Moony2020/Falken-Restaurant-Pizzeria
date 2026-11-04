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
  SWISH_ENABLED: z.enum(["true", "false"]).optional(),
  SWISH_PAYEE_ALIAS: z.string().regex(/^[0-9]{10,13}$/, "SWISH_PAYEE_ALIAS must be 10-13 digits").optional(),
  SWISH_CERT_PATH: z.string().optional(),
  SWISH_KEY_PATH: z.string().optional(),
  SWISH_CA_PATH: z.string().optional(),
  SWISH_PASSPHRASE: z.string().optional(),
  SWISH_BASE_URL: z.string().optional(),
});

export type PaymentsConfig = {
  mode: "test";
  enabled: boolean;
  siteUrl?: string;
  stripe: { secretKey: string; webhookSecret?: string } | null;
  swish: {
    enabled: boolean;
    payeeAlias: string;
    certPath: string;
    keyPath: string;
    caPath: string;
    passphrase?: string;
    baseUrl: string;
  } | null;
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
    SWISH_ENABLED: source.SWISH_ENABLED || undefined,
    SWISH_PAYEE_ALIAS: source.SWISH_PAYEE_ALIAS || undefined,
    SWISH_CERT_PATH: source.SWISH_CERT_PATH || undefined,
    SWISH_KEY_PATH: source.SWISH_KEY_PATH || undefined,
    SWISH_CA_PATH: source.SWISH_CA_PATH || undefined,
    SWISH_PASSPHRASE: source.SWISH_PASSPHRASE || undefined,
    SWISH_BASE_URL: source.SWISH_BASE_URL || undefined,
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
    swish:
      c.SWISH_ENABLED === "true" || source.SWISH_ENABLED === "true" || source.SWISH_PAYEE_ALIAS || (c.PAYMENTS_ENABLED === "true" && c.SWISH_ENABLED !== "false")
        ? {
            enabled: c.SWISH_ENABLED !== "false",
            payeeAlias: c.SWISH_PAYEE_ALIAS ?? "1234679304",
            certPath: c.SWISH_CERT_PATH ?? "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.pem",
            keyPath: c.SWISH_KEY_PATH ?? "certs/swish/client_cert/Swish_Merchant_TestCertificate_1234679304.key",
            caPath: c.SWISH_CA_PATH ?? "certs/swish/client_cert/Swish_TLS_RootCA.pem",
            passphrase: c.SWISH_PASSPHRASE ?? "swish",
            baseUrl: c.SWISH_BASE_URL ?? "https://mss.cpc.getswish.net",
          }
        : null,
  };
}

/** Timings agreed for the payment flow. Stripe's minimum Checkout Session lifetime is 30 minutes. */
export const PAYMENT_SESSION_MINUTES = 30;
export const ORDER_EXPIRY_MINUTES = 45;
