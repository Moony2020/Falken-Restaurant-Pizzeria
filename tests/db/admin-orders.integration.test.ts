import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { GET as listRoute } from "../../src/app/api/admin/orders/route.ts";
import { GET as detailRoute } from "../../src/app/api/admin/orders/[publicId]/route.ts";
import { POST as transitionRoute } from "../../src/app/api/admin/orders/[publicId]/transition/route.ts";
import { createAdminSession, createStaffUser, ADMIN_CSRF_COOKIE, ADMIN_SESSION_COOKIE } from "../../src/server/admin-auth.ts";
import { listAdminOrders, getAdminOrder } from "../../src/server/admin-orders.ts";
import { OrderModel, PaymentModel } from "../../src/server/models/order.ts";
import { StaffSessionModel, StaffUserModel } from "../../src/server/models/staff.ts";
import { AuditLogModel } from "../../src/server/models/events.ts";

const uri = process.env.MONGODB_URI_TEST;
const safe = !!uri && /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[\w-]*_test(\?.*)?$/.test(uri);
const originalSecret = process.env.ADMIN_SESSION_SECRET;
let n = 0;
let cookie = "";
let csrf = "";
const url = "https://falken.test/api/admin/orders";
const params = (publicId: string) => ({ params: Promise.resolve({ publicId }) });
function req(path = url, init: RequestInit = {}) { return new Request(path, init); }
async function makeOrder(over: Record<string, unknown> = {}) {
  const item = { productSlug: "vesuvio", productNameSnapshot: "Vesuvio", variantId: "family", variantNameSnapshot: "Familj", basePriceSek: 150, quantity: 2, lineTotalSek: 330, modifiersSnapshot: [{ modifierSlug: "extra-ost", labelSv: "Extra ost", quantity: 1, priceSek: 15 }], removedIngredients: ["Skinka"], note: "Utan lök" };
  return OrderModel.create({
    publicId: `T${String(++n).padStart(9, "0")}`,
    idempotencyKey: `admin-orders-test-${String(n).padStart(8, "0")}`,
    requestHash: "a".repeat(64), items: [item], subtotalSek: 330, totalSek: 330,
    pickupAt: new Date("2026-10-27T15:30:00Z"), contact: { name: `Anna ${n}`, phone: `070-123 45 ${String(n).padStart(2, "0")}` },
    fulfillmentStatus: "CONFIRMED", paymentMethod: "pay_on_pickup", paymentStatus: "unpaid", ...over,
  });
}

