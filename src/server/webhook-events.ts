import type { PaymentProvider } from "./models/constants.ts";
import { WebhookEventModel } from "./models/events.ts";

// Handling a provider event safely, in three steps:  claim  →  do the work  →  complete (or fail).
//  - claim: the event is recorded and this worker takes a time-limited lease on it.
//  - complete: marks it processed. A processed event is never run again.
//  - fail: marks it failed so the provider's retry (or a person) can run it again.
// If the worker dies after claiming, the lease runs out and the event can be claimed again. An event is
// therefore never "used up" just because it was seen, which is how payments get lost.

export const DEFAULT_LEASE_MS = 60_000;

export type ClaimResult =
  | { kind: "claimed"; attempts: number }
  | { kind: "duplicate" } // already processed: answer 200, do nothing
  | { kind: "in_progress" }; // another worker holds a live lease: answer with a retryable status

const isDuplicateKey = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;

export async function claimWebhookEvent(args: {
  provider: PaymentProvider;
  eventId: string;
  type: string;
  now?: Date;
  leaseMs?: number;
}): Promise<ClaimResult> {
  const { provider, eventId, type, now = new Date(), leaseMs = DEFAULT_LEASE_MS } = args;

  try {
    await WebhookEventModel.create({ provider, eventId, type, receivedAt: now, status: "received" });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e; // seen before: fall through and try to claim it
  }

  const claimed = await WebhookEventModel.findOneAndUpdate(
    {
      provider,
      eventId,
      $or: [{ status: "received" }, { status: "failed" }, { status: "processing", lockedUntil: { $lt: now } }],
    },
    { $set: { status: "processing", lockedUntil: new Date(now.getTime() + leaseMs) }, $inc: { attempts: 1 } },
    { new: true },
  ).lean();
  if (claimed) return { kind: "claimed", attempts: claimed.attempts };

  const current = await WebhookEventModel.findOne({ provider, eventId }).lean();
  return current?.status === "processed" ? { kind: "duplicate" } : { kind: "in_progress" };
}

/** Marks the event processed. Only works while it is still being processed, so a stale worker can't overwrite a newer one. */
export async function completeWebhookEvent(provider: PaymentProvider, eventId: string, outcome: string, now = new Date()): Promise<boolean> {
  const r = await WebhookEventModel.updateOne(
    { provider, eventId, status: "processing" },
    { $set: { status: "processed", processedAt: now, outcome: outcome.slice(0, 100) }, $unset: { lockedUntil: "" } },
  );
  return r.modifiedCount === 1;
}

/** Marks the event failed so it can be retried. The message is cut short and scrubbed of anything key-shaped. */
export async function failWebhookEvent(provider: PaymentProvider, eventId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : "unknown error")
    .replace(/(sk|rk|pk)_(test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|Bearer\s+\S+|mongodb(\+srv)?:\/\/\S+/gi, "<redacted>")
    .slice(0, 300);
  await WebhookEventModel.updateOne(
    { provider, eventId, status: "processing" },
    { $set: { status: "failed", lastError: message }, $unset: { lockedUntil: "" } },
  );
}
