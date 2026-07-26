import { useSyncExternalStore } from "react";

const STORAGE_KEY = "open-ticket:holderId";

/**
 * A stable per-tab buyer identity, persisted in localStorage so a refresh keeps "you" distinct from
 * "others" (the two-tab race demo). Read via `useSyncExternalStore`: it returns `""` on the server
 * and on the first client render (so SSR matches first paint and the UI disables actions until
 * identity is ready), then the persisted id. Minting happens in `subscribe` (client-only, after
 * mount) — never in the snapshot read, which stays pure.
 */
export function useHolderId(): string {
  return useSyncExternalStore(subscribe, getClientId, getServerId);
}

// Runs client-side when the component subscribes: mint the id if absent, then notify so the
// snapshot re-reads it. The id never changes afterwards, so the unsubscribe is a no-op.
function subscribe(onStoreChange: () => void): () => void {
  if (window.localStorage.getItem(STORAGE_KEY) === null) {
    window.localStorage.setItem(STORAGE_KEY, crypto.randomUUID());
    onStoreChange();
  }
  return () => undefined;
}

// A pure read — no minting side effect (that lives in `subscribe`).
const getClientId = (): string => window.localStorage.getItem(STORAGE_KEY) ?? "";
const getServerId = (): string => "";
