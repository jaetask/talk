import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "talk.theme";

export const readTheme = (): Theme => {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

const darkQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

export function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && !!darkQuery?.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function saveTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  applyTheme(t);
  window.dispatchEvent(new Event("talk:theme"));
}

export function useTheme(): Theme {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const on = () => setTheme(readTheme());
    window.addEventListener("talk:theme", on);
    return () => window.removeEventListener("talk:theme", on);
  }, []);
  return theme;
}

applyTheme(readTheme());
darkQuery?.addEventListener?.("change", () => {
  if (readTheme() === "system") applyTheme("system");
});
