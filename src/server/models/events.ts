import mongoose, { type Model } from "mongoose";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./constants.ts";

// mongoose is CommonJS: destructure the default export so this also loads under plain Node ESM.
const { model, models, Schema } = mongoose;

// ---- Webhook events ------------------------------------------------------------------------------------------
// One document per event a payment provider sent us. It is what makes event handling safe to repeat:
//
//   received ──claim──▶ processing ──done──▶ processed
//                          │  ▲
//                 error    ▼  │ retry (provider resends, or a person re-runs it)
//                         failed
//
// A processing claim carries a lease. If the worker dies mid-way the lease expires and the event can be
// claimed again, so a crash never loses a payment. Events can arrive twice, at the same time, or out of order:
// the unique index plus the order state machine make every one of those cases harmless.

export const WEBHOOK_STATUS = ["received", "processing", "processed", "failed"] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUS)[number];

const webhookEventSchema = new Schema(
  {
    provider: { type: String, enum: PAYMENT_PROVIDER, required: true },
    eventId: { type: String, required: true, maxlength: 200 },
    type: { type: String, required: true, maxlength: 100 },
    status: { type: String, enum: WEBHOOK_STATUS, default: "received", index: true },
    attempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date },
    /** What the handler decided, e.g. "paid", "already_paid", "late_payment". */
    outcome: { type: String, maxlength: 100 },
    /** Short, secret-free description of the last failure. */
    lastError: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export type WebhookEventDoc = {
  provider: PaymentProvider;
  eventId: string;
  type: string;
  status: WebhookStatus;
  attempts: number;
  lockedUntil?: Date;
  receivedAt: Date;
  processedAt?: Date;
  outcome?: string;
  lastError?: string;
};

export const WebhookEventModel =
  (models.WebhookEvent as Model<WebhookEventDoc> | undefined) ?? model<WebhookEventDoc>("WebhookEvent", webhookEventSchema);

// ---- Audit log -------------------------------------------------------------------------------------------------
// Append-only record of things that matter but don't belong inside an order: unusual payment outcomes, expiry
// decisions, rejected transitions. (Order status changes themselves are recorded atomically on the order.)

const auditLogSchema = new Schema(
  {
    at: { type: Date, required: true, index: true },
    action: { type: String, required: true, maxlength: 100, index: true },
    entity: { type: String, required: true, maxlength: 30 },
    entityId: { type: String, required: true, maxlength: 100, index: true },
    actorType: { type: String, enum: ["payment", "staff", "system", "customer"], required: true },
    actorId: { type: String, maxlength: 100 },
    /** Small, secret-free facts only: amounts, ids, statuses. Never card data, never full provider payloads. */
    detail: { type: Schema.Types.Mixed },
  },
  { timestamps: false },
);

export type AuditLogDoc = {
  at: Date;
  action: string;
  entity: string;
  entityId: string;
  actorType: "payment" | "staff" | "system" | "customer";
  actorId?: string;
  detail?: Record<string, unknown>;
};

export const AuditLogModel = (models.AuditLog as Model<AuditLogDoc> | undefined) ?? model<AuditLogDoc>("AuditLog", auditLogSchema);
