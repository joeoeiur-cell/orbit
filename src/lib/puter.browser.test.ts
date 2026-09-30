import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { build } from "esbuild";

test("official Puter package initializes for the browser without CDN scripts", async () => {
  const browser = new Window({ url: "https://orbit.test/" });
  const keys = ["window", "document", "location", "navigator", "HTMLElement", "customElements", "localStorage", "XMLHttpRequest", "addEventListener", "removeEventListener"];
  const descriptors = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const bundle = await build({ entryPoints: ["./node_modules/@heyputer/puter.js/src/index.js"], platform: "browser", format: "iife", bundle: true, write: false, define: { "globalThis.process": "undefined" } });
  try {
    for (const key of keys) {
      const value = key === "window" ? browser : (browser as unknown as Record<string, unknown>)[key];
      Object.defineProperty(globalThis, key, { value: typeof value === "function" && ["addEventListener", "removeEventListener"].includes(key) ? value.bind(browser) : value, configurable: true, writable: true });
    }
    // Compile the SDK in memory with browser dependency resolution, not Bun's Node resolution.
    const code = bundle.outputFiles[0].text;
    new Function(code)();
    const puter = (globalThis as unknown as { puter: import("@heyputer/puter.js").Puter }).puter;
    expect(puter.env).toBe("web");
    expect(typeof puter.auth.signIn).toBe("function");
    expect(typeof puter.ai.listModels).toBe("function");
    expect(typeof puter.ai.chat).toBe("function");
    expect(puter.auth.isSignedIn()).toBe(false);
    expect(browser.document.querySelectorAll('script[src*="js.puter.com"]')).toHaveLength(0);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
});
