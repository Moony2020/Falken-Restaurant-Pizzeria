import { createHash } from "node:crypto";
import mongoose, { Types } from "mongoose";
import { OrderModel, PaymentModel } from "../src/server/models/order.ts";
import { StaffUserModel } from "../src/server/models/staff.ts";
import { createAdminSession, getAdminAuthConfig, hashPassword } from "../src/server/admin-auth.ts";

function makeHash(str: string) {
  return createHash("sha256").update(str).digest("hex");
}

const TEST_URI = "mongodb://127.0.0.1:27018/falken_a8_browser_acceptance?directConnection=true";

export const R2_FIXTURE_IDS = [
  "R2PA1DSTR1",
  "R2P1CKSTR2",
  "R2N0PA1D03",
  "R2CANCEED4",
  "R2FA1ED005",
  "R2PENDNG06",
];

async function main() {
  await mongoose.connect(TEST_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  // Clean old fixtures
  await OrderModel.deleteMany({
    $or: [
      { publicId: { $in: [...R2_FIXTURE_IDS, "R2EFAILED5", "R2PENDING6", "R2_UNPAID_POP", "R2_PAID_STRIPE", "R2_PICKED_UP_PAID", "R2_CANCELLED_EXISTING"] } },
      { idempotencyKey: { $regex: /^idem_r2_/ } },
    ],
  });
  await PaymentModel.deleteMany({
    $or: [
      { orderPublicId: { $in: [...R2_FIXTURE_IDS, "R2_UNPAID_POP", "R2_PAID_STRIPE", "R2_PICKED_UP_PAID", "R2_CANCELLED_EXISTING"] } },
      { providerSessionId: { $regex: /r2/i } },
    ],
  });

  // Ensure Admin staff user
  let staff = await StaffUserModel.findOne({ email: "r2-admin@falken-test.local" });
  if (!staff) {
    const passwordHash = await hashPassword("AdminR2Test2026!Secure");
    staff = await StaffUserModel.create({
      email: "r2-admin@falken-test.local",
      displayName: "R2 Admin Tester",
      role: "ADMIN",
      passwordHash,
      active: true,
      authVersion: 1,
    });
  }

  const authConfig = getAdminAuthConfig(process.env);

  const session = await createAdminSession(
    {
      id: staff._id as Types.ObjectId,
      email: staff.email,
      displayName: staff.displayName,
      role: staff.role as "ADMIN",
      authVersion: staff.authVersion,
    },
    authConfig
  );

  const now = new Date();
  const pickupAt = new Date(Date.now() + 3600000);

  // 1. Unpaid Pay-on-Pickup order (R2N0PA1D03)
  const unpaidOrder = {
    publicId: "R2N0PA1D03",
    idempotencyKey: "idem_r2_unpaid_pop",
    requestHash: makeHash("hash_r2_unpaid_pop_001"),
    contact: { name: "Johan Avbrytsson", phone: "070-111 22 33" },
    items: [
      {
        productSlug: "vesuvio",
        productNameSnapshot: "Vesuvio",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 120,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 120,
      },
      {
        productSlug: "coca-cola",
        productNameSnapshot: "Coca-Cola 33cl",
        variantId: "default",
        variantNameSnapshot: "Standard",
        basePriceSek: 25,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 25,
      },
    ],
    subtotalSek: 145,
    discountSek: 0,
    totalSek: 145,
    currency: "SEK",
    pickupAt,
    paymentMethod: "pay_on_pickup",
    paymentStatus: "unpaid",
    fulfillmentStatus: "CONFIRMED",
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CONFIRMED", actorType: "system" },
    ],
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  // 2. Refunded Stripe Order (R2PA1DSTR1)
  const stripeOrderId = new Types.ObjectId();
  const stripePaymentId = new Types.ObjectId();
  const stripeOrder = {
    _id: stripeOrderId,
    publicId: "R2PA1DSTR1",
    idempotencyKey: "idem_r2_paid_stripe",
    requestHash: makeHash("hash_r2_paid_stripe_002"),
    contact: { name: "Anna Återbetalning", phone: "072-444 55 66" },
    items: [
      {
        productSlug: "kebabtallrik",
        productNameSnapshot: "Kebabtallrik",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 130,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 130,
      },
      {
        productSlug: "margherita",
        productNameSnapshot: "Margherita",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 100,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 100,
      },
    ],
    subtotalSek: 230,
    discountSek: 0,
    totalSek: 230,
    currency: "SEK" as const,
    pickupAt,
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "refunded",
    paymentId: stripePaymentId,
    paidAt: now,
    fulfillmentStatus: "CANCELLED",
    cancelledAt: now,
    totalRefundedSek: 230,
    refundRecord: {
      amountSek: 230,
      reasonCategory: "customer_cancellation",
      reasonNote: "Kunden avbokade via telefon innan tillagning.",
      canonicalProvider: "stripe",
      externalReference: "re_1234567890abcdef_test",
      canonicalReference: "re_1234567890abcdef_test",
      verificationTier: "admin_attested",
      recordedBy: String(staff._id),
      recordedAt: now,
      idempotencyKey: "idem_r2_refund_test",
      requestHash: makeHash("hash_refund_test_001"),
    },
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CONFIRMED", actorType: "payment" },
      { at: now, from: "CONFIRMED", to: "CANCELLED", actorType: "staff", actorId: String(staff._id) },
    ],
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  const stripePaymentDoc = {
    _id: stripePaymentId,
    orderId: stripeOrderId,
    orderPublicId: "R2PA1DSTR1",
    provider: "stripe",
    providerSessionId: "cs_test_r2_stripe_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    providerPaymentId: "pi_test_r2_stripe_12345",
    status: "refunded",
    amountSek: 230,
    refundedSek: 230,
    currency: "SEK" as const,
    processedEventIds: [],
    createdAt: now,
    updatedAt: now,
  };

  // 3. Paid Swish Order, already PICKED_UP (R2P1CKSTR2)
  const swishOrderId = new Types.ObjectId();
  const swishPaymentId = new Types.ObjectId();
  const pickedUpOrder = {
    _id: swishOrderId,
    publicId: "R2P1CKSTR2",
    idempotencyKey: "idem_r2_picked_up_paid",
    requestHash: makeHash("hash_r2_picked_up_paid_003"),
    contact: { name: "Magnus Hämtad", phone: "073-777 88 99" },
    items: [
      {
        productSlug: "kebabrulle",
        productNameSnapshot: "Kebabrulle",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 120,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 120,
      },
      {
        productSlug: "pepsi-max",
        productNameSnapshot: "Pepsi Max 33cl",
        variantId: "default",
        variantNameSnapshot: "Standard",
        basePriceSek: 25,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 25,
      },
      {
        productSlug: "vitlokssas",
        productNameSnapshot: "Vitlökssås",
        variantId: "default",
        variantNameSnapshot: "Standard",
        basePriceSek: 35,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 35,
      },
    ],
    subtotalSek: 180,
    discountSek: 0,
    totalSek: 180,
    currency: "SEK",
    pickupAt,
    paymentMethod: "swish",
    paymentProvider: "swish",
    paymentStatus: "paid",
    paymentId: swishPaymentId,
    paidAt: now,
    fulfillmentStatus: "PICKED_UP",
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CONFIRMED", actorType: "payment" },
      { at: now, from: "CONFIRMED", to: "PREPARING", actorType: "staff", actorId: String(staff._id) },
      { at: now, from: "PREPARING", to: "READY_FOR_PICKUP", actorType: "staff", actorId: String(staff._id) },
      { at: now, from: "READY_FOR_PICKUP", to: "PICKED_UP", actorType: "staff", actorId: String(staff._id) },
    ],
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  const swishPaymentDoc = {
    _id: swishPaymentId,
    orderId: swishOrderId,
    orderPublicId: "R2P1CKSTR2",
    provider: "swish",
    providerSessionId: "swish_test_r2_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    providerPaymentId: "swish_payment_ref_987654",
    status: "paid",
    amountSek: 180,
    refundedSek: 0,
    currency: "SEK",
    processedEventIds: [],
    createdAt: now,
    updatedAt: now,
  };

  // 4. Existing Cancelled Order (R2CANCEED4)
  const cancelledOrder = {
    publicId: "R2CANCEED4",
    idempotencyKey: "idem_r2_cancelled_existing",
    requestHash: makeHash("hash_r2_cancelled_existing_004"),
    contact: { name: "Olof Avbruten", phone: "076-222 33 44" },
    items: [
      {
        productSlug: "margherita",
        productNameSnapshot: "Margherita",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 95,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 95,
      },
    ],
    subtotalSek: 95,
    discountSek: 0,
    totalSek: 95,
    currency: "SEK",
    pickupAt,
    paymentMethod: "pay_on_pickup",
    paymentStatus: "unpaid",
    fulfillmentStatus: "CANCELLED",
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CONFIRMED", actorType: "system" },
      { at: now, from: "CONFIRMED", to: "CANCELLED", actorType: "staff", actorId: String(staff._id) },
    ],
    cancelledAt: now,
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  // 5. Cancelled Electronic Order with paymentStatus='failed' (R2FA1ED005)
  const failedElectronicOrder = {
    publicId: "R2FA1ED005",
    idempotencyKey: "idem_r2_failed_electronic",
    requestHash: makeHash("hash_r2_failed_electronic_005"),
    contact: { name: "Erik Elektronikfel", phone: "070-555 66 77" },
    items: [
      {
        productSlug: "calzone",
        productNameSnapshot: "Calzone",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 115,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 115,
      },
    ],
    subtotalSek: 115,
    discountSek: 0,
    totalSek: 115,
    currency: "SEK" as const,
    pickupAt,
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "failed",
    fulfillmentStatus: "CANCELLED",
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CANCELLED", actorType: "system", reason: "payment_failed" },
    ],
    cancelledAt: now,
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  // 6. Active Pending Online Order with active session (R2PENDNG06)
  const pendingOnlineOrderId = new Types.ObjectId();
  const pendingOnlinePaymentId = new Types.ObjectId();
  const pendingOnlineOrder = {
    _id: pendingOnlineOrderId,
    publicId: "R2PENDNG06",
    idempotencyKey: "idem_r2_pending_online",
    requestHash: makeHash("hash_r2_pending_online_006"),
    contact: { name: "Petra Pending", phone: "070-888 99 00" },
    items: [
      {
        productSlug: "vesuvio",
        productNameSnapshot: "Vesuvio",
        variantId: "normal",
        variantNameSnapshot: "Normal",
        basePriceSek: 120,
        modifiersSnapshot: [],
        removedIngredients: [],
        quantity: 1,
        lineTotalSek: 120,
      },
    ],
    subtotalSek: 120,
    discountSek: 0,
    totalSek: 120,
    currency: "SEK" as const,
    pickupAt,
    paymentMethod: "card",
    paymentProvider: "stripe",
    paymentStatus: "pending",
    paymentExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // Active session in future
    paymentId: pendingOnlinePaymentId,
    fulfillmentStatus: "CONFIRMED",
    statusHistory: [
      { at: now, from: "PENDING_PAYMENT", to: "CONFIRMED", actorType: "system" },
    ],
    sellerSnapshot: {
      name: "Falken Baseline",
      legalName: "Restaurang & Pizzeria Falken AB",
      street: "Skolgatan 4",
      zip: "719 30",
      city: "Vintrosa",
      country: "Sverige",
      phone: "019 29 48 98",
    },
    createdAt: now,
    updatedAt: now,
  };

  const pendingOnlinePaymentDoc = {
    _id: pendingOnlinePaymentId,
    orderId: pendingOnlineOrderId,
    orderPublicId: "R2PENDNG06",
    provider: "stripe",
    providerSessionId: "cs_test_r2_pending_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    status: "pending",
    amountSek: 120,
    refundedSek: 0,
    currency: "SEK" as const,
    processedEventIds: [],
    createdAt: now,
    updatedAt: now,
  };

  await OrderModel.insertMany([unpaidOrder, stripeOrder, pickedUpOrder, cancelledOrder, failedElectronicOrder, pendingOnlineOrder]);
  await PaymentModel.insertMany([stripePaymentDoc, swishPaymentDoc, pendingOnlinePaymentDoc]);

  const output = {
    sessionToken: session.token,
    csrfToken: session.csrfToken,
    adminEmail: staff.email,
    fixtureIds: R2_FIXTURE_IDS,
  };

  console.log("R2_FIXTURES_READY:" + JSON.stringify(output));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("Fixture setup failed:", e);
  process.exit(1);
});
