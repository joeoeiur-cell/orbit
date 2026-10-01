import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { build } from "esbuild";
import { createBrowserAuthStorage } from "./authStorage";

async function authStartup(storageExpression: string) {
  const browser = new Window({ url: "https://orbit.test/" });
  Object.defineProperty(browser, "localStorage", {
    configurable: true,
    get() { throw new browser.DOMException("Browser storage access is blocked", "SecurityError"); },
  });
  const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MutationObserver", "requestAnimationFrame", "cancelAnimationFrame", "IS_REACT_ACT_ENVIRONMENT", "orbitAuthStartup"];
  const descriptors = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const bundle = await build({
    stdin: { contents: `
      import { act } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ConvexAuthProvider } from '@convex-dev/auth/react';
      import { ConvexReactClient, useConvexAuth } from 'convex/react';
      ${storageExpression ? "import { createBrowserAuthStorage } from './src/lib/authStorage';" : ""}
      globalThis.orbitAuthStartup = (async () => {
        const client = new ConvexReactClient('https://test.convex.cloud', { disabled: true });
        const container = document.createElement('div'); document.body.appendChild(container);
        const root = createRoot(container);
        function Status() { const auth = useConvexAuth(); return <p>{auth.isLoading ? 'loading' : 'ready'}</p>; }
        try {
          await act(async () => { root.render(<ConvexAuthProvider client={client} ${storageExpression}><Status /></ConvexAuthProvider>); });
          return container.textContent;
        } finally { await act(async () => root.unmount()); await client.close(); }
      })();
    `, resolveDir: process.cwd(), loader: "tsx" },
    platform: "browser", format: "iife", bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  try {
    for (const key of keys.filter(key => key !== "orbitAuthStartup")) {
      const value = key === "window" ? browser : key === "IS_REACT_ACT_ENVIRONMENT" ? true : (browser as unknown as Record<string, unknown>)[key];
      Object.defineProperty(globalThis, key, { value: typeof value === "function" && ["requestAnimationFrame", "cancelAnimationFrame"].includes(key) ? value.bind(browser) : value, configurable: true, writable: true });
    }
    new Function(bundle.outputFiles[0].text)();
    return await (globalThis as unknown as { orbitAuthStartup: Promise<string> }).orbitAuthStartup;
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
}

test("default Convex Auth storage reproduces a startup crash when the browser blocks localStorage", async () => {
  await expect(authStartup("")).rejects.toThrow("Browser storage access is blocked");
});

test("guarded storage lets the real Convex Auth provider finish startup when storage is blocked", async () => {
  expect(await authStartup("storage={createBrowserAuthStorage()}")).toBe("ready");
});

test("auth storage preserves persisted tokens and safely handles blocked reads, writes, and removal", () => {
  const data = new Map<string, string>([["token", "existing-token"]]);
  let denied = false;
  const storage = {
    getItem: (key: string) => { if (denied) throw new Error("Blocked"); return data.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (denied) throw new Error("Blocked"); data.set(key, value); },
    removeItem: (key: string) => { if (denied) throw new Error("Blocked"); data.delete(key); },
  } as Storage;
  const auth = createBrowserAuthStorage(() => storage);
  expect(auth).toBe(storage);
  expect(auth.getItem("token")).toBe("existing-token");
  auth.setItem("token", "new-token"); expect(data.get("token")).toBe("new-token");
  auth.removeItem("token"); expect(data.has("token")).toBe(false);
  denied = true;
  const deniedStorage = createBrowserAuthStorage(() => storage);
  deniedStorage.setItem("token", "memory-only"); expect(deniedStorage.getItem("token")).toBe("memory-only");
  expect(data.has("token")).toBe(false);
  deniedStorage.removeItem("token"); expect(deniedStorage.getItem("token")).toBeNull();
  const blockedGetter = createBrowserAuthStorage(() => { throw new Error("Storage getter blocked"); });
  expect(blockedGetter.getItem("token")).toBeNull();
  blockedGetter.setItem("token", "memory-only"); expect(blockedGetter.getItem("token")).toBe("memory-only");
  blockedGetter.removeItem("token"); expect(blockedGetter.getItem("token")).toBeNull();
});
