import mongoose, { type InferSchemaType } from "mongoose";
import { STAFF_ROLE } from "./constants.ts";

// Mongoose is CommonJS: destructure its default export so local Node ESM tests can load this model too.
const { Schema, model, models } = mongoose;

const staffUserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
    displayName: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, enum: STAFF_ROLE, index: true },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, required: true, default: true, index: true },
    // Only the out-of-band bootstrap command can create this unique initial admin marker.
    bootstrapAdmin: { type: Boolean, required: true, default: false, immutable: true },
    // Incrementing this invalidates every session for this user immediately.
    authVersion: { type: Number, required: true, default: 1 },
  },
  { timestamps: true, collection: "staff_users" },
);

staffUserSchema.index({ email: 1 }, { unique: true });
staffUserSchema.index({ bootstrapAdmin: 1 }, { unique: true, partialFilterExpression: { bootstrapAdmin: true } });

const staffSessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    csrfTokenHash: { type: String, required: true, select: false },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "StaffUser", index: true },
    authVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null, index: true },
    lastSeenAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "staff_sessions" },
);

// Cleanup only; every authorization decision also checks expiresAt and revokedAt itself.
staffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const staffPasswordResetSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, select: false },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "StaffUser", index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "staff_password_resets" },
);

staffPasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type StaffUserDoc = InferSchemaType<typeof staffUserSchema>;
export type StaffSessionDoc = InferSchemaType<typeof staffSessionSchema>;
export type StaffPasswordResetDoc = InferSchemaType<typeof staffPasswordResetSchema>;

export const StaffUserModel = models.StaffUser || model("StaffUser", staffUserSchema);
export const StaffSessionModel = models.StaffSession || model("StaffSession", staffSessionSchema);
export const StaffPasswordResetModel = models.StaffPasswordReset || model("StaffPasswordReset", staffPasswordResetSchema);
