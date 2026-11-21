import type { Bot, LiveState, Row, Skill, Task, Toolkit } from "../types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v2${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type BotPatch = Partial<
  Pick<
    Bot,
    | "name"
    | "label"
    | "description"
    | "instructions"
    | "avatarShape"
    | "avatarColor"
    | "mode"
    | "voice"
    | "voiceSpeed"
    | "voiceLanguage"
  >
>;

export type Conversation = {
  id: string;
  first: string;
  at: number;
  turns: number;
  current: boolean;
};

export const api = {
  bots: () => req<{ bots: Bot[]; live: LiveState[] }>("GET", "/bots"),
  createBot: (b: Pick<Bot, "name" | "avatarShape" | "avatarColor" | "mode">) =>
    req<{ bot: Bot }>("POST", "/bots", b),
  updateBot: (botId: string, p: BotPatch) => req<{ bot: Bot }>("PATCH", `/bots/${botId}`, p),
  deleteBot: (botId: string) => req<{ ok: true }>("DELETE", `/bots/${botId}`),
  makePrimary: (botId: string) => req<{ ok: true }>("POST", `/bots/${botId}/primary`),
  markRead: (id: string) => req<{ ok: true }>("POST", `/bots/${id}/read`),
  rows: (id: string) => req<{ generation: number; rows: Row[] }>("GET", `/bots/${id}/rows`),
  send: (id: string, text: string) => req<{ row: Row }>("POST", `/bots/${id}/messages`, { text }),
  interrupt: (id: string) => req<{ ok: true }>("POST", `/bots/${id}/interrupt`),
  fresh: (id: string) => req<{ ok: true }>("POST", `/bots/${id}/fresh`),
  conversations: (id: string) =>
    req<{ conversations: Conversation[] }>("GET", `/bots/${id}/conversations`),
  openConversation: (id: string, conversation: string) =>
    req<{ ok: true }>("POST", `/bots/${id}/conversations/${encodeURIComponent(conversation)}`),
  approve: (approvalId: string, decision: "allow" | "deny") =>
    req<{ ok: true }>("POST", `/approvals/${approvalId}`, { decision }),
  skills: (botId: string) => req<{ skills: Skill[] }>("GET", `/bots/${botId}/settings`),
  tasks: () => req<{ tasks: Task[] }>("GET", "/tasks"),
  botTasks: (botId: string) => req<{ tasks: Task[] }>("GET", `/bots/${botId}/tasks`),
  apps: () => req<{ apps: Toolkit[] }>("GET", "/apps"),
  redactTurn: (botId: string, turnId: number) =>
    req<{ ok: true }>("POST", `/bots/${botId}/turns/${turnId}/redact`),
};
