"use client";

import { useSyncExternalStore, useCallback } from "react";
import { CURRENT_SEASON } from "@/data/site";
import { getOpenStatus, type CustomWeeklyHours, type Season } from "@/lib/hours";
import { useNow } from "@/lib/use-now";
import type { RestaurantStatusResponse } from "@/app/api/restaurant/status/route";

export interface RestaurantStatus {
  onlineOrderingEnabled: boolean;
  manualOverride?: "open" | "closed" | null;
  isOpenBySchedule: boolean;
  isOpen: boolean;
  label: string;
  scheduleLabel: string;
  closeReason: "manual" | "schedule" | null;
  season?: Season;
  hours?: CustomWeeklyHours;
}

// Global cached state
let cachedSettings: {
  onlineOrderingEnabled: boolean;
  manualOverride: "open" | "closed" | null;
  season?: Season;
  hours?: CustomWeeklyHours;
} = { onlineOrderingEnabled: true, manualOverride: null };

let fetchPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let channel: BroadcastChannel | null = null;

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    channel = new BroadcastChannel("falken_restaurant_status");
    channel.onmessage = () => {
      void fetchRestaurantStatus();
    };
  } catch {
    // Ignore channel errors
  }
}

export function notifyStatusChange() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("falken_status_sync", String(Date.now()));
      channel?.postMessage("reload");
    } catch {
      // Ignore storage errors
    }
    void fetchRestaurantStatus();
  }
}

function notify() {
  listeners.forEach((l) => l());
}

export function fetchRestaurantStatus(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const res = await fetch("/api/restaurant/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as RestaurantStatusResponse;
        cachedSettings = {
          onlineOrderingEnabled: data.onlineOrderingEnabled,
          manualOverride: data.manualOverride ?? null,
          season: data.season,
          hours: data.hours,
        };
        notify();
      }
    } catch {
      // Keep cached settings on network glitch
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

function startPolling() {
  if (typeof window === "undefined") return;
  void fetchRestaurantStatus();
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void fetchRestaurantStatus();
    }, 4_000); // 4 seconds polling for fast real-time sync
  }
}

function stopPollingIfOrphaned() {
  if (listeners.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    fetchPromise = null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startPolling();

  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void fetchRestaurantStatus();
    }
  };
  const handleStorage = (e: StorageEvent) => {
    if (e.key === "falken_status_sync") {
      void fetchRestaurantStatus();
    }
  };

  window.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleVisibility);
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("focus", handleVisibility);
    window.removeEventListener("storage", handleStorage);
    stopPollingIfOrphaned();
  };
}

const getSnapshot = () => cachedSettings;
const serverSnapshot: {
  onlineOrderingEnabled: boolean;
  manualOverride: "open" | "closed" | null;
  season?: Season;
  hours?: CustomWeeklyHours;
} = {
  onlineOrderingEnabled: true,
  manualOverride: null,
};
const getServerSnapshot = () => serverSnapshot;

/**
 * Hook providing real-time store open/closed status.
 * Evaluates both admin manual override (onlineOrderingEnabled, manualOverride)
 * and Stockholm opening hours schedule.
 */
export function useRestaurantStatus(): {
  status: RestaurantStatus | null;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const now = useNow();
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const reload = useCallback(async () => {
    await fetchRestaurantStatus();
  }, []);

  if (now === null) {
    return { status: null, loading: true, reload };
  }

  const season = settings.season || CURRENT_SEASON;
  const scheduleStatus = getOpenStatus(new Date(now), season, settings.hours);
  const isOpenBySchedule = scheduleStatus.isOpen;

  let isOpen: boolean;
  let closeReason: "manual" | "schedule" | null = null;
  let label = scheduleStatus.label;

  if (settings.manualOverride === "open") {
    isOpen = true;
    closeReason = null;
    label = "Öppet nu";
  } else if (settings.manualOverride === "closed") {
    isOpen = false;
    closeReason = "manual";
    label = "Stängt för beställningar";
  } else if (!settings.onlineOrderingEnabled && isOpenBySchedule) {
    isOpen = false;
    closeReason = "manual";
    label = "Stängt för beställningar";
  } else {
    isOpen = isOpenBySchedule;
    if (!isOpen) {
      closeReason = "schedule";
      label = scheduleStatus.label;
    }
  }

  return {
    status: {
      onlineOrderingEnabled: settings.onlineOrderingEnabled,
      manualOverride: settings.manualOverride,
      isOpenBySchedule,
      isOpen,
      label,
      scheduleLabel: scheduleStatus.label,
      closeReason,
      season,
      hours: settings.hours,
    },
    loading: false,
    reload,
  };
}
