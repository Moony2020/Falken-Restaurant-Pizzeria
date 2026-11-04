import mongoose, { type Model, type Types } from "mongoose";
import { PAYMENT_METHOD, type PaymentMethod } from "./constants.ts";

const { model, models, Schema } = mongoose;

export type AdminNotificationDoc = {
  orderId: Types.ObjectId;
  publicId: string;
  customerName: string;
  totalSek: number;
  paymentMethod: PaymentMethod;
  paymentStatus: "paid" | "unpaid";
  fulfillmentStatus: string;
  pickupAt: Date;
  orderCreatedAt: Date;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const adminNotificationSchema = new Schema<AdminNotificationDoc>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true, index: true },
    publicId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    totalSek: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHOD, required: true },
    paymentStatus: { type: String, enum: ["paid", "unpaid"], required: true },
    fulfillmentStatus: { type: String, required: true },
    pickupAt: { type: Date, required: true },
    orderCreatedAt: { type: Date, required: true },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

adminNotificationSchema.index({ createdAt: -1 });

export const AdminNotificationModel =
  (models.AdminNotification as Model<AdminNotificationDoc> | undefined) ??
  model<AdminNotificationDoc>("AdminNotification", adminNotificationSchema);

