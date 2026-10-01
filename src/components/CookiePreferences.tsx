import { useEffect, useState } from "react";
import { Cookie, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCookieChoice, useCookieChoice } from "@/lib/browserCookies";

export default function CookiePreferences() {
  const choice = useCookieChoice();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const open = () => setEditing(true);
    window.addEventListener("orbit-cookie-settings", open);
    return () => window.removeEventListener("orbit-cookie-settings", open);
  }, []);
  const choose = (value: "accepted" | "declined") => {
    const stored = setCookieChoice(value);
    setEditing(false);
    setNotice(stored ? "" : "Your browser blocked cookies. Your choice applies for this visit; keys remain session-only if they cannot be saved.");
  };
  return <>
    {choice === "unset" || editing ? <section className="cookie-banner" role="region" aria-label="Cookie preferences" aria-describedby="cookie-explanation">
      <div className="cookie-emblem"><Cookie size={23} /></div>
      <div className="cookie-copy"><span className="cookie-eyebrow">YOUR BROWSER. YOUR CHOICE.</span><h2>Remember your connection?</h2>
        <p id="cookie-explanation">Accept to let Orbit save the Daytona API key you enter in a browser cookie for 7 days. Decline to use it only while the sandbox panel stays open.</p>
        <p className="cookie-caution"><ShieldCheck size={14} /> The key cookie is readable by this site’s scripts, not HttpOnly. Avoid this on shared devices. You can remove it anytime. No advertising cookies are added.</p>
        <small>A separate essential cookie remembers your choice for a year. Sign-in and existing local chat history are unchanged.</small>
      </div>
      <div className="cookie-actions"><Button variant="outline" onClick={() => choose("accepted")}>Accept cookies</Button><Button variant="outline" onClick={() => choose("declined")}>Decline cookies</Button>{editing && choice !== "unset" && <button className="cookie-cancel" onClick={() => setEditing(false)}>Cancel</button>}</div>
    </section> : <button className="cookie-settings-button" aria-label="Cookie settings" onClick={() => setEditing(true)}><Cookie size={14} /> Cookie settings</button>}
    {notice && <p className="cookie-notice" role="status">{notice}</p>}
  </>;
}
