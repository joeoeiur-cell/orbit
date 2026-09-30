import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ChatMessage, PuterSDK } from "../lib/puter";

const browser = new Window({ url: "https://orbit.test/", width: 1280, height: 900 });
for (const [key, value] of Object.entries({
  window: browser, document: browser.document, navigator: browser.navigator,
  HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node,
  Event: browser.Event, CustomEvent: browser.CustomEvent, MouseEvent: browser.MouseEvent,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  NodeFilter: browser.NodeFilter,
  MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  localStorage: browser.localStorage, requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
})) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
browser.HTMLElement.prototype.scrollIntoView = () => {};
let signedIn = false;
let blockedPopup = false;
let streamHold = false;
let releaseStream: (() => void) | undefined;
let signInCalls = 0;
let sent: ChatMessage[] = [];
let sentModel = "";
const sdk: PuterSDK = {
  env: "web",
  auth: {
    isSignedIn: () => signedIn,
    signIn: async () => { signInCalls++; if (blockedPopup) throw { error: "popup_blocked" }; signedIn = true; },
    getUser: async () => ({ username: "tester" }),
    signOut: () => { signedIn = false; },
  },
  ai: {
    listModels: async () => [{ id: "gpt-5-nano", name: "GPT Nano", provider: "OpenAI" }, { id: "test-claude", name: "Claude Test", provider: "Anthropic" }],
    chat: async (messages, options) => {
      sent = messages; sentModel = options.model;
      return (async function* () {
        if (streamHold) {
          yield { type: "text", text: "Partial response" };
          await new Promise<void>(resolve => { releaseStream = resolve; });
          yield { type: "text", text: "STALE CONTENT MUST NOT APPEAR" };
          return;
        }
        yield { type: "text", text: 'Here is your app.\n```html\n<html><head></head><body><h1>Test app</h1></body></html>\n```\n' };
        yield { type: "text", text: '```json\n{"tasks":[{"text":"Build interface","done":true},{"text":"Review app","done":false}],"files":[{"name":"style.css","content":"body{color:green}"}]}\n```' };
      })();
    },
  },
};
const actual = await import("../lib/puter");
mock.module("@/lib/puter", () => ({ ...actual, loadPuter: async () => sdk, getPuter: () => sdk }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { BrowserRouter } = await import("react-router");
const { default: Workspace } = await import("./Workspace");

const button = (name: string) => {
  const result = Array.from(browser.document.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === name || b.textContent?.trim() === name);
  if (!result) throw new Error(`Button not found: ${name}`);
  return result;
};
const click = async (name: string) => { await act(async () => { button(name).click(); }); };
const type = async (selector: string, value: string) => {
  const input = browser.document.querySelector(selector) as unknown as HTMLInputElement;
  const prototype = input.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
  });
};

test("workspace connects, switches models, builds artifacts, edits tasks and manages history", async () => {
  const container = browser.document.createElement("div");
  browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    expect(browser.document.querySelector(".orbit-art")).not.toBeNull();
    expect(browser.document.querySelector(".provider-count")?.textContent).toContain("2 models");
    await click("Connect Puter");
    expect(signInCalls).toBe(1);
    expect(browser.document.querySelector(".header-connect")?.textContent).toBe("tester");
    await click("GPT Nano");
    await click("Claude TestAnthropic · test-claude");
    await click("Build somethingAn idea → a working app");
    expect((browser.document.querySelector("textarea") as unknown as HTMLTextAreaElement).value).toContain("habit tracker");
    await click("Send message");
    expect(sentModel).toBe("test-claude");
    expect(sent[0].role).toBe("system");
    expect(sent[sent.length - 1]?.content).toContain("habit tracker");
    expect(browser.document.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Test app");
    await click("Tasks2");
    expect(browser.document.querySelectorAll(".task-row")).toHaveLength(2);
    await click("Complete task");
    expect(browser.document.querySelectorAll(".task-row.done")).toHaveLength(2);
    await type('[aria-label="New task"]', "Check interactions");
    await act(async () => { browser.document.querySelector(".add-task")?.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    expect(browser.document.querySelectorAll(".task-row")).toHaveLength(3);
    await click("Activity");
    await click("Restore");
    await click("Tasks2");
    expect(browser.document.querySelectorAll(".task-row.done")).toHaveLength(1);
    expect(browser.document.querySelectorAll(".task-row")).toHaveLength(2);
    await click("Files");
    expect(browser.document.querySelectorAll(".file-list button")).toHaveLength(2);
    await click("style.css");
    expect(browser.document.querySelector(".file-code")?.textContent).toBe("body{color:green}");
    await click("Workspace settings");
    await type("#conversation-name", "My test app");
    await act(async () => { browser.document.querySelector(".workspace-preferences form")?.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await click("Close");
    expect(browser.document.querySelector(".history-item")?.textContent).toContain("My test app");
    expect(browser.localStorage.getItem("orbit-chats:tester")).toContain("My test app");
    await click("New conversation");
    expect(browser.document.querySelector(".welcome")).not.toBeNull();
    await click("My test app");
    expect(browser.document.querySelector(".message-content")?.textContent).toContain("habit tracker");
    await click("Delete My test app");
    expect(browser.document.querySelectorAll(".history-item")).toHaveLength(0);
    await click("Manage connection");
    await click("Disconnect Puter");
    expect(signedIn).toBe(false);
  } finally {
    await act(async () => { root.unmount(); });
    container.remove();
  }
});

test("blocked popup errors are actionable and preserve the user's prompt", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  blockedPopup = true; signedIn = false;
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("Explore an ideaFind your next lightbulb moment");
    const prompt = (browser.document.querySelector("textarea") as unknown as HTMLTextAreaElement).value;
    await click("Send message");
    expect(browser.document.querySelector('[role="alert"]')?.textContent).toContain("Allow popups");
    expect((browser.document.querySelector("textarea") as unknown as HTMLTextAreaElement).value).toBe(prompt);
    expect(browser.document.querySelector(".connection-newtab")?.getAttribute("href")).toBe("https://orbit.test/");
    blockedPopup = false;
    await click("Sign in with Puter");
    expect(browser.document.querySelector(".header-connect")?.textContent).toBe("tester");
  } finally {
    blockedPopup = false;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

test("stopping a stream prevents late content from reaching a new conversation", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  streamHold = true; signedIn = true;
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("Build somethingAn idea → a working app");
    await click("Send message");
    expect(browser.document.body.textContent).toContain("Partial response");
    await click("Stop response");
    await click("New conversation");
    await act(async () => { releaseStream?.(); await Promise.resolve(); });
    expect(browser.document.body.textContent).not.toContain("STALE CONTENT");
    expect(browser.document.querySelector(".welcome")).not.toBeNull();
    const saved = JSON.parse(browser.localStorage.getItem("orbit-chats:tester") || "[]");
    expect(saved[0].messages[saved[0].messages.length - 1].status).toBe("stopped");
  } finally {
    releaseStream?.(); streamHold = false;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

afterAll(async () => { await browser.happyDOM.close(); });
