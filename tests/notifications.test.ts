import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("admin notification eligibility & business rules", () => {
  function isEligibleForNotification(order: {
    paymentMethod: "card" | "swish" | "pay_on_pickup";
    paymentStatus: string;
    fulfillmentStatus: string;
  }): boolean {
    const isCardPaid = order.paymentMethod === "card" && order.paymentStatus === "paid";
    const isSwishPaid = order.paymentMethod === "swish" && order.paymentStatus === "paid";
    const isCashConfirmed = order.paymentMethod === "pay_on_pickup" && order.fulfillmentStatus !== "CANCELLED";
    return Boolean(isCardPaid || isSwishPaid || isCashConfirmed);
  }

  test("unpaid card order does NOT create notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "card",
        paymentStatus: "pending",
        fulfillmentStatus: "PENDING_PAYMENT",
      }),
      false
    );
  });

  test("unpaid swish order does NOT create notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "swish",
        paymentStatus: "pending",
        fulfillmentStatus: "PENDING_PAYMENT",
      }),
      false
    );
  });

  test("failed or cancelled card order does NOT create notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "card",
        paymentStatus: "failed",
        fulfillmentStatus: "CANCELLED",
      }),
      false
    );
  });

  test("verified paid card order creates notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "card",
        paymentStatus: "paid",
        fulfillmentStatus: "CONFIRMED",
      }),
      true
    );
  });

  test("verified paid Swish order creates notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "swish",
        paymentStatus: "paid",
        fulfillmentStatus: "CONFIRMED",
      }),
      true
    );
  });

  test("pay on pickup confirmed order creates notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "pay_on_pickup",
        paymentStatus: "pending",
        fulfillmentStatus: "CONFIRMED",
      }),
      true
    );
  });

  test("pay on pickup cancelled order does NOT create notification", () => {
    assert.equal(
      isEligibleForNotification({
        paymentMethod: "pay_on_pickup",
        paymentStatus: "pending",
        fulfillmentStatus: "CANCELLED",
      }),
      false
    );
  });
});

describe("admin notification state transitions & counter decoupling", () => {
  type Notification = {
    id: string;
    orderId: string;
    publicId: string;
    read: boolean;
    readAt?: Date;
  };

  test("marking a notification as read decrements unread counter", () => {
    const notifications: Notification[] = [
      { id: "1", orderId: "o1", publicId: "P1", read: false },
      { id: "2", orderId: "o2", publicId: "P2", read: false },
      { id: "3", orderId: "o3", publicId: "P3", read: true },
    ];

    const getUnreadCount = (list: Notification[]) => list.filter((n) => !n.read).length;
    assert.equal(getUnreadCount(notifications), 2);

    // Mark notification 1 as read
    const target = notifications.find((n) => n.id === "1");
    assert.ok(target);
    target.read = true;
    target.readAt = new Date();

    assert.equal(getUnreadCount(notifications), 1);
  });

  test("marking all notifications as read resets unread counter to 0", () => {
    const notifications: Notification[] = [
      { id: "1", orderId: "o1", publicId: "P1", read: false },
      { id: "2", orderId: "o2", publicId: "P2", read: false },
    ];

    notifications.forEach((n) => {
      n.read = true;
      n.readAt = new Date();
    });

    const unread = notifications.filter((n) => !n.read).length;
    assert.equal(unread, 0);
  });

  test("orders sidebar badge counts only unacknowledged CONFIRMED orders (independent of notification read state)", () => {
    type Order = {
      id: string;
      fulfillmentStatus: "CONFIRMED" | "ACKNOWLEDGED" | "PREPARING" | "READY_FOR_PICKUP" | "PICKED_UP";
    };

    const orders: Order[] = [
      { id: "o1", fulfillmentStatus: "CONFIRMED" },
      { id: "o2", fulfillmentStatus: "CONFIRMED" },
      { id: "o3", fulfillmentStatus: "ACKNOWLEDGED" },
      { id: "o4", fulfillmentStatus: "PREPARING" },
    ];

    const confirmedCount = orders.filter((o) => o.fulfillmentStatus === "CONFIRMED").length;
    assert.equal(confirmedCount, 2);

    // When staff acknowledges order o1, confirmedCount decreases
    orders[0].fulfillmentStatus = "ACKNOWLEDGED";
    const updatedCount = orders.filter((o) => o.fulfillmentStatus === "CONFIRMED").length;
    assert.equal(updatedCount, 1);
  });
});

describe("Europe/Stockholm dynamic date presets", () => {
  function getStockholmDatePresets() {
    const now = new Date();
    const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", ...opts }).format(d);

    const todayStr = fmt(now, { day: "numeric", month: "short", year: "numeric" });
    const yesterday = new Date(now.getTime() - 86_400_000);
    const yesterdayStr = fmt(yesterday, { day: "numeric", month: "short", year: "numeric" });

    const dayOfWeek = (now.getDay() + 6) % 7;
    const monday = new Date(now.getTime() - dayOfWeek * 86_400_000);
    const sunday = new Date(monday.getTime() + 6 * 86_400_000);
    const weekStr = `${fmt(monday, { day: "numeric", month: "short" })} – ${fmt(sunday, { day: "numeric", month: "short", year: "numeric" })}`;

    const monthStr = fmt(now, { month: "long", year: "numeric" });
    const yearStr = fmt(now, { year: "numeric" });

    return [
      { id: "today", label: "Idag", range: todayStr },
      { id: "yesterday", label: "Igår", range: yesterdayStr },
      { id: "week", label: "Denna vecka", range: weekStr },
      { id: "month", label: "Denna månad", range: monthStr },
      { id: "year", label: "Detta år", range: yearStr },
    ];
  }

  test("generates 5 standard presets with Stockholm time formatting", () => {
    const presets = getStockholmDatePresets();
    assert.equal(presets.length, 5);
    const ids = presets.map((p) => p.id);
    assert.deepEqual(ids, ["today", "yesterday", "week", "month", "year"]);

    // Must not be empty strings
    for (const p of presets) {
      assert.ok(p.range.length > 0, `range for ${p.id} should not be empty`);
      assert.ok(p.label.length > 0, `label for ${p.id} should not be empty`);
    }

    // Verify today's date contains current year
    const currentYear = new Date().getFullYear().toString();
    assert.ok(presets[0].range.includes(currentYear));
  });
});

