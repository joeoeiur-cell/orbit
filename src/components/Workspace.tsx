import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Circle, Code2, Copy, Download, FileCode2, FolderOpen, Globe, History, Layers, Link2, ListTodo, Loader2, LogOut, Menu, MessageSquare, Monitor, MoreHorizontal, Paperclip, Plus, Search, Settings2, ShieldCheck, Smartphone, Sparkles, Square, Terminal, Trash2, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { BUILD_PROMPT, errorText, extractArtifacts, loadPuter, previewDocument, type Artifact, type ChatMessage, type Model, type PuterSDK, type Task } from "@/lib/puter";

type Message = ChatMessage & { id: string; model?: string };
type Checkpoint = { id: string; files: Artifact[]; tasks: Task[]; label: string };
type Conversation = { id: string; title: string; messages: Message[]; files: Artifact[]; tasks: Task[]; checkpoints: Checkpoint[] };
const uid = () => crypto.randomUUID();
const examples = [
  { icon: Code2, title: "Build something", subtitle: "An idea → a working app", prompt: "Build a beautiful, interactive habit tracker app with a weekly view and local storage." },
  { icon: Sparkles, title: "Explore an idea", subtitle: "Find your next lightbulb moment", prompt: "Help me brainstorm 5 creative app ideas that solve everyday problems." },
  { icon: FileCode2, title: "Make it better", subtitle: "Refactor, debug, or explain", prompt: "Explain how to structure a maintainable React app, with examples and a checklist." },
  { icon: Globe, title: "Learn something", subtitle: "Go down a good rabbit hole", prompt: "Explain how large language models work using intuitive analogies." },
];
const sampleHTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f8f7f3;color:#303a32;font-family:Arial,sans-serif;padding:30px}header{display:flex;justify-content:space-between;align-items:center;font-size:12px}header b{font-size:18px;letter-spacing:-1px}.badge{border:1px solid #d9dfd5;padding:7px 10px;border-radius:20px;font-size:10px}h1{font-family:Georgia,serif;font-weight:400;font-size:37px;line-height:1.13;letter-spacing:-1.5px;margin:38px 0 13px}p{font-size:12px;color:#82887e;line-height:1.7}.week{display:flex;gap:8px;margin:25px 0}.day{flex:1;text-align:center;background:#eeeee7;padding:12px 2px;border-radius:9px;font-size:10px;color:#8d9386}.day.active{background:#d8e5c9;color:#3c5138}.day strong{display:block;margin-top:8px;font-size:16px}.habit{border:1px solid #e1e3d9;background:white;border-radius:12px;padding:14px;margin:10px 0;display:flex;gap:12px;align-items:center;font-size:12px}.habit span{flex:1}.habit button{width:23px;height:23px;border:1px solid #ccd8c0;border-radius:50%;background:#e4eddc;color:#526a40;cursor:pointer}.foot{display:flex;justify-content:space-between;margin-top:28px;font-size:10px;color:#92988b}.progress{height:5px;border-radius:4px;background:#e4e7dd;margin-top:10px}.progress div{height:100%;width:66%;background:#96ac7e;border-radius:4px}</style></head><body><header><b>sprout<span style="color:#91a77b">✳</span></b><span class="badge">A little better, every day</span></header><h1>Small habits.<br>Big possibilities.</h1><p>Make room for the things that make you feel good.</p><div class="week"><div class="day">M<strong>12</strong></div><div class="day">T<strong>13</strong></div><div class="day active">W<strong>14</strong></div><div class="day">T<strong>15</strong></div><div class="day">F<strong>16</strong></div><div class="day">S<strong>17</strong></div><div class="day">S<strong>18</strong></div></div><p>TODAY’S LITTLE WINS</p><div class="habit">☀️<span>Take a mindful morning walk</span><button onclick="this.textContent=this.textContent?'':'✓'">✓</button></div><div class="habit">📖<span>Read a chapter of something good</span><button onclick="this.textContent=this.textContent?'':'✓'">✓</button></div><div class="habit">💧<span>Stay hydrated, stay happy</span><button onclick="this.textContent=this.textContent?'':'✓'"></button></div><div class="foot"><span>You’re showing up. That’s what counts.</span><span>2 of 3</span></div><div class="progress"><div></div></div></body></html>`;
function MessageContent({ text }: { text: string }) {
  return <div className="message-content">{text.split(/(```[\s\S]*?```)/g).map((part, i) => part.startsWith("```") ? <details key={i} className="code-block"><summary><Code2 size={14} /> {part.slice(3).split("\n")[0] || "Code"}<span>View code</span></summary><pre>{part.replace(/^```[^\n]*\n?|```$/g, "")}</pre></details> : <div key={i} className="whitespace-pre-wrap">{part.split(/(\*\*[^*]+\*\*)/g).map((s, j) => s.startsWith("**") ? <strong key={j}>{s.slice(2, -2)}</strong> : s)}</div>)}</div>;
}
export default function Workspace() {
  const [sdk, setSdk] = useState<PuterSDK>();
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("gpt-5-nano");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelError, setModelError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"build" | "chat">("build");
  const [tab, setTab] = useState<"preview" | "files" | "tasks" | "activity">("preview");
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth > 950);
  const [mobileNav, setMobileNav] = useState(false);
  const [phone, setPhone] = useState(false);
  const [help, setHelp] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState("index.html");
  const [taskInput, setTaskInput] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; content: string }>();
  const [previewKey, setPreviewKey] = useState(0);
  const runId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = conversations.find(c => c.id === activeId);
  const messages = current?.messages || [];
  const files = current?.files || [];
  const tasks = current?.tasks || [];
  const checkpoints = current?.checkpoints || [];
  const html = files.find(f => f.name.endsWith(".html"));
  const selectedModel = models.find(m => m.id === model);
  const modelName = selectedModel?.name || model;
  const update = (id: string, fn: (c: Conversation) => Conversation) => setConversations(cs => cs.map(c => c.id === id ? fn(c) : c));
  const refreshModels = async (p: PuterSDK) => {
    setModelError("");
    try { const result = await p.ai.listModels(); setModels(Array.from(new Map(result.map(m => [m.id, m])).values())); }
    catch (e) { setModelError(errorText(e)); }
  };
  useEffect(() => {
    let live = true;
    loadPuter().then(async p => {
      if (!live) return;
      setSdk(p);
      void refreshModels(p);
      if (p.auth.isSignedIn()) { const user = await p.auth.getUser(); if (live) setUsername(user.username); }
    }).catch(e => { if (live) setModelError(errorText(e)); });
    return () => { live = false; runId.current++; };
  }, []);
  useEffect(() => {
    const key = `orbit-chats:${username || "guest"}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "[]");
      const valid = Array.isArray(saved) ? saved.filter(c => typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.messages) && Array.isArray(c.files) && Array.isArray(c.tasks) && Array.isArray(c.checkpoints)) : [];
      setConversations(valid); setActiveId(valid[0]?.id || "");
    } catch { setConversations([]); setActiveId(""); }
    setLoadedKey(key);
  }, [username]);
  useEffect(() => {
    const key = `orbit-chats:${username || "guest"}`;
    if (loadedKey !== key || busy) return;
    try { localStorage.setItem(key, JSON.stringify(conversations)); } catch { toast.error("Browser storage is full. Export important files before clearing history."); }
  }, [conversations, username, loadedKey, busy]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);
  const connect = async () => {
    setConnecting(true);
    try {
      if (!sdk) { const p = await loadPuter(); setSdk(p); void refreshModels(p); toast.info("Puter is ready. Click Connect Puter again to open sign-in."); return; }
      await sdk.auth.signIn();
      const user = await sdk.auth.getUser(); setUsername(user.username); toast.success(`Connected as ${user.username}`);
    } catch (e) { toast.error(errorText(e)); } finally { setConnecting(false); }
  };
  const newChat = () => { if (busy) return; setActiveId(""); setInput(""); setAttachment(undefined); setMobileNav(false); };
  const send = async () => {
    if (!input.trim() || busy) return;
    if (!username || !sdk) { toast.info("Connect your Puter account first. Your prompt will stay here."); return; }
    const text = input.trim();
    const userMessage: Message = { id: uid(), role: "user", content: text + (attachment ? `\n\nAttached file: ${attachment.name}\n${attachment.content}` : "") };
    const assistant: Message = { id: uid(), role: "assistant", content: "", model: modelName };
    const id = current?.id || uid();
    const prior = current?.messages || [];
    if (current) update(id, c => ({ ...c, messages: [...c.messages, userMessage, assistant] }));
    else setConversations(cs => [{ id, title: text.slice(0, 48), messages: [userMessage, assistant], files: [], tasks: [], checkpoints: [] }, ...cs]);
    setActiveId(id); setInput(""); setAttachment(undefined); setBusy(true);
    const token = ++runId.current;
    let response = "";
    try {
      const context = mode === "build" ? `\nCurrent workspace files:\n${JSON.stringify(files)}\nCurrent tasks:\n${JSON.stringify(tasks)}` : "";
      const stream = await sdk.ai.chat([{ role: "system", content: (mode === "build" ? BUILD_PROMPT : "You are Orbit, a helpful assistant. Answer clearly and thoughtfully.") + context }, ...prior.map(({ role, content }) => ({ role, content })), { role: "user", content: userMessage.content }], { model, stream: true });
      for await (const chunk of stream) {
        if (token !== runId.current) break;
        if (chunk.type === "error") throw new Error(chunk.message || "Puter stream failed.");
        if (chunk.text && (!chunk.type || chunk.type === "text")) {
          response += chunk.text;
          update(id, c => ({ ...c, messages: c.messages.map(m => m.id === assistant.id ? { ...m, content: response } : m) }));
        }
      }
      if (token !== runId.current) return;
      if (!response) throw new Error("This model returned no text. Try another model.");
      const artifacts = extractArtifacts(response);
      if (artifacts.files.length || artifacts.tasks.length) {
        update(id, c => {
          const nextFiles = Array.from(new Map([...c.files, ...artifacts.files].map(f => [f.name, f])).values());
          const nextTasks = artifacts.tasks.length ? artifacts.tasks : c.tasks;
          return { ...c, files: nextFiles, tasks: nextTasks, checkpoints: [...c.checkpoints, { id: uid(), files: nextFiles, tasks: nextTasks, label: `Checkpoint ${c.checkpoints.length + 1}` }] };
        });
        setRightOpen(true); setTab(artifacts.files.length ? "preview" : "tasks");
      }
    } catch (e) { toast.error(errorText(e)); update(id, c => ({ ...c, messages: c.messages.map(m => m.id === assistant.id ? { ...m, content: response + `\n\nRequest failed: ${errorText(e)}` } : m) })); }
    finally { if (token === runId.current) setBusy(false); }
  };
  const stop = () => { runId.current++; setBusy(false); toast.info("Stopped displaying this response. The provider may still finish the request."); };
  const download = (file: Artifact) => { const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" })); const a = document.createElement("a"); a.href = url; a.download = file.name.split("/").pop() || "artifact.txt"; a.click(); URL.revokeObjectURL(url); };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); } catch { toast.error("Clipboard access is unavailable."); } };
  const addTask = () => { if (!taskInput.trim()) return; const task = { text: taskInput.trim(), done: false }; if (current) update(current.id, c => ({ ...c, tasks: [...c.tasks, task] })); else { const id = uid(); setConversations(cs => [{ id, title: "New project", messages: [], files: [], tasks: [task], checkpoints: [] }, ...cs]); setActiveId(id); } setTaskInput(""); };
  const filteredModels = models.filter(m => `${m.name || ""} ${m.id} ${m.provider}`.toLowerCase().includes(modelSearch.toLowerCase()));
  return <div className="orbit-shell">
    <aside className={`orbit-sidebar ${mobileNav ? "mobile-open" : ""}`}>
      <Link to="/" className="orbit-brand"><span className="brand-mark"><Layers size={21} /></span>orbit<span className="brand-beta">BETA</span></Link>
      <Button onClick={newChat} disabled={busy} className="new-chat"><Plus size={16} /> New conversation <span>↗</span></Button>
      <nav className="side-nav">
        <button onClick={() => { setSearchOpen(v => !v); setMobileNav(true); }}><Search size={17} /> Search conversations <span>⌕</span></button>
        <button onClick={() => { setRightOpen(true); setTab("files"); setMobileNav(false); }}><FolderOpen size={17} /> My workspace</button>
      </nav>
      {searchOpen && <input autoFocus className="history-search" placeholder="Search your chats…" value={historySearch} onChange={e => setHistorySearch(e.target.value)} />}
      <div className="history-label">YOUR CONVERSATIONS <span>{conversations.length}</span></div>
      <div className="conversation-list">{conversations.filter(c => c.title.toLowerCase().includes(historySearch.toLowerCase())).map(c => <div key={c.id} className={`history-item ${activeId === c.id ? "active" : ""}`}><button disabled={busy} onClick={() => { setActiveId(c.id); setMobileNav(false); }}><MessageSquare size={14} /><span>{c.title}</span></button><button disabled={busy} aria-label={`Delete ${c.title}`} onClick={() => { setConversations(cs => cs.filter(x => x.id !== c.id)); if (activeId === c.id) setActiveId(""); }}><Trash2 size={12} /></button></div>)}{!conversations.length && <div className="history-empty"><MessageSquare size={20} /><p>A little space for your big ideas.</p><span>Your conversations will live here.</span></div>}</div>
      <div className="sidebar-bottom">
        <div className="puter-card"><span className="puter-symbol">p<span>·</span></span><div><strong>{username ? "Puter connected" : "One account. Every model."}</strong><p>{username ? `@${username}` : "Bring your Puter account along."}</p></div><span className={`status-dot ${username ? "connected" : ""}`} /></div>
        <button className="account-button" disabled={connecting || busy} onClick={username ? async () => { try { await sdk?.auth.signOut(); setUsername(""); toast.success("Puter disconnected"); } catch(e) { toast.error(errorText(e)); } } : connect}>{connecting ? <Loader2 size={14} className="animate-spin" /> : username ? <LogOut size={14} /> : <Link2 size={14} />}{username ? "Disconnect account" : "Connect Puter"}<ArrowRight size={14} /></button>
        <button className="settings-button" onClick={() => setHelp(true)}><Settings2 size={16} /> Workspace settings <span>⌘</span></button>
        <div className="sidebar-footer"><span className="status-dot connected" /> Your next idea starts here <span>↗</span></div>
      </div>
    </aside>
    <main className="orbit-main">
      <header className="workspace-header"><div className="header-left"><button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMobileNav(v => !v)}><Menu size={20} /></button><span className="header-title">Personal workspace</span><ChevronRight size={13} /><span className="header-subtitle">{current ? current.title : "New conversation"}</span></div><div className="header-actions"><span className="private-label"><ShieldCheck size={13} /> Private workspace</span><button className={`icon-button ${rightOpen ? "selected" : ""}`} aria-label="Toggle workspace panel" onClick={() => setRightOpen(v => !v)}><Code2 size={18} /></button><button className="icon-button" aria-label="Workspace information" onClick={() => setHelp(true)}><MoreHorizontal size={20} /></button></div></header>
      <div className="workspace-body">
        <section className="chat-pane">
          <div className="chat-scroll">
            {messages.length === 0 ? <div className="welcome">
              <div className="welcome-badge"><span className="status-dot connected" /> MANY MODELS. ONE CREATIVE SPACE.</div>
              <div className="hero-symbol"><Layers size={32} strokeWidth={1.3} /><span className="tiny-spark">✦</span></div>
              <h1>A little curiosity.<br /><span>Endless possibilities.</span></h1>
              <p className="welcome-description">Chat, create, and turn your what-ifs into what’s next.<br />Your favorite AI models, finally in one orbit.</p>
              <div className="provider-row"><span className="provider anthropic">✳</span><span className="provider openai">◎</span><span className="provider google">✦</span><span className="provider deepseek">≈</span><span className="provider xai">𝕏</span><span className="provider-count">{models.length ? `${models.length}+ models` : "Discover models"}<span>powered by Puter</span></span></div>
              <div className="prompt-grid">{examples.map(({ icon: Icon, title, subtitle, prompt }) => <button key={title} onClick={() => { setInput(prompt); setMode(title === "Build something" ? "build" : "chat"); textArea.current?.focus(); }}><span className="prompt-icon"><Icon size={19} strokeWidth={1.5} /></span><ArrowRight className="prompt-arrow" size={15} /><strong>{title}</strong><span>{subtitle}</span></button>)}</div>
              <div className="welcome-note"><Zap size={13} /> All the intelligence. None of the tab switching.</div>
            </div> : <div className="message-list">{messages.map(m => <div key={m.id} className={`chat-message ${m.role}`}><div className="message-avatar">{m.role === "user" ? (username[0] || "Y").toUpperCase() : <Layers size={16} />}</div><div className="message-inner"><div className="message-label">{m.role === "user" ? "You" : "Orbit"}<span>{m.model}</span>{m.content && <button aria-label="Copy message" onClick={() => copy(m.content)}><Copy size={12} /></button>}</div>{m.content ? <MessageContent text={m.content} /> : busy ? <span className="thinking"><span /><span /><span /></span> : <p className="text-sm text-muted-foreground">Response stopped.</p>}</div></div>)}<div ref={bottom} /></div>}
          </div>
          <div className="composer-wrap">
            {attachment && <div className="attachment-pill"><FileCode2 size={13} />{attachment.name}<button aria-label="Remove attachment" onClick={() => setAttachment(undefined)}><X size={13} /></button></div>}
            <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
              <textarea ref={textArea} aria-label="Message" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} placeholder="Ask anything, or build something extraordinary…" rows={2} />
              <div className="composer-toolbar"><div><button type="button" className="icon-button" aria-label="Attach text file" onClick={() => fileInput.current?.click()}><Paperclip size={17} /></button><span className="toolbar-divider" /><button type="button" className="mode-button" onClick={() => setMode(mode === "build" ? "chat" : "build")}>{mode === "build" ? <Code2 size={14} /> : <MessageSquare size={14} />}{mode === "build" ? "Build" : "Chat"}<ChevronDown size={12} /></button></div><div><button type="button" className="model-button" onClick={() => setModelOpen(true)}><span className="model-mini">✳</span><span>{modelName}</span><ChevronDown size={12} /></button>{busy ? <button type="button" className="send-button" aria-label="Stop response" onClick={stop}><Square size={14} fill="currentColor" /></button> : <button type="submit" className="send-button" aria-label="Send message" disabled={!input.trim()}><ArrowUp size={18} /></button>}</div></div>
            </form>
            <input ref={fileInput} type="file" accept=".txt,.md,.html,.css,.js,.ts,.tsx,.json,.csv,.py" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 100000) toast.error("Please attach a text file smaller than 100 KB."); else setAttachment({ name: f.name, content: await f.text() }); e.target.value = ""; }} />
            <div className="composer-caption"><span>{username ? <><span className="status-dot connected" /> Connected to Puter</> : <><ShieldCheck size={11} /> Your models. Your Puter account.</>}</span><span>AI can make mistakes. Stay curious.</span><span className="enter-label">↵ to send</span></div>
          </div>
        </section>
        {rightOpen && <aside className="artifact-pane">
          <div className="artifact-top"><span><Layers size={15} /> The workspace</span><button className="icon-button" aria-label="Close workspace" onClick={() => setRightOpen(false)}><X size={15} /></button></div>
          <div className="artifact-tabs">{([{ id: "preview", icon: Monitor, label: "Preview" }, { id: "files", icon: Code2, label: "Files" }, { id: "tasks", icon: ListTodo, label: "Tasks" }, { id: "activity", icon: History, label: "Activity" }] as const).map(({ id, icon: Icon, label }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={13} />{label}{id === "tasks" && tasks.length > 0 && <span>{tasks.length}</span>}</button>)}</div>
          {tab === "preview" && <div className="preview-section"><div className="preview-address"><span className="status-dot connected" /><span>{html ? html.name : "sprout · example app"}</span><button aria-label="Reload preview" onClick={() => setPreviewKey(k => k + 1)}>↻</button><button aria-label="Desktop preview" className={!phone ? "active" : ""} onClick={() => setPhone(false)}><Monitor size={13} /></button><button aria-label="Mobile preview" className={phone ? "active" : ""} onClick={() => setPhone(true)}><Smartphone size={13} /></button></div><div className={`preview-frame ${phone ? "phone" : ""}`}><iframe key={previewKey + (html?.content || "")} title={html ? "Generated application preview" : "Example habit tracker preview"} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={previewDocument(html?.content || sampleHTML)} /></div><div className="preview-foot"><span><span className="status-dot connected" /> {html ? "Isolated browser preview" : "Interactive example · not AI generated"}</span>{html && <button aria-label="Download app" onClick={() => download(html)}><Download size={13} /></button>}</div>{!html && <div className="preview-hint"><span className="hint-icon"><Sparkles size={19} /></span><strong>Your ideas, brought to life.</strong><p>Ask Orbit to build an app and watch it<br />take shape right here.</p><button onClick={() => { setMode("build"); setInput(examples[0].prompt); textArea.current?.focus(); }}>Let’s build something <ArrowRight size={13} /></button></div>}</div>}
          {tab === "files" && <div className="panel-content"><div className="panel-heading"><strong>Project files</strong><span>{files.length} files</span></div>{files.length ? <><div className="file-list">{files.map(f => <button key={f.name} className={selectedFile === f.name ? "active" : ""} onClick={() => setSelectedFile(f.name)}><FileCode2 size={14} />{f.name}<ChevronRight size={12} /></button>)}</div>{(() => { const f = files.find(f => f.name === selectedFile) || files[0]; return <><div className="file-toolbar"><span>{f.name}</span><button aria-label="Copy file" onClick={() => copy(f.content)}><Copy size={13} /></button><button aria-label="Download file" onClick={() => download(f)}><Download size={13} /></button></div><pre className="file-code">{f.content}</pre></>; })()}</> : <div className="panel-empty"><FolderOpen size={30} /><h3>A home for your creations</h3><p>Files created by the AI appear here.<br />View, copy, or download your code.</p></div>}</div>}
          {tab === "tasks" && <div className="panel-content"><div className="panel-heading"><strong>The game plan</strong><span>{tasks.filter(t => t.done).length}/{tasks.length} done</span></div><div className="task-progress"><div style={{ width: `${tasks.length ? tasks.filter(t => t.done).length / tasks.length * 100 : 0}%` }} /></div>{tasks.map((t, i) => <div className={`task-row ${t.done ? "done" : ""}`} key={i}><button aria-label={t.done ? "Mark incomplete" : "Complete task"} onClick={() => current && update(current.id, c => ({ ...c, tasks: c.tasks.map((x, j) => j === i ? { ...x, done: !x.done } : x) }))}>{t.done ? <Check size={13} /> : <Circle size={13} />}</button><span>{t.text}</span><button aria-label="Delete task" onClick={() => current && update(current.id, c => ({ ...c, tasks: c.tasks.filter((_, j) => j !== i) }))}><X size={12} /></button></div>)}<form className="add-task" onSubmit={e => { e.preventDefault(); addTask(); }}><input aria-label="New task" placeholder="Add a task…" value={taskInput} onChange={e => setTaskInput(e.target.value)} /><button aria-label="Add task"><Plus size={15} /></button></form>{!tasks.length && <div className="panel-empty"><ListTodo size={30} /><h3>Big ideas. Small steps.</h3><p>Add your own checklist or let Build mode<br />create a plan alongside your app.</p></div>}</div>}
          {tab === "activity" && <div className="panel-content"><div className="panel-heading"><strong>Project checkpoints</strong><span>{checkpoints.length} saved</span></div>{checkpoints.map(cp => <div className="checkpoint" key={cp.id}><span className="checkpoint-icon"><History size={15} /></span><div><strong>{cp.label}</strong><p>{cp.files.length} files · {cp.tasks.length} tasks</p></div><button disabled={busy} onClick={() => { if (current) update(current.id, c => ({ ...c, files: cp.files, tasks: cp.tasks })); toast.success("Workspace restored. Chat history is unchanged."); }}>Restore</button></div>)}{!checkpoints.length && <div className="panel-empty"><History size={30} /><h3>Room to experiment</h3><p>Each generated artifact saves a checkpoint.<br />Restore files and tasks when you need to.</p></div>}<div className="safety-note"><ShieldCheck size={15} /><p>Browser-safe by design. No shell access, deployments, or hidden tool execution.</p></div></div>}
          <div className="artifact-bottom"><Terminal size={12} /><span>From a spark to something real.</span><span>✦</span></div>
        </aside>}
      </div>
    </main>
    <Dialog open={modelOpen} onOpenChange={setModelOpen}><DialogContent className="orbit-dialog"><DialogHeader><DialogTitle>Find your next thinking partner</DialogTitle><DialogDescription>All models from Puter’s live catalog. Availability and costs depend on your account.</DialogDescription></DialogHeader><div className="model-search"><Search size={16} /><input aria-label="Search models" placeholder="Search models or providers…" value={modelSearch} onChange={e => setModelSearch(e.target.value)} /></div><div className="model-list">{modelError && <div className="model-error">{modelError}<Button variant="outline" onClick={async () => { try { const p = sdk || await loadPuter(); setSdk(p); await refreshModels(p); } catch (e) { setModelError(errorText(e)); } }}>Retry</Button></div>}{!models.length && !modelError && <p className="p-6 text-sm text-muted-foreground">Loading Puter’s model catalog…</p>}{filteredModels.map(m => <button key={m.id} onClick={() => { setModel(m.id); setModelOpen(false); }}><span className="model-mini">✦</span><div><strong>{m.name || m.id}</strong><span>{m.provider} · {m.id}</span></div>{m.context && <small>{Math.round(m.context / 1000)}k</small>}{model === m.id && <Check size={16} />}</button>)}{models.length > 0 && filteredModels.length === 0 && <p className="p-6 text-sm text-muted-foreground">No models match your search.</p>}</div></DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="orbit-dialog"><DialogHeader><DialogTitle>A space for your next big idea.</DialogTitle><DialogDescription>Orbit connects directly to Puter. No API keys needed.</DialogDescription></DialogHeader><div className="help-content"><p><strong>Your account, your usage.</strong> Connect with Puter’s secure popup. Model usage is billed or limited by Puter; access isn’t universally free.</p><p><strong>Chat or build.</strong> Switch modes in the composer. Build mode creates HTML apps, files, and task lists. Model capabilities vary.</p><p><strong>Safe previews.</strong> Apps run in an isolated iframe with network access blocked. This is an artifact harness, not a full terminal or deployment service.</p><p><strong>Local history.</strong> Conversations and checkpoints are stored in this browser under your Puter username, not synced across devices. Avoid shared devices for sensitive chats.</p><div className="help-links"><a href="https://docs.puter.com/AI/chat/" target="_blank" rel="noreferrer">Puter documentation ↗</a><a href="https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents" target="_blank" rel="noreferrer">Harness patterns ↗</a></div><Link className="saved-workspace-link" to="/dashboard">Open your protected workspace <ArrowRight size={14} /></Link></div></DialogContent></Dialog>
  </div>;
}
