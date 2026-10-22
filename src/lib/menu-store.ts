import { useSyncExternalStore } from "react";
import { loadMenu, type MenuLoadFailure } from "./menu-client.ts";
import type { PublicMenu } from "./menu-types.ts";

// One shared menu for the whole app. The first component that subscribes starts the request.
// useSyncExternalStore keeps server render and hydration on the same "loading" snapshot.

export type MenuState =
  | { status: "loading" }
  | { status: "ready"; menu: PublicMenu }
  | { status: "error"; reason: MenuLoadFailure };

const LOADING: MenuState = { status: "loading" };
let snapshot: MenuState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function publish(next: MenuState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

async function start() {
  started = true;
  const result = await loadMenu();
  publish(result.ok ? { status: "ready", menu: result.menu } : { status: "error", reason: result.reason });
}

export function reloadMenu() {
  started = false;
  publish({ status: "loading" });
  void start();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!started) void start();
  return () => {
    listeners.delete(listener);
  };
};

export function useMenu(): MenuState {
  return useSyncExternalStore(subscribe, () => snapshot, () => LOADING);
}