describe("A3 admin orders, isolated local MongoDB", { skip: !uri ? "MONGODB_URI_TEST not set" : false }, () => {
  before(async () => {
    assert.ok(safe, "Only local mongodb:// and an _test database are permitted");
    process.env.ADMIN_SESSION_SECRET = randomBytes(40).toString("base64url");
    await mongoose.connect(uri as string, { dbName: "falken_admin_orders_test", serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
    await Promise.all([OrderModel, PaymentModel, StaffUserModel, StaffSessionModel, AuditLogModel].map((model) => model.init()));
    const staff = await createStaffUser({ email: "a3@example.test", displayName: "A3 Admin", password: randomBytes(24).toString("base64url"), role: "ADMIN" });
    const session = await createAdminSession({ id: staff._id, email: staff.email, displayName: staff.displayName, role: "ADMIN", authVersion: staff.authVersion }, { sessionSecret: process.env.ADMIN_SESSION_SECRET!, sessionTtlSeconds: 3600 });
    cookie = `${ADMIN_SESSION_COOKIE}=${session.token}; ${ADMIN_CSRF_COOKIE}=${session.csrfToken}`;
    csrf = session.csrfToken;
  });
  after(async () => {
    if (safe) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (originalSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = originalSecret;
  });

  test("unauthenticated requests cannot list or read orders", async () => {
    assert.equal((await listRoute(req())).status, 401);
    assert.equal((await detailRoute(req(`${url}/T000000001`), params("T000000001"))).status, 401);
  });

  test("lists only eligible orders and searches with pagination", async () => {
    const cash = await makeOrder();
    await makeOrder({ fulfillmentStatus: "PENDING_PAYMENT", paymentMethod: "card", paymentStatus: "pending" });
    await makeOrder({ paymentMethod: "card", paymentStatus: "paid", paymentProvider: "stripe" }); // No trusted payment link.
    const card = await makeOrder({ paymentMethod: "card", paymentStatus: "paid", paymentProvider: "stripe", paymentId: new mongoose.Types.ObjectId(), paidAt: new Date() });
    const listed = await listAdminOrders({ page: 1, limit: 20, status: "ALL", q: "" });
    assert.equal(listed.total, 2);
    assert.deepEqual(new Set(listed.orders.map((order) => order.publicId)), new Set([cash.publicId, card.publicId]));
    const searched = await listAdminOrders({ page: 1, limit: 1, status: "ALL", q: cash.contact.phone });
    assert.equal(searched.total, 1);
    assert.equal(searched.orders[0].publicId, cash.publicId);
    const noRegexInjection = await listAdminOrders({ page: 1, limit: 20, status: "ALL", q: ".*" });
    assert.equal(noRegexInjection.total, 0);
    const api = await listRoute(req(`${url}?page=1&limit=1`, { headers: { cookie } }));
    assert.equal(api.status, 200);
    assert.equal((await api.json() as { orders: unknown[]; total: number }).orders.length, 1);
    assert.equal((await listRoute(req(`${url}?limit=500`, { headers: { cookie } }))).status, 400);
  });

  test("details use saved product snapshot, including additions and removals", async () => {
    const order = await OrderModel.findOne({ paymentMethod: "pay_on_pickup" }).lean();
    assert.ok(order);
    const detail = await getAdminOrder(order.publicId);
    assert.ok(detail);
    assert.equal(detail.items[0].variant, "Familj");
    assert.equal(detail.items[0].quantity, 2);
    assert.equal(detail.items[0].modifiers[0].label, "Extra ost");
    assert.deepEqual(detail.items[0].removedIngredients, ["Skinka"]);
    assert.equal(detail.items[0].note, "Utan lök");
    const api = await detailRoute(req(`${url}/${order.publicId}`, { headers: { cookie } }), params(order.publicId));
    assert.equal(api.status, 200);
    assert.equal((await api.json() as { order: { publicId: string } }).order.publicId, order.publicId);
  });

  test("CSRF and conditional transitions protect actions; pay on pickup remains unpaid", async () => {
    const order = await makeOrder();
    const endpoint = `${url}/${order.publicId}/transition`;
    const body = (to: string, expectedStatus: string) => JSON.stringify({ to, expectedStatus });
    const post = (token: string | undefined, to: string, expectedStatus: string) => transitionRoute(req(endpoint, { method: "POST", headers: { cookie, origin: "https://falken.test", "content-type": "application/json", ...(token ? { "x-csrf-token": token } : {}) }, body: body(to, expectedStatus) }), params(order.publicId));
    assert.equal((await post(undefined, "PREPARING", "CONFIRMED")).status, 403);
    const [first, second] = await Promise.all([post(csrf, "PREPARING", "CONFIRMED"), post(csrf, "PREPARING", "CONFIRMED")]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const preparing = await OrderModel.findById(order._id).lean();
    assert.equal(preparing?.fulfillmentStatus, "PREPARING");
    assert.equal(preparing?.paymentStatus, "unpaid");
    assert.ok(preparing?.acknowledgedAt);
    assert.ok(preparing?.acknowledgedBy);
    assert.equal(preparing?.statusHistory.filter((entry) => entry.to === "PREPARING").length, 1);
    assert.equal(await AuditLogModel.countDocuments({ entityId: String(order._id), action: "admin_order_status_changed" }), 1);
    assert.equal((await post(csrf, "READY_FOR_PICKUP", "PREPARING")).status, 200);
    assert.equal((await post(csrf, "PICKED_UP", "READY_FOR_PICKUP")).status, 409);
    const ready = await OrderModel.findById(order._id).lean();
    assert.equal(ready?.paymentStatus, "unpaid");
    assert.equal(ready?.fulfillmentStatus, "READY_FOR_PICKUP");
  });
});
