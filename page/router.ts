import { useEffect, useState } from "react";

export type Route =
  | { page: "chat"; botId: string | null }
  | { page: "trajectory"; botId: string }
  | { page: "bot"; botId: string }
  | { page: "new-bot" }
  | { page: "tasks" }
  | { page: "settings"; section: string };

export const hashPath = () => window.location.hash.replace(/^#/, "") || "/";

export function parse(path: string): Route {
  const [, a, b, c] = path.split("?")[0]?.split("/") ?? [];
  if (a === "tasks") return { page: "tasks" };
  if (a === "settings") return { page: "settings", section: b || "general" };
  if (a === "bots" && b === "new") return { page: "new-bot" };
  if (a === "bots" && b) {
    if (c === "trajectory") return { page: "trajectory", botId: b };
    if (c === "settings") return { page: "bot", botId: b };
    return { page: "chat", botId: b };
  }
  return { page: "chat", botId: null };
}

export function usePath(): string {
  const [path, setPath] = useState(hashPath);
  useEffect(() => {
    const on = () => setPath(hashPath());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return path;
}

export const go = (path: string) => {
  window.location.hash = path;
};

export const botPath = (botId: string) => `/bots/${encodeURIComponent(botId)}`;
