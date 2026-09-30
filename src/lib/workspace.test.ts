import { describe, expect, test } from "bun:test";
import { Window, type HTMLButtonElement, type HTMLElement } from "happy-dom";
import { discoverModels, errorText, extractArtifacts, previewDocument, type PuterSDK } from "./puter";
import { applyArtifacts, parseConversations, restoreCheckpoint, SAMPLE_HTML, toggleTask, type Conversation } from "./workspace";

const empty: Conversation = { id: "one", title: "Project", messages: [], files: [], tasks: [], checkpoints: [] };

describe("model catalog and errors", () => {
  test("deduplicates models and tolerates missing provider metadata", async () => {
    const sdk = { ai: { listModels: async () => [{ id: "one", provider: "OpenAI" }, { id: "one", provider: "OpenAI" }, null, { id: "two" }] } } as unknown as PuterSDK;
    const models = await discoverModels(sdk);
    expect(models).toHaveLength(2);
    expect(models[1].provider).toBe("Puter");
  });
  test("rejects invalid catalogs instead of leaving an endless spinner", async () => {
    for (const result of [{ models: [] }, [], null]) {
      await expect(discoverModels({ ai: { listModels: async () => result } } as unknown as PuterSDK)).rejects.toThrow();
    }
  });
  test("explains blocked and cancelled sign-in", () => {
    expect(errorText({ error: "popup_blocked" })).toContain("Allow popups");
    expect(errorText({ error: "auth_window_closed" })).toContain("closed");
    expect(errorText({ msg: "Network error" })).toBe("Network error");
    expect(errorText({ error: { message: "Provider failed" } })).toBe("Provider failed");
  });
});

describe("artifact and conversation state", () => {
  test("parses files and tasks, tolerating invalid JSON and null entries", () => {
    const result = extractArtifacts('```html\n<h1>App</h1>\n```\n```json\n{"files":[null,{"name":"app.js","content":"run()"}],"tasks":[null,{"text":"Build","done":true},{}]}\n```\n```json\nnull\n```\n```json\ninvalid\n```');
    expect(result.files.map(f => f.name)).toEqual(["index.html", "app.js"]);
    expect(result.tasks).toEqual([{ text: "Build", done: true }]);
    expect(extractArtifacts("```html\nunfinished").files).toEqual([]);
  });
  test("deduplicates files and accepts uppercase HTML fences", () => {
    const result = extractArtifacts("```HTML\nfirst\n```\n```html\nsecond\n```");
    expect(result.files).toEqual([{ name: "index.html", content: "second\n" }]);
  });
  test("restores valid history and filters malformed saved records", () => {
    const history = JSON.stringify([null, {}, { ...empty, messages: [null, { id: "m", role: "user", content: "Hello" }], files: [null, { name: "index.html", content: "app" }], tasks: [null, { text: "Task", done: false }], checkpoints: [null] }]);
    const restored = parseConversations(history);
    expect(restored).toHaveLength(1);
    expect(restored[0].messages).toHaveLength(1);
    expect(restored[0].files).toHaveLength(1);
    expect(restored[0].tasks).toHaveLength(1);
    expect(restored[0].checkpoints).toHaveLength(0);
    expect(parseConversations("broken")).toEqual([]);
  });
  test("updates artifacts and saves immutable checkpoints", () => {
    const first = applyArtifacts(empty, [{ name: "index.html", content: "first" }], [{ text: "Build", done: false }]);
    const toggled = toggleTask(first, 0);
    expect(toggled.tasks[0].done).toBe(true);
    expect(first.checkpoints[0].tasks[0].done).toBe(false);
    const second = applyArtifacts(toggled, [{ name: "index.html", content: "second" }, { name: "app.js", content: "code" }], []);
    expect(second.files).toHaveLength(2);
    expect(second.tasks[0].done).toBe(true);
    expect(second.checkpoints).toHaveLength(2);
    const restored = restoreCheckpoint(second, first.checkpoints[0]);
    expect(restored.files).toEqual([{ name: "index.html", content: "first" }]);
    expect(restored.tasks[0].done).toBe(false);
    expect(restored.messages).toBe(second.messages);
  });
});

describe("preview behavior", () => {
  test("adds policy inside the head before any user scripts", () => {
    const document = previewDocument('<!doctype html><html><head><script>app()</script></head><body>App</body></html>');
    expect(document.indexOf("<head>")).toBeLessThan(document.indexOf("Content-Security-Policy"));
    expect(document.indexOf("Content-Security-Policy")).toBeLessThan(document.indexOf("app()"));
    expect(document).toContain("connect-src 'none'");
    expect(document).not.toContain("allow-same-origin");
  });
  test("bundles local CSS and JS into a single preview document", () => {
    const document = previewDocument('<head><link rel="stylesheet" href="./style.css"><script src="app.js"></script></head><body>App</body>', [{ name: "style.css", content: "body{color:green}" }, { name: "app.js", content: "window.appReady=true" }]);
    expect(document).toContain("<style>body{color:green}</style>");
    expect(document).toContain("<script>window.appReady=true</script>");
    expect(document).not.toContain('src="app.js"');
  });
  test("example app toggles habits and updates count and progress", async () => {
    const window = new Window();
    window.document.write(previewDocument(SAMPLE_HTML));
    // Happy DOM does not execute scripts inserted by document.write.
    // Evaluate only the trusted, repository-owned example scripts explicitly.
    for (const script of window.document.querySelectorAll("script")) new Function("window", "document", script.textContent || "")(window, window.document);
    await window.happyDOM.whenAsyncComplete();
    const button = window.document.querySelector<HTMLButtonElement>('[aria-label="Toggle hydration"]')!;
    expect(window.document.getElementById("count")?.textContent).toBe("2 of 3");
    button.click();
    expect(window.document.getElementById("count")?.textContent).toBe("3 of 3");
    expect(window.document.querySelector<HTMLElement>("#progress")?.style.width).toBe("100%");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();
    expect(window.document.getElementById("count")?.textContent).toBe("2 of 3");
    window.localStorage.setItem("habit", "done");
    expect(window.localStorage.getItem("habit")).toBe("done");
    await window.happyDOM.close();
  });
  test("preview artwork contains SVG, not emoji glyphs", () => {
    expect(SAMPLE_HTML).toContain("<svg");
    expect(/\p{Extended_Pictographic}/u.test(SAMPLE_HTML)).toBe(false);
  });
});
