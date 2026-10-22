import { createHmac } from "node:crypto";
import type { CheckoutSessionInfo, CreateSessionInput, StripeEventLite, StripeGateway } from "../../src/server/stripe-gateway.ts";

// A local stand-in for Stripe: no network, no keys. It keeps sessions in memory, can "pay" or "expire" them, and
// signs and verifies webhook bodies the way Stripe does (HMAC-SHA256 over "timestamp.body"), so the code that reads
// the raw body is exercised for real.

export const MOCK_WEBHOOK_SECRET = "whsec_mockSecretForTestsOnly";

// Shared by every MockStripe so session ids stay unique across tests that share one database.
let sessionCounter = 0;

type MockSession = CheckoutSessionInfo & { input: CreateSessionInput; totalOre: number };

export class MockStripe implements StripeGateway {
  sessions = new Map<string, MockSession>();
  byIdempotencyKey = new Map<string, string>();
  createCalls = 0;
  retrieveCalls = 0;
  /** Set to make the next retrieve/create calls fail like a network outage. */
  failNetwork = false;

  async createCheckoutSession(input: CreateSessionInput): Promise<CheckoutSessionInfo> {
    this.createCalls++;
    if (this.failNetwork) throw Object.assign(new Error("network down"), { type: "StripeConnectionError" });
    const known = this.byIdempotencyKey.get(input.idempotencyKey);
    if (known) return this.sessions.get(known)!;
    const id = `cs_test_mock${++sessionCounter}`;
    const totalOre = input.lines.reduce((a, l) => a + l.unitAmountOre, 0);
    const session: MockSession = {
      id,
      url: `https://checkout.stripe.test/c/pay/${id}`,
      status: "open",
      paymentStatus: "unpaid",
      amountTotal: totalOre,
      currency: "sek",
      paymentIntentId: null,
      clientReferenceId: input.publicId,
      expiresAt: input.expiresAt,
      input,
      totalOre,
    };
    this.sessions.set(id, session);
    this.byIdempotencyKey.set(input.idempotencyKey, id);
    return session;
  }

  async retrieveSession(sessionId: string): Promise<CheckoutSessionInfo> {
    this.retrieveCalls++;
    if (this.failNetwork) throw Object.assign(new Error("network down"), { type: "StripeConnectionError" });
    const s = this.sessions.get(sessionId);
    if (!s) throw Object.assign(new Error("No such session"), { type: "StripeInvalidRequestError" });
    return { ...s, url: s.status === "open" ? s.url : null };
  }

  /** The customer paid. `asynchronous` mimics a method where the session completes before the money arrives. */
  pay(sessionId: string, opts: { asynchronous?: boolean; amountOre?: number; currency?: string; reference?: string | null } = {}) {
    const s = this.mustGet(sessionId);
    s.status = "complete";
    s.paymentStatus = opts.asynchronous ? "unpaid" : "paid";
    s.paymentIntentId = `pi_test_${sessionId}`;
    if (opts.amountOre !== undefined) s.amountTotal = opts.amountOre;
    if (opts.currency !== undefined) s.currency = opts.currency;
    if (opts.reference !== undefined) s.clientReferenceId = opts.reference;
  }
  settleAsync(sessionId: string) {
    this.mustGet(sessionId).paymentStatus = "paid";
  }
  expire(sessionId: string) {
    this.mustGet(sessionId).status = "expired";
  }
  private mustGet(id: string) {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`unknown mock session ${id}`);
    return s;
  }

  async constructEvent(rawBody: string, signature: string): Promise<StripeEventLite> {
    verifySignature(rawBody, signature, MOCK_WEBHOOK_SECRET);
    const e = JSON.parse(rawBody) as { id: string; type: string; data: { object: { id?: string; object?: string } } };
    const o = e.data.object;
    return { id: e.id, type: e.type, sessionId: o.object === "checkout.session" && o.id ? o.id : null };
  }
}

export function signPayload(rawBody: string, secret = MOCK_WEBHOOK_SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

function verifySignature(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  if (!parts.t || parts.v1 !== expected) throw new Error("signature mismatch");
}

export function eventBody(id: string, type: string, sessionId: string): string {
  return JSON.stringify({ id, type, data: { object: { id: sessionId, object: "checkout.session" } } });
}
