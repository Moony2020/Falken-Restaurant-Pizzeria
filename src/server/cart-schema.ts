import { z } from "zod";
import { IF_UNAVAILABLE } from "../data/modifier-groups.ts";

// What a browser is allowed to send. There is deliberately no price, name, total or status field:
// strictObject rejects any unknown key, so a tampered request fails validation instead of being half-trusted.

const slug = z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "invalid identifier");

export const cartItemSchema = z.strictObject({
  productSlug: slug,
  variantId: slug,
  quantity: z.number().int().min(1).max(20),
  removedIngredients: z.array(z.string().min(1).max(60)).max(30).default([]),
  modifiers: z
    .array(z.strictObject({ slug, quantity: z.number().int().min(1).max(10) }))
    .max(10)
    .default([]),
  note: z.string().max(200).default(""),
  /** What to do if part of the dish can't be made. Kitchen instruction only; never affects price. */
  ifUnavailable: z.enum(IF_UNAVAILABLE).default("call"),
});

export const cartSchema = z.strictObject({
  items: z.array(cartItemSchema).min(1).max(30),
});

export const orderRequestSchema = z.strictObject({
  /** Generated once per checkout attempt by the browser; a retry reuses it. */
  idempotencyKey: z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/, "invalid key"),
  items: cartSchema.shape.items,
  contact: z.strictObject({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(6).max(20).regex(/^[+0-9][0-9 ()-]*$/, "invalid phone number"),
  }),
  pickupAt: z.iso.datetime({ offset: true }),
  /** The client may choose the payment route, but never a payment status or provider result. */
  paymentMethod: z.enum(["card", "pay_on_pickup"]).default("card"),
  /**
   * The total the customer saw and approved. It is never used as a price: the server recomputes everything
   * and refuses the order with 409 if its own total differs, so a stale cart can't be charged a new amount.
   */
  expectedTotalSek: z.number().int().min(0).optional(),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;
export type CartInput = z.infer<typeof cartSchema>;
export type OrderRequest = z.infer<typeof orderRequestSchema>;
