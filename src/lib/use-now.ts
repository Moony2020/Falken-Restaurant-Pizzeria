import { useSyncExternalStore } from "react";

// A shared clock that only exists on the client. The server snapshot is null, so nothing
// time-dependent is rendered during prerender and hydration never mismatches.

const listeners = new Set<() => void>();
let current = 0;
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  current = Date.now();
  if (!timer) {
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = (): number => current || (current = Date.now());
const getServerSnapshot = (): number | null => null;

/** Current time in ms, refreshed every 30 s. `null` until the client has hydrated. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, getServerSnapshot);
}
