import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AlertCircle, ArrowRight, Download, ExternalLink, Loader2, Play, RefreshCw, Server, ShieldCheck, Terminal, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorText, type Artifact } from "@/lib/puter";

export default function CloudSandbox(props: { projectId: string; files: Artifact[]; onImport: (file: Artifact) => void }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) return <div className="panel-empty"><Loader2 className="animate-spin" /><p>Checking workspace sign-in…</p></div>;
  if (!isAuthenticated) return <div className="panel-empty vm-signin"><Server size={32} /><h3>A real computer for your ideas.</h3><p>Cloud execution requires an Orbit workspace sign-in, separate from your Puter connection.</p><Link className="vm-auth-link" to="/auth?returnTo=%2Fdashboard%3Fpanel%3Dvm">Sign in to your workspace <ArrowRight size={14} /></Link></div>;
  return <SandboxControls {...props} />;
}
function SandboxControls({ projectId, files, onImport }: { projectId: string; files: Artifact[]; onImport: (file: Artifact) => void }) {
  const sandbox = useQuery(api.sandboxes.current, { projectId });
  const configuration = useAction(api.daytona.configuration);
  const create = useAction(api.daytona.create);
  const execute = useAction(api.daytona.execute);
  const sync = useAction(api.daytona.syncFiles);
  const read = useAction(api.daytona.readFile);
  const preview = useAction(api.daytona.preview);
  const remove = useAction(api.daytona.remove);
  const [configured, setConfigured] = useState<boolean>();
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [path, setPath] = useState("index.html");
  const [port, setPort] = useState("3000");
  const [previewUrl, setPreviewUrl] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const checkConfiguration = async () => {
    setError("");
    try { const result = await configuration({}); if (mounted.current) setConfigured(result.configured); }
    catch (e) { if (mounted.current) setError(errorText(e)); }
  };
  useEffect(() => { void checkConfiguration(); }, []);
  const expired = Boolean(sandbox && sandbox.expiresAt <= now);
  const live = sandbox?.status === "running" && !expired;
  const creating = sandbox?.status === "creating" && !expired;
  const deleting = sandbox?.status === "deleting" && !expired;
  const addLog = (text: string) => setLogs(previous => [...previous.slice(-19), text.slice(0, 60000)]);
  const perform = async (name: string, fn: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true; setPending(name); setError("");
    try { await fn(); }
    catch (e) { if (mounted.current) setError(errorText(e)); }
    finally { operation.current = false; if (mounted.current) setPending(""); }
  };
  const minutes = sandbox ? Math.max(0, Math.ceil((sandbox.expiresAt - now) / 1000)) : 0;
  return <div className="panel-content vm-panel">
    <div className="vm-heading"><span className="vm-emblem"><Server size={21} /></span><div><strong>Cloud sandbox</strong><p>Linux execution · powered by Daytona</p></div><span className={`vm-status ${live ? "live" : ""}`}>{live ? "Running" : creating ? "Starting" : deleting ? "Deleting" : expired ? "Expired" : "Offline"}</span></div>
    <div className="vm-specs"><span><ShieldCheck size={12} /> Network blocked</span><span>5-minute lifetime</span><span>One sandbox per user</span></div>
    {error && <div className="connection-error" role="alert"><AlertCircle size={15} /><p>{error}</p></div>}
    {configured === false && <div className="vm-setup"><strong>Connect Daytona first</strong><p>Add <code>DAYTONA_API_KEY</code> in the project’s Keys tab. Standard Daytona Cloud uses the SDK’s default API URL. Only set <code>DAYTONA_SERVER_URL</code> if your account uses a custom endpoint.</p><p>Daytona advertises a no-card trial. Usage is metered; higher tiers require payment. Do not upgrade or enable top-ups unless you want them.</p><a href="https://www.daytona.io/pricing" target="_blank" rel="noreferrer">Review pricing <ExternalLink size={12} /></a><Button variant="outline" onClick={() => void checkConfiguration()}><RefreshCw size={13} /> Check configuration</Button></div>}
    {!live && !creating && !deleting && <div className="vm-start-card"><Terminal size={26} /><h3>From code to execution.</h3><p>Start an isolated Linux sandbox to run commands and test your project. Nothing runs automatically.</p><label className="vm-consent"><input type="checkbox" aria-label="Confirm Daytona compute usage" checked={consent} disabled={Boolean(pending)} onChange={e => setConsent(e.target.checked)} /><span>I understand this uses the project’s Daytona credits and may incur charges if paid billing is enabled. The sandbox and its files are deleted after five minutes or when I delete it.</span></label><Button disabled={!consent || !configured || Boolean(pending) || sandbox === undefined} onClick={() => void perform("Starting sandbox", async () => { setConsent(false); await create({ projectId, consent: true }); if (mounted.current) { setLogs([]); setPreviewUrl(""); addLog("Sandbox started. No commands have been executed. Files must be synced explicitly."); } })}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start cloud sandbox</Button></div>}
    {(live || creating || deleting) && <div className="vm-session"><div><span>{live ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")} remaining` : creating ? "Creating isolated environment…" : "Deletion requested…"}</span>{sandbox?.workDir && <code>{sandbox.workDir}</code>}</div>{sandbox?.status !== "creating" && <button aria-label="Delete cloud sandbox" disabled={Boolean(pending)} onClick={() => void perform("Deleting sandbox", async () => { await remove({ id: sandbox!.id }); if (mounted.current) { setPreviewUrl(""); addLog("Sandbox deleted. Exported files remain in Orbit."); } })}><Trash2 size={13} /> Delete now</button>}</div>}
    {live && <>
      <div className="vm-file-controls"><Button variant="outline" disabled={!files.length || Boolean(pending)} onClick={() => void perform("Syncing files", async () => { const result = await sync({ id: sandbox!.id, files }); if (mounted.current) addLog(`Synced ${result.count} files to the project directory. Existing files with matching paths were overwritten.`); })}><Upload size={13} /> Sync {files.length} project files</Button><p>Explicit sync overwrites matching paths. No shell command is run.</p><form onSubmit={e => { e.preventDefault(); void perform("Importing file", async () => { const file = await read({ id: sandbox!.id, name: path }); if (mounted.current) { onImport(file); addLog(`Imported ${file.name} into Orbit and saved a checkpoint.`); } }); }}><input aria-label="Sandbox file path" placeholder="Relative path to import" value={path} onChange={e => setPath(e.target.value)} /><button aria-label="Import sandbox file" disabled={!path.trim() || Boolean(pending)}><Download size={14} /></button></form></div>
      <div className="vm-terminal"><div className="vm-terminal-title"><Terminal size={13} /> Command runner <span>25s limit · not an interactive shell</span></div><pre aria-label="Sandbox command output" aria-live="polite">{logs.length ? logs.join("\n\n") : "No command output yet."}</pre><form onSubmit={e => { e.preventDefault(); const snapshot = command.trim(); if (!snapshot) return; void perform("Running command", async () => { addLog(`$ ${snapshot}`); const result = await execute({ id: sandbox!.id, command: snapshot }); if (mounted.current) { addLog(`${result.output || "(no output)"}\n[exit ${result.exitCode}]`); setCommand(""); } }); }}><span>$</span><input aria-label="Sandbox command" autoComplete="off" spellCheck={false} placeholder="node --version" value={command} onChange={e => setCommand(e.target.value)} maxLength={4000} /><button aria-label="Run sandbox command" disabled={!command.trim() || Boolean(pending)}>{pending === "Running command" ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}</button></form></div>
      <form className="vm-preview-control" onSubmit={e => { e.preventDefault(); void perform("Getting preview link", async () => { const result = await preview({ id: sandbox!.id, port: Number(port) }); if (mounted.current) { setPreviewUrl(result.url); addLog("Private preview link created. Link expires in 60 seconds; sandbox expiry still applies."); } }); }}><label htmlFor="sandbox-port">Preview port</label><input id="sandbox-port" type="number" min={1024} max={65535} value={port} onChange={e => setPort(e.target.value)} /><button disabled={Boolean(pending)}><ExternalLink size={13} /> Get link</button></form>
      {previewUrl && <a className="vm-preview-link" href={previewUrl} target="_blank" rel="noopener noreferrer">Open sandbox preview <ExternalLink size={13} /></a>}
      <p className="vm-footnote">Start a server yourself before opening a port. Commands start in the project folder; shell state is not carried between calls. Outbound internet is blocked, so package downloads will fail. No app keys are copied into the sandbox.</p>
    </>}
    {pending && <div className="vm-working" role="status"><Loader2 size={13} className="animate-spin" /> {pending}…</div>}
    <div className="safety-note"><ShieldCheck size={15} /><p>The cloud session is disposable. Import files before expiry to keep changes. Closing this panel does not immediately stop billing; use Delete now or the automatic five-minute expiry.</p></div>
  </div>;
}
