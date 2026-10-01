import { Moon, Sun } from "lucide-react";
// Self-contained: applies the theme class directly so a click always switches visually.
import { applyTheme, useOrbitTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const theme = useOrbitTheme();
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return <button type="button" className="icon-button theme-toggle" aria-label={label} aria-pressed={dark} title={label} onClick={() => applyTheme(dark ? "light" : "dark")}>
    {dark ? <Sun size={18} /> : <Moon size={18} />}
  </button>;
}
