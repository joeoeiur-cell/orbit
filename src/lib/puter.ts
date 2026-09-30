export interface Model {
  id: string;
  name?: string;
  provider: string;
  context?: number;
}
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface PuterSDK {
  env?: string;
  auth: {
    isSignedIn(): boolean;
    signIn(options?: { request_auth?: boolean }): Promise<unknown>;
    signOut(): void | Promise<unknown>;
    getUser(): Promise<{ username: string }>;
  };
  ai: {
    listModels(): Promise<Model[]>;
    chat(messages: ChatMessage[], options: { model: string; stream: true }): Promise<AsyncIterable<{ text?: string; type?: string; message?: string }>>;
  };
}
let loading: Promise<PuterSDK> | undefined;
let cached: PuterSDK | undefined;
export function getPuter() { return cached; }
export function loadPuter(): Promise<PuterSDK> {
  if (cached) return Promise.resolve(cached);
  if (loading) return loading;
  // The official npm package is bundled by Vite. No CDN script, CORS
  // attribute, or third-party JavaScript download is required at runtime.
  loading = import("@heyputer/puter.js").then(({ puter }) => {
    if (typeof puter.auth?.signIn !== "function" || typeof puter.ai?.chat !== "function") {
      throw new Error("The Puter package did not initialize correctly.");
    }
    cached = puter as unknown as PuterSDK;
    return cached;
  }).catch(error => {
    loading = undefined;
    throw new Error(`Could not initialize Puter: ${errorText(error)}`);
  });
  return loading;
}
export async function discoverModels(sdk: PuterSDK): Promise<Model[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      sdk.ai.listModels(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Model discovery timed out. Please retry.")), 15000); }),
    ]);
    if (!Array.isArray(result)) throw new Error("Puter returned an unexpected model catalog.");
    const models = result.filter(m => m && typeof m.id === "string").map(m => ({ ...m, provider: typeof m.provider === "string" ? m.provider : "Puter" }));
    const unique = Array.from(new Map(models.map(m => [m.id, m])).values());
    if (!unique.length) throw new Error("Puter returned no models. Please retry shortly.");
    return unique;
  } finally { if (timer) clearTimeout(timer); }
}
export function errorText(error: unknown): string {
  if (typeof error === "object" && error) {
    const e = error as { message?: unknown; msg?: unknown; error?: unknown; code?: string };
    const code = typeof e.error === "string" ? e.error : e.code;
    if (code === "popup_blocked") return "Your browser blocked the Puter sign-in window. Allow popups for this site, or open the workspace in a new tab.";
    if (code === "auth_window_closed") return "The sign-in window was closed before connecting. You can try again.";
    if (code === "not_available_in_app") return "This app is already running inside Puter. Restore your existing session instead.";
    if (typeof e.msg === "string") return e.msg;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "object" && e.error && typeof (e.error as { message?: unknown }).message === "string") return (e.error as { message: string }).message;
    if (typeof e.error === "string") return e.error;
    return "Puter request failed. Check your account balance and connection, then retry.";
  }
  return typeof error === "string" ? error : "An unexpected error occurred. Please retry.";
}
export interface Artifact { name: string; content: string }
export interface Task { text: string; done: boolean }
export function extractArtifacts(text: string): { files: Artifact[]; tasks: Task[] } {
  const files: Artifact[] = [];
  let tasks: Task[] = [];
  for (const match of text.matchAll(/```([\w-]+)[^\n]*\n([\s\S]*?)```/g)) {
    if (["html", "htm"].includes(match[1].toLowerCase())) files.push({ name: "index.html", content: match[2] });
    if (match[1].toLowerCase() === "json") {
      try {
        const data = JSON.parse(match[2]);
        if (!data || typeof data !== "object") continue;
        if (Array.isArray(data.tasks)) tasks = data.tasks.filter((t: unknown) => typeof t === "object" && t !== null && typeof (t as Task).text === "string").map((t: Task) => ({ text: t.text, done: t.done === true }));
        if (Array.isArray(data.files)) for (const file of data.files) if (typeof file?.name === "string" && typeof file?.content === "string") files.push({ name: file.name, content: file.content });
      } catch { /* Ordinary or incomplete JSON stays in the chat message. */ }
    }
  }
  return { files: Array.from(new Map(files.map(f => [f.name, f])).values()), tasks };
}
export const BUILD_PROMPT = `You are Orbit, a helpful AI building assistant. Do not use emojis. Use inline SVG illustrations and icons for visuals. You have a browser-only artifact workspace, not a terminal or deployment environment. For app requests, build a complete self-contained index.html with inline CSS and JavaScript and no external dependencies. Return the app in a fenced html block. Also return a fenced json block with {"tasks":[{"text":"Task description","done":true}]} reflecting actual work done. For other code files return a fenced json object with files:[{name,content}]. Explain your work briefly. Never claim to have run tests or deployed. Apps run in an isolated iframe with no network access and session-only in-memory localStorage. Do not require remote packages, server APIs, or navigation. For general questions respond naturally.`;
export const PREVIEW_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
const PREVIEW_RUNTIME = `<script>(function(){var data=Object.create(null);try{Object.defineProperty(window,'localStorage',{value:{getItem:function(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null},setItem:function(k,v){data[k]=String(v)},removeItem:function(k){delete data[k]},clear:function(){data=Object.create(null)},key:function(i){return Object.keys(data)[i]||null},get length(){return Object.keys(data).length}}})}catch(e){}function show(message){var box=document.getElementById('orbit-preview-error');if(!box){box=document.createElement('div');box.id='orbit-preview-error';box.style.cssText='position:fixed;bottom:10px;left:10px;right:10px;padding:12px;background:#fff4ec;border:1px solid #dbac8b;border-radius:8px;color:#754024;font:12px/1.5 system-ui;z-index:2147483647';document.body.appendChild(box)}box.textContent='Preview error: '+message}window.addEventListener('error',function(e){show(e.message)});window.addEventListener('unhandledrejection',function(e){show(e.reason&&e.reason.message||String(e.reason))})})();</script>`;
export function previewDocument(html: string, files: Artifact[] = []) {
  const resolveFile = (path: string) => files.find(f => f.name.replace(/^\.\//, "") === path.replace(/^\.\//, ""));
  const bundled = html.replace(/<link\b[^>]*>/gi, tag => {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    const file = href ? resolveFile(href) : undefined;
    return file?.name.endsWith(".css") ? `<style>${file.content.replace(/<\/style/gi, "<\\/style")}</style>` : tag;
  }).replace(/<script\b([^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*)>\s*<\/script>/gi, (tag, _attrs, src) => {
    const file = resolveFile(src);
    return file ? `<script>${file.content.replace(/<\/script/gi, "<\\/script")}</script>` : tag;
  });
  const head = PREVIEW_POLICY + PREVIEW_RUNTIME;
  return /<head\b[^>]*>/i.test(bundled) ? bundled.replace(/<head\b[^>]*>/i, tag => tag + head) : `<!doctype html><html><head>${head}</head><body>${bundled}</body></html>`;
}
