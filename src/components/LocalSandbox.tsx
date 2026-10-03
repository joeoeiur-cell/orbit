import { useState } from "react";
import { AlertCircle, FileCode2, Loader2, Play, ShieldCheck, Square, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artifact } from "@/lib/puter";
import type { LocalResult } from "@/lib/localRuntime";

export default function LocalSandbox({ files, enabled, onEnabled, busy, running, result, onRun, onStop }: {
  files: Artifact[]; enabled: boolean; onEnabled: (value: boolean) => void;
  busy: boolean; running: boolean; result?: LocalResult;
  onRun: (code: string) => void; onStop: () => void;
}) {
  const [code, setCode] = useState('from pathlib import Path\nimport json\n\nfiles = [str(p) for p in Path(".").rglob("*") if p.is_file()]\nprint("Project files:", files)\nPath("hello.txt").write_text("Created with local Python", encoding="utf-8")\nprint(Path("hello.txt").read_text())');
  return <div className="panel-content local-panel">
    <div className="local-heading"><span className="vm-emblem"><Terminal size={21} /></span><div><strong>Your pocket computer</strong><p>Python · runs on your device</p></div><span className="local-badge">NO KEYS</span></div>
    <div className="local-features"><span><ShieldCheck size={13} /> Separate chat workspace</span><span><FileCode2 size={13} /> {files.length} saved files</span></div>
    <div className="local-intro"><h3>A little lab. All yours.</h3><p>Read files, crunch numbers, and create something new. No cloud sandbox account or compute bill. Python loads only when you run it.</p></div>
    <label className="local-permission"><input type="checkbox" aria-label="Allow AI local Python execution" checked={enabled} disabled={busy || running} onChange={e => onEnabled(e.target.checked)} /><span><strong>Let AI run Python in Build mode</strong><small>Up to 3 steps per message. Files and results go to your selected Puter model. Follow-up model requests may use account credits. Only this chat’s project files are supplied.</small></span></label>
    <form className="local-editor" onSubmit={e => { e.preventDefault(); onRun(code); }}><label htmlFor="local-python-code">Try Python yourself</label><textarea id="local-python-code" aria-label="Local Python code" spellCheck={false} value={code} disabled={busy || running} onChange={e => setCode(e.target.value)} maxLength={20000} rows={9} /><div>{running ? <Button type="button" variant="outline" onClick={onStop}><Square size={13} /> Stop local execution</Button> : <Button type="submit" disabled={busy || !code.trim()}><Play size={13} /> Run Python</Button>}<span>15s per run · standard library</span></div></form>
    {running && <p className="local-working" role="status"><Loader2 size={14} className="animate-spin" /> Loading Python or running code…</p>}
    <div className="local-output"><div><Terminal size={13} /> Execution output</div><pre aria-label="Local Python output" aria-live="polite">{result?.output || (result ? "(No output)" : "Ready when you are. Your files are available in the working folder.")}</pre>{result?.error && <p role="alert"><AlertCircle size={14} /> {result.error}</p>}{result && !result.error && <small>Finished · {result.files.length} text files returned to this chat</small>}</div>
    <div className="safety-note"><ShieldCheck size={15} /><p>Network blocked. No access to Orbit cookies, sign-in, or other chats. This is not a Linux VM: no pip, shell, or background servers. Large jobs use your device’s RAM and battery. Python variables reset after each run to release memory; saved project files remain.</p></div>
    <p className="local-limits">40 UTF-8 text files · 500 KB total · 20,000 output characters. Files save in this browser, not across devices. Download important work; blocked or full storage cannot retain it.</p>
  </div>;
}
