import type { Artifact, ChatMessage, Task } from "./puter";
export type Message = ChatMessage & { id: string; model?: string; mode?: "build" | "chat" | "plan"; webSearch?: boolean; status?: "complete" | "stopped" | "error" };
export type Checkpoint = { id: string; files: Artifact[]; tasks: Task[]; label: string };
export type Conversation = { id: string; title: string; messages: Message[]; files: Artifact[]; tasks: Task[]; checkpoints: Checkpoint[] };
export const uid = () => typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isFile = (v: unknown): v is Artifact => isRecord(v) && typeof v.name === "string" && typeof v.content === "string";
const isTask = (v: unknown): v is Task => isRecord(v) && typeof v.text === "string" && typeof v.done === "boolean";
export function parseConversations(raw: string | null): Conversation[] {
  try {
    const data: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter(isRecord).flatMap(c => {
      if (typeof c.id !== "string" || typeof c.title !== "string") return [];
      const messages: Message[] = Array.isArray(c.messages) ? c.messages.filter((m: unknown): m is Message => isRecord(m) && typeof m.id === "string" && typeof m.content === "string" && ["user", "assistant", "system"].includes(String(m.role))) : [];
      const files = Array.isArray(c.files) ? c.files.filter(isFile) : [];
      const tasks = Array.isArray(c.tasks) ? c.tasks.filter(isTask) : [];
      const checkpoints: Checkpoint[] = Array.isArray(c.checkpoints) ? c.checkpoints.filter((cp: unknown): cp is Checkpoint => isRecord(cp) && typeof cp.id === "string" && typeof cp.label === "string" && Array.isArray(cp.files) && cp.files.every(isFile) && Array.isArray(cp.tasks) && cp.tasks.every(isTask)) : [];
      return [{ id: c.id, title: c.title, messages, files, tasks, checkpoints }];
    });
  } catch { return []; }
}
export function applyArtifacts(c: Conversation, files: Artifact[], tasks: Task[]): Conversation {
  const nextFiles = Array.from(new Map([...c.files, ...files].map(f => [f.name, f])).values());
  const nextTasks = tasks.length ? tasks : c.tasks;
  return { ...c, files: nextFiles, tasks: nextTasks, checkpoints: [...c.checkpoints, { id: uid(), files: nextFiles.map(f => ({ ...f })), tasks: nextTasks.map(t => ({ ...t })), label: `Checkpoint ${c.checkpoints.length + 1}` }] };
}
export function applyPlan(c: Conversation, tasks: Task[]): Conversation {
  // Plan mode never writes files, creates artifact checkpoints, or claims steps are done.
  return tasks.length ? { ...c, tasks: tasks.map(t => ({ text: t.text, done: false })) } : c;
}
export function toggleTask(c: Conversation, index: number): Conversation {
  return { ...c, tasks: c.tasks.map((t, i) => i === index ? { ...t, done: !t.done } : t) };
}
export function restoreCheckpoint(c: Conversation, cp: Checkpoint): Conversation {
  return { ...c, files: cp.files.map(f => ({ ...f })), tasks: cp.tasks.map(t => ({ ...t })) };
}
export const SAMPLE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f8f8f2;color:#303e30;font-family:Arial,sans-serif;padding:26px}header{display:flex;justify-content:space-between;align-items:center;font-size:10px}header b{display:flex;align-items:center;gap:5px;font-size:19px;letter-spacing:-.8px}.badge{border:1px solid #d9dfd0;padding:7px 9px;border-radius:20px;color:#7e8a70;font-size:8px}h1{font-family:Georgia,serif;font-weight:400;font-size:35px;line-height:1.15;letter-spacing:-1.2px;margin:30px 0 12px}p{font-size:11px;color:#7d8975;line-height:1.7}.week{display:flex;gap:6px;margin:22px 0}.day{flex:1;text-align:center;background:#ecf0e4;padding:11px 2px;border-radius:8px;font-size:9px;color:#8b9780}.day.active{background:#d4e1c1;color:#3c5130}.day strong{display:block;margin-top:7px;font-size:14px}.label{font-size:8px;letter-spacing:1.1px;margin:24px 0 12px}.habit{border:1px solid #dfe5d5;background:#fff;border-radius:9px;padding:12px 10px;margin:8px 0;display:flex;gap:9px;align-items:center;font-size:10px}.habit svg{width:18px;height:18px;color:#8c9f75}.habit span{flex:1}.habit button{width:22px;height:22px;border:1px solid #c9d8b8;border-radius:50%;background:#e3ecd8;color:#617a4a;cursor:pointer}.habit button:not(.checked){background:#fff}.foot{display:flex;justify-content:space-between;margin-top:23px;font-size:9px;color:#8b987c}.progress{height:4px;border-radius:4px;background:#e2e8d8;margin-top:10px}.progress div{height:100%;width:66.66%;background:#8da76d;border-radius:4px;transition:width .2s}</style></head><body><header><b>sprout<svg width="17" height="20" viewBox="0 0 24 24" fill="none" stroke="#8da76d" stroke-width="1.5"><path d="M12 22V12M12 16C3 16 3 8 3 8s9 0 9 8ZM12 12c0-8 9-8 9-8s0 8-9 8Z"/></svg></b><span class="badge">A little better, every day</span></header><h1>Small habits.<br>Big possibilities.</h1><p>Make room for the things that make you feel good.</p><div class="week"><div class="day">M<strong>12</strong></div><div class="day">T<strong>13</strong></div><div class="day active">W<strong>14</strong></div><div class="day">T<strong>15</strong></div><div class="day">F<strong>16</strong></div><div class="day">S<strong>17</strong></div><div class="day">S<strong>18</strong></div></div><p class="label">TODAY’S LITTLE WINS</p><div class="habit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span>Take a mindful morning walk</span><button class="checked" aria-label="Toggle morning walk" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></button></div><div class="habit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 5v16M3 3c4 0 7 1 9 3 2-2 5-3 9-3v16c-4 0-7 1-9 2-2-1-5-2-9-2Z"/></svg><span>Read a chapter of something good</span><button class="checked" aria-label="Toggle reading" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg></button></div><div class="habit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2S5 11 5 15a7 7 0 0 0 14 0c0-4-7-13-7-13Z"/></svg><span>Stay hydrated, stay happy</span><button aria-label="Toggle hydration" aria-pressed="false"></button></div><div class="foot"><span>Progress, not perfection.</span><span id="count">2 of 3</span></div><div class="progress"><div id="progress"></div></div><script>document.querySelectorAll('.habit button').forEach(function(b){b.addEventListener('click',function(){var done=b.classList.toggle('checked');b.setAttribute('aria-pressed',String(done));b.innerHTML=done?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 12 4 4 8-8"/></svg>':'';var n=document.querySelectorAll('.habit button.checked').length;document.getElementById('count').textContent=n+' of 3';document.getElementById('progress').style.width=n/3*100+'%'})})</script></body></html>`;
