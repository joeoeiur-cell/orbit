import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { getFunctionName } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { ChatMessage, Model, PuterSDK } from "../lib/puter";

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
let searchTools: { type: "web_search" }[] | undefined;
let planReply = false;
let workspaceSignedIn = false;
let vmConfigured = true;
let vmCalls: string[] = [];
let vmRow: { id: string; status: string; expiresAt: number; workDir: string; expired: boolean } | null = null;
const convexReact = await import("convex/react");
mock.module("convex/react", () => ({ ...convexReact,
  useConvexAuth: () => ({ isAuthenticated: workspaceSignedIn, isLoading: false }),
  useQuery: () => vmRow,
  useAction: (reference: FunctionReference<"action">) => async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    vmCalls.push(name);
    if (name === "daytona:configuration") return { configured: vmConfigured };
    if (name === "daytona:create") {
      expect(args.consent).toBe(true);
      vmRow = { id: "mock-vm", status: "running", expiresAt: Date.now() + 300000, workDir: "/project/orbit", expired: false };
    }
    if (name === "daytona:execute") return { output: "v24.0.0", exitCode: 0 };
    if (name === "daytona:syncFiles") return { count: (args.files as unknown[]).length };
    if (name === "daytona:readFile") return { name: "result.txt", content: "Imported from the sandbox" };
    if (name === "daytona:remove") vmRow = { ...vmRow!, status: "deleted" };
  },
}));
const defaultCatalog: Model[] = [{ id: "gpt-5-nano", name: "GPT Nano", provider: "OpenAI" }, { id: "test-claude", name: "Claude Test", provider: "Anthropic" }];
let modelCatalog = defaultCatalog;
const sdk: PuterSDK = {
  env: "web",
  auth: {
    isSignedIn: () => signedIn,
    signIn: async () => { signInCalls++; if (blockedPopup) throw { error: "popup_blocked" }; signedIn = true; },
    getUser: async () => ({ username: "tester" }),
    signOut: () => { signedIn = false; },
  },
  ai: {
    listModels: async () => modelCatalog,
    chat: async (messages, options) => {
      sent = messages; sentModel = options.model; searchTools = options.tools;
      return (async function* () {
        if (planReply) {
          yield { type: "text", text: 'Plan first. [Provider docs](https://example.com/docs)\n```json\n{"tasks":[{"text":"Design the interface","done":true}],"files":[{"name":"must-not-write.txt","content":"Forbidden"}]}\n```' };
          return;
        }
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
    await click("Select Claude Test");
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

test("model library features current models first, filters both sections, and sends the exact selected ID", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  modelCatalog = [
    ...defaultCatalog,
    { id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol", provider: "OpenAI", context: 1050000 },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", provider: "Anthropic", context: 1000000 },
    { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "Anthropic" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "Google" },
  ];
  signedIn = true;
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("New conversation");
    expect(browser.document.querySelectorAll(".quick-models button")).toHaveLength(3);
    await click("GPT Nano");
    const featured = Array.from(browser.document.querySelectorAll(".featured-model strong")).map(el => el.textContent);
    expect(featured).toEqual(["Claude Opus 5.5", "GPT-6.1 Sol", "Gemini 3.8 Flash", "Claude Sonnet 5"]);
    expect(browser.document.querySelectorAll(".model-option")).toHaveLength(6);
    const select = browser.document.querySelector('[aria-label="Filter by provider"]')!;
    await act(async () => {
      (select as unknown as HTMLSelectElement).value = "OpenAI";
      select.dispatchEvent(new browser.Event("change", { bubbles: true }));
    });
    expect(browser.document.querySelectorAll(".model-option")).toHaveLength(2);
    expect(browser.document.querySelector(".featured-model strong")?.textContent).toBe("GPT-6.1 Sol");
    await type('[aria-label="Search models"]', "nothing matches");
    expect(browser.document.querySelector(".model-no-results")?.textContent).toContain("No models found");
    await click("Reset filters");
    expect(browser.document.querySelectorAll(".model-option")).toHaveLength(6);
    await type('[aria-label="Search models"]', "gpt-6.1");
    expect(browser.document.querySelectorAll(".model-option")).toHaveLength(1);
    await click("Select GPT-6.1 Sol");
    expect(browser.document.querySelector('[role="dialog"]')).toBeNull();
    await type('textarea[aria-label="Message"]', "Test the featured model");
    await click("Send message");
    expect(sentModel).toBe("openai/gpt-6.1-sol");
    await click("GPT-6.1 Sol");
    expect(browser.document.querySelector('[aria-label="Select GPT-6.1 Sol"]')?.getAttribute("aria-pressed")).toBe("true");
  } finally {
    modelCatalog = defaultCatalog;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

test("Plan mode preserves files, disables completion claims, and search passes the tool only when enabled", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  signedIn = true; planReply = true;
  modelCatalog = [...defaultCatalog, { id: "gpt-5.5", name: "GPT-5.5", provider: "OpenAI" }];
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("New conversation");
    await click("Plan mode");
    expect(browser.document.querySelector(".mode-notice")?.textContent).toContain("No files written");
    expect((button("Enable web search") as unknown as HTMLButtonElement).disabled).toBe(true);
    await click("GPT Nano"); await click("Select GPT-5.5");
    await click("Enable web search");
    await type('textarea[aria-label="Message"]', "Plan a project using current documentation");
    await click("Send message");
    expect(sent[0].content).toContain("PLAN mode");
    expect(searchTools).toEqual([{ type: "web_search" }]);
    expect(browser.document.querySelectorAll(".task-row.done")).toHaveLength(0);
    expect(browser.document.querySelectorAll(".task-row")).toHaveLength(1);
    expect(browser.document.querySelector(".response-sources a")?.getAttribute("href")).toBe("https://example.com/docs");
    const saved = JSON.parse(browser.localStorage.getItem("orbit-chats:tester") || "[]");
    expect(saved[0].files).toEqual([]);
    expect(saved[0].checkpoints).toEqual([]);
    const before = sent;
    await click("Review & build this plan");
    expect(sent).toBe(before);
    expect(button("Build mode").getAttribute("aria-pressed")).toBe("true");
    expect((browser.document.querySelector("textarea") as unknown as HTMLTextAreaElement).value).toContain("Design the interface");
    await click("Enable web search");
    planReply = false;
    await click("Send message");
    expect(searchTools).toBeUndefined();
  } finally {
    planReply = false; modelCatalog = defaultCatalog;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

test("cloud sandbox requires workspace auth and confirmation, then runs commands and explicitly syncs/imports", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  vmCalls = []; vmRow = null; workspaceSignedIn = false;
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("New conversation");
    await click("Cloud sandbox");
    expect(browser.document.querySelector(".vm-auth-link")?.getAttribute("href")).toContain("returnTo=");
    expect(vmCalls).toEqual([]);
    workspaceSignedIn = true;
    await click("Close workspace"); await click("Cloud sandbox");
    expect((button("Start cloud sandbox") as unknown as HTMLButtonElement).disabled).toBe(true);
    expect(vmCalls).not.toContain("daytona:create");
    await act(async () => { (browser.document.querySelector('[aria-label="Confirm Daytona compute usage"]') as unknown as HTMLInputElement).click(); });
    await click("Start cloud sandbox");
    expect(vmCalls.filter(name => name === "daytona:create")).toHaveLength(1);
    expect(vmCalls).not.toContain("daytona:execute");
    await type('[aria-label="Sandbox command"]', "node --version");
    await click("Run sandbox command");
    expect(browser.document.querySelector('[aria-label="Sandbox command output"]')?.textContent).toContain("v24.0.0");
    await click("Import sandbox file");
    expect(browser.localStorage.getItem("orbit-chats:tester")).toContain("Imported from the sandbox");
    await click("Sync 1 project files");
    expect(vmCalls).toContain("daytona:syncFiles");
    await click("Delete cloud sandbox");
    expect((vmRow as { status: string } | null)?.status).toBe("deleted");
    expect((browser.document.querySelector('[aria-label="Confirm Daytona compute usage"]') as unknown as HTMLInputElement).checked).toBe(false);
    expect((button("Start cloud sandbox") as unknown as HTMLButtonElement).disabled).toBe(true);
  } finally {
    workspaceSignedIn = false; vmRow = null;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

test("missing Daytona credentials prevent paid calls and show setup guidance", async () => {
  const container = browser.document.createElement("div"); browser.document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  workspaceSignedIn = true; vmConfigured = false; vmCalls = []; vmRow = null;
  try {
    await act(async () => { root.render(<BrowserRouter><Workspace /></BrowserRouter>); });
    await click("Cloud sandbox");
    expect(browser.document.querySelector(".vm-setup")?.textContent).toContain("DAYTONA_API_KEY");
    await act(async () => { (browser.document.querySelector('[aria-label="Confirm Daytona compute usage"]') as unknown as HTMLInputElement).click(); });
    expect((button("Start cloud sandbox") as unknown as HTMLButtonElement).disabled).toBe(true);
    expect(vmCalls).not.toContain("daytona:create");
  } finally {
    workspaceSignedIn = false; vmConfigured = true;
    await act(async () => { root.unmount(); }); container.remove();
  }
});

afterAll(async () => { await browser.happyDOM.close(); });
