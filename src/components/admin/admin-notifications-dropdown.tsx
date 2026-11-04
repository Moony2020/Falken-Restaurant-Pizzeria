"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AdminNotificationSummary } from "@/server/notifications-service";
import { playOrderChime } from "@/lib/audio-chime";

const SOUND_STORAGE_KEY = "falken_admin_sound_enabled";

export type AdminNotificationsProps = {
  onSelectOrder: (publicId: string) => void;
};

export function AdminNotificationsDropdown({ onSelectOrder }: AdminNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem(SOUND_STORAGE_KEY);
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);
  const latestSeenTimestampRef = useRef<string | null>(null);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    } catch {
      // Ignore
    }
  };

  const fetchNotifications = useCallback(async (isPolling = false) => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: AdminNotificationSummary[]; unreadCount: number };

      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);

      if (data.notifications.length > 0) {
        const newestCreatedAt = data.notifications[0].createdAt;

        // Check if a genuinely new order arrived
        if (!initialLoadRef.current && isPolling) {
          const prevTime = latestSeenTimestampRef.current ? new Date(latestSeenTimestampRef.current).getTime() : 0;
          const newTime = new Date(newestCreatedAt).getTime();

          if (newTime > prevTime) {
            // Find if there is any new unread notification
            const hasNewUnread = data.notifications.some(
              (n) => !n.read && new Date(n.createdAt).getTime() > prevTime
            );
            if (hasNewUnread && soundEnabled) {
              playOrderChime();
            }
          }
        }

        latestSeenTimestampRef.current = newestCreatedAt;
      }

      initialLoadRef.current = false;
    } catch {
      // Network or auth error
    }
  }, [soundEnabled]);

  // Initial fetch and 5s polling
  useEffect(() => {
    const initial = window.setTimeout(() => void fetchNotifications(false), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchNotifications(true);
      }
    }, 5000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string, read: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read } : n))
      );
      setUnreadCount((c) => Math.max(0, read ? c - 1 : c + 1));

      await fetch(`/api/admin/notifications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ read }),
      });
    } catch {
      void fetchNotifications(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
      await fetch("/api/admin/notifications/mark-all-read", { method: "POST" });
    } catch {
      void fetchNotifications(false);
    }
  };

  const handleClickItem = (notification: AdminNotificationSummary) => {
    if (!notification.read) {
      void handleMarkRead(notification.id, true);
    }
    setOpen(false);
    onSelectOrder(notification.publicId);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Aviseringar"
        title="Aviseringar"
        className={`relative inline-flex items-center justify-center rounded-xl p-2 transition focus:outline-none ${
          open ? "bg-black/10 text-[#1f2328]" : "text-[#555a64] hover:bg-black/5 hover:text-[#1f2328]"
        }`}
      >
        <span className="relative inline-flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>

          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#dc2626] px-1 text-[9.5px] font-bold leading-none text-white shadow-xs ring-2 ring-[#f9f8f4]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </span>
      </button>

      {/* Popover Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[#e4ded2] bg-white shadow-2xl z-50 overflow-hidden text-xs text-[#1f2328] animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e8e2d5] bg-[#faf8f3] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-serif text-sm font-bold text-[#1f2328]">Aviseringar</span>
              {unreadCount > 0 ? (
                <span className="rounded-full bg-[#dc2626]/10 px-2 py-0.5 text-[10.5px] font-bold text-[#dc2626]">
                  {unreadCount} olästa
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-medium text-emerald-800">
                  Alla lästa
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Sound Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Ljud är aktiverat vid nya beställningar" : "Ljud är avstängt"}
                className={`rounded-lg p-1.5 transition ${
                  soundEnabled ? "text-[#a78347] hover:bg-black/5" : "text-[#9ca0a7] hover:bg-black/5"
                }`}
              >
                {soundEnabled ? (
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-semibold text-[#a78347] hover:underline"
                >
                  Markera alla
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[22rem] overflow-y-auto divide-y divide-[#f0ece1]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-[#7c828d]">
                <p className="font-medium text-xs">Inga aviseringar just nu</p>
                <p className="mt-1 text-[11px]">När nya beställningar kommer in visas de här.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const isPaid = n.paymentStatus === "paid";
                const isSwish = n.paymentMethod === "swish";
                const isCard = n.paymentMethod === "card";

                const paymentBadge = isSwish
                  ? { label: `Swish · ${isPaid ? "Betald" : "Väntar"}`, bg: isPaid ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800" }
                  : isCard
                  ? { label: `Stripe · ${isPaid ? "Betald" : "Väntar"}`, bg: isPaid ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800" }
                  : { label: "Betala på plats", bg: "bg-amber-50 border-amber-200 text-amber-800" };

                const pickupTime = new Date(n.pickupAt).toLocaleTimeString("sv-SE", {
                  timeZone: "Europe/Stockholm",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                const createdTime = new Date(n.orderCreatedAt).toLocaleTimeString("sv-SE", {
                  timeZone: "Europe/Stockholm",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={`group relative flex items-start justify-between gap-3 p-3.5 transition cursor-pointer hover:bg-[#faf7f0] ${
                      !n.read ? "bg-[#fdfaf3]" : "bg-white"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.read && (
                          <span className="size-2 rounded-full bg-[#a78347] shrink-0" aria-label="Oläst" />
                        )}
                        <span className="font-mono font-bold text-xs text-[#1f2328]">{n.publicId}</span>
                        <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold ${paymentBadge.bg}`}>
                          {paymentBadge.label}
                        </span>
                      </div>

                      <p className="mt-1 font-medium text-xs text-[#1f2328] truncate">
                        {n.customerName} · <span className="font-semibold">{n.totalSek} kr</span>
                      </p>

                      <div className="mt-1 flex items-center gap-2 text-[10.5px] text-[#7c828d]">
                        <span>Hämtas kl. {pickupTime}</span>
                        <span>•</span>
                        <span>Mottagen kl. {createdTime}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleMarkRead(n.id, !n.read, e)}
                        title={n.read ? "Markera som oläst" : "Markera som läst"}
                        className="rounded-md p-1 text-[#8c827a] hover:bg-black/5 hover:text-[#1f2328]"
                      >
                        {n.read ? (
                          <span className="text-[10px] text-[#7c828d] hover:underline">Oläst</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-[#a78347] hover:underline">Läst</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
