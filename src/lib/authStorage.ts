import type { TokenStorage } from "@convex-dev/auth/react";

// Embedded/private browsers can throw on the localStorage getter itself or on
// individual operations. Never let that prevent the auth provider from mounting.
export function createBrowserAuthStorage(getStorage: () => Storage = () => window.localStorage): TokenStorage {
  try {
    const storage = getStorage();
    const probe = `orbit-auth-probe-${Math.random().toString(36).slice(2)}`;
    storage.setItem(probe, "1");
    const available = storage.getItem(probe) === "1";
    storage.removeItem(probe);
    // Keep native storage identity for Convex Auth's cross-tab storage listener.
    if (available) return storage;
  } catch { /* Use the guarded session fallback below. */ }
  const memory = new Map<string, string | null>();
  let blocked = false;
  return {
    getItem(key) {
      if (!blocked) {
        try { return getStorage().getItem(key); }
        catch { blocked = true; }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      if (!blocked) {
        try { getStorage().setItem(key, value); }
        catch { blocked = true; }
      }
    },
    removeItem(key) {
      memory.set(key, null);
      if (!blocked) {
        try { getStorage().removeItem(key); }
        catch { blocked = true; }
      }
    },
  };
}
