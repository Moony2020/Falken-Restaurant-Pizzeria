import { connectDb } from "../../../../../server/db.ts";
import { getOrderTokenSecret } from "../../../../../server/env.ts";
import { guardWrite, json, orderAccessToken, serverError } from "../../../../../server/http.ts";
import { OrderModel, PaymentModel } from "../../../../../server/models/order.ts";
import { getPaymentsConfig } from "../../../../../server/payments-config.ts";
import { createSwishCheckout, settleSwishPayment } from "../../../../../server/swish-service.ts";
import { getSwishGateway } from "../../../../../server/swish-gateway.ts";

/**
 * Starts or retrieves a Swish payment request for an order.
 * Needs the order's access token (header `x-order-token`).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[publicId]/swish">) {
  const refused = guardWrite(request, "swish_checkout", 60);
  if (refused) return refused;

  const { publicId } = await ctx.params;
  try {
    const config = getPaymentsConfig();
    await connectDb();
    const result = await createSwishCheckout({
      publicId,
      token: orderAccessToken(request, publicId),
      origin: new URL(request.url).origin,
      tokenSecret: getOrderTokenSecret(),
      gateway: getSwishGateway(config),
      config,
    });

    switch (result.kind) {
      case "ok":
        return json({
          instructionUUID: result.instructionUUID,
          token: result.token,
          swishUrl: result.swishUrl,
          reused: result.reused,
          expiresAt: result.expiresAt,
        });
      case "unavailable":
        return json({ error: "payments_unavailable", message: "Swish betalning är inte tillgänglig just nu" }, 503);
      case "not_found":
        return json({ error: "not_found" }, 404);
      case "not_payable":
        return json({ error: "not_payable", status: result.status }, 409);
      case "expired":
        return json({ error: "order_expired" }, 409);
      case "paid":
        return json({ paid: true });
      case "too_many_attempts":
        return json({ error: "too_many_attempts" }, 409);
    }
  } catch (err) {
    console.error("Swish error:", err);
    return serverError(err);
  }
}

/**
 * Checks the real-time status of a Swish payment for an order.
 * Polls Swish directly to verify payment, settling the order immediately upon success.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/orders/[publicId]/swish">) {
  const { publicId } = await ctx.params;
  try {
    const token = orderAccessToken(request, publicId);
    if (!token) return json({ error: "unauthorized" }, 401);

    const config = getPaymentsConfig();
    const gateway = getSwishGateway(config);
    if (!gateway) return json({ error: "payments_unavailable" }, 503);

    await connectDb();
    const order = await OrderModel.findOne({ publicId }).lean();
    if (!order) return json({ error: "not_found" }, 404);

    if (order.fulfillmentStatus !== "PENDING_PAYMENT" && order.paymentStatus === "paid") {
      return json({ paid: true, status: "paid" });
    }

    const latestPayment = await PaymentModel.findOne({ orderId: order._id, provider: "swish" })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestPayment) {
      return json({ paid: false, status: "no_payment_session" });
    }

    if (latestPayment.status === "paid") {
      return json({ paid: true, status: "paid" });
    }

    // Verify directly with Swish
    try {
      const swishInfo = await gateway.retrievePaymentRequest(latestPayment.providerSessionId);
      if (swishInfo.status === "PAID") {
        const outcome = await settleSwishPayment(swishInfo, new Date());
        return json({ paid: outcome === "paid" || outcome === "already_paid", status: "paid", outcome });
      }

      if (swishInfo.status === "DECLINED" || swishInfo.status === "ERROR" || swishInfo.status === "CANCELLED") {
        await PaymentModel.updateOne({ _id: latestPayment._id, status: "pending" }, { $set: { status: "failed" } });
        return json({
          paid: false,
          status: "failed",
          errorCode: swishInfo.errorCode,
          errorMessage: swishInfo.errorMessage,
        });
      }

      return json({ paid: false, status: "pending" });
    } catch (e) {
      return json({ paid: false, status: "pending", error: (e as Error).message });
    }
  } catch (err) {
    return serverError(err);
  }
}

