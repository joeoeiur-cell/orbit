import { useSyncExternalStore } from "react";
import { validateDaytonaKey } from "./sandbox";

export type CookieChoice = "accepted" | "declined" | "unset";
const CONSENT_COOKIE = "__Host-orbit-cookie-choice";
const KEY_PREFIX = "__Host-orbit-daytona-";
const CHANGE_EVENT = "orbit-cookie-change";
const WEEK_SECONDS = 7 * 24 * 60 * 60;
let sessionChoice: CookieChoice = "unset";

function readCookie(name: string): string {
  try {
    const entry = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
  } catch { return ""; }
}
function writeCookie(name: string, value: string, maxAge: number) {
  // No Domain attribute: cookies belong only to this exact host. HTTPS is required.
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; Secure; SameSite=Strict`;
}
function keyCookie(userId: string) { return `${KEY_PREFIX}${encodeURIComponent(userId)}`; }
function notify() { window.dispatchEvent(new Event(CHANGE_EVENT)); }
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", listener);
  const timer = window.setInterval(listener, 30000);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", listener);
  };
}
export function cookieChoice(): CookieChoice {
  const saved = readCookie(CONSENT_COOKIE);
  return saved === "accepted" || saved === "declined" ? saved : sessionChoice;
}
export function setCookieChoice(choice: "accepted" | "declined"): boolean {
  sessionChoice = choice;
  try {
    if (choice === "declined") {
      for (const part of document.cookie.split(";")) {
        const name = part.trim().split("=")[0];
        if (name.startsWith(KEY_PREFIX)) writeCookie(name, "", 0);
      }
    }
    // This essential cookie records a choice, including Decline; it stores no key.
    writeCookie(CONSENT_COOKIE, choice, 365 * 24 * 60 * 60);
  } catch { /* The choice still applies for this page if the browser blocks cookies. */ }
  const stored = readCookie(CONSENT_COOKIE) === choice;
  if (stored) sessionChoice = "unset";
  notify();
  return stored;
}
export function rememberedDaytonaKey(userId: string): string {
  if (!userId || cookieChoice() !== "accepted") return "";
  const saved = readCookie(keyCookie(userId));
  if (!saved) return "";
  try { return validateDaytonaKey(saved); } catch { return ""; }
}
export function rememberDaytonaKey(userId: string, key: string): boolean {
  if (!userId || cookieChoice() !== "accepted" || window.location.protocol !== "https:") return false;
  const valid = validateDaytonaKey(key);
  try { writeCookie(keyCookie(userId), valid, WEEK_SECONDS); } catch { return false; }
  notify();
  return rememberedDaytonaKey(userId) === valid;
}
export function forgetDaytonaKey(userId: string) {
  try { writeCookie(keyCookie(userId), "", 0); } catch { /* Best effort when cookies are blocked. */ }
  notify();
}
export function useCookieChoice() {
  return useSyncExternalStore(subscribe, cookieChoice, () => "unset" as CookieChoice);
}
export function useRememberedDaytonaKey(userId: string) {
  return useSyncExternalStore(subscribe, () => rememberedDaytonaKey(userId), () => "");
}
export function openCookiePreferences() { window.dispatchEvent(new Event("orbit-cookie-settings")); }
