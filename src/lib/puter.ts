export interface Model { id: string; name?: string; provider: string; context?: number }
export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }
export interface PuterSDK {
  auth: { isSignedIn(): boolean; signIn(): Promise<unknown>; signOut(): Promise<unknown>; getUser(): Promise<{ username: string }> };
  ai: { listModels(): Promise<Model[]>; chat(messages: ChatMessage[], options: { model: string; stream: true }): Promise<AsyncIterable<{ text?: string; type?: string; message?: string }>> };
}
declare global { interface Window { puter?: PuterSDK } }
let loading: Promise<PuterSDK> | undefined;
export function loadPuter(): Promise<PuterSDK> {
  if (window.puter) return Promise.resolve(window.puter);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    const timer = window.setTimeout(() => { loading = undefined; script.remove(); reject(new Error("Puter took too long to load. Please retry.")); }, 20000);
    script.onload = () => { clearTimeout(timer); if (window.puter) resolve(window.puter); else { loading = undefined; reject(new Error("Puter SDK unavailable.")); } };
    script.onerror = () => { clearTimeout(timer); loading = undefined; script.remove(); reject(new Error("Could not load Puter. Check your connection and retry.")); };
    document.head.appendChild(script);
  });
  return loading;
}
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const e = error as { message?: string; msg?: string; error?: { message?: string } };
    return e.msg || e.message || e.error?.message || "Puter request failed. Check your account balance and try again.";
  }
  return String(error);
}
export interface Artifact { name: string; content: string }
export interface Task { text: string; done: boolean }
export function extractArtifacts(text: string): { files: Artifact[]; tasks: Task[] } {
  const files: Artifact[] = [];
  let tasks: Task[] = [];
  for (const match of text.matchAll(/```(\w+)[^\n]*\n([\s\S]*?)```/g)) {
    if (match[1] === "html") files.push({ name: "index.html", content: match[2] });
    if (match[1] === "json") {
      try {
        const data = JSON.parse(match[2]);
        if (Array.isArray(data.tasks)) tasks = data.tasks.filter((t: unknown) => typeof t === "object" && t !== null && typeof (t as Task).text === "string").map((t: Task) => ({ text: t.text, done: t.done === true }));
        if (Array.isArray(data.files)) for (const file of data.files) if (typeof file?.name === "string" && typeof file?.content === "string") files.push({ name: file.name, content: file.content });
      } catch { /* Non-artifact JSON remains visible in the message. */ }
    }
  }
  return { files: Array.from(new Map(files.map(f => [f.name, f])).values()), tasks };
}
export const BUILD_PROMPT = `You are Orbit, a helpful AI building assistant. You have a browser-only artifact workspace, not a terminal or deployment environment. For app requests, build a complete self-contained index.html with inline CSS and JavaScript and no external dependencies. Return the app in a fenced html block. Also return a fenced json block with {"tasks":[{"text":"Task description","done":true}]} reflecting actual work done. For other code files return a fenced json object with files:[{name,content}]. Explain your work briefly. Never claim to have run tests or deployed. Generated apps run in an isolated iframe. For general questions respond naturally.`;
export const PREVIEW_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
export function previewDocument(html: string) { return PREVIEW_POLICY + html; }
