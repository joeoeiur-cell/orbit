import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "orbit-theme";
const CHANGE_EVENT = "orbit-theme-change";

function notify() { try { window.dispatchEvent(new Event(CHANGE_EVENT)); } catch { /* No listeners yet. */ } }
function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  window.addEventListener("focus", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener("focus", listener);
  };
}
export function currentTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* Storage can be blocked; the document class is the fallback. */ }
  try { return document.documentElement.classList.contains("dark") ? "dark" : "light"; } catch { return "light"; }
}
export function applyTheme(theme: Theme) {
  try {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* Keep the visual switch even when the preference cannot be saved. */ }
  notify();
}
export function applySavedTheme() { applyTheme(currentTheme()); }
export function useOrbitTheme() { return useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme); }
