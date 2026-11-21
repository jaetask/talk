import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { persona } from "./apps/skills.ts";
import {
  TalkChat,
  TalkIndex,
  TalkRedactions,
  type ChatRow,
  type ChatState,
  type IndexState,
  type RedactionState,
} from "./chat.ts";
import type { Engine } from "./engine.ts";
import { caseOf, exportLines, messagesOf, timelineOf, turnsOf, type AgentLook } from "./views.ts";

export const AGENT_COLORS = [
  "#d97757",
  "#5b8def",
  "#34c47c",
  "#a78bfa",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];
const SEED_COLORS: Record<string, string> = {
  cooper: "#d97757",
  maddy: "#ec4899",
  heart: "#5b8def",
};

export class Chats {
  constructor(private readonly engine: Engine) {}

  private async entries(
    sid: string,
  ): Promise<{ entries: EntryRecord[]; chat: ChatState; redactions: RedactionState } | undefined> {
    const conv = await this.engine.conversationOf(sid);
    if (!conv) return undefined;
    const entries: EntryRecord[] = [];
    for (let cursor: unknown; ; ) {
      const page = await conv.entries({ order: "ascending" } as never, 500, cursor as never, ctx);
      entries.push(...page.items);
      cursor = (page as { next?: unknown }).next;
      if (!cursor || !page.items.length) break;
    }
    const chat = (await this.engine.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState;
    const redactions = ((await this.engine.harness.snapshot(TalkRedactions, conv.id, ctx)) as
      | RedactionState
      | undefined) ?? { turns: {}, clearedAt: null, clearedBefore: 0 };
    return { entries, chat, redactions };
  }

  async looks(): Promise<{ [id: string]: AgentLook }> {
    const out: { [id: string]: AgentLook } = { heart: { name: "Heart", color: SEED_COLORS.heart } };
    for (const [i, a] of (await this.engine.agents.list()).entries())
      out[a.id] = {
        name: a.name,
        color: SEED_COLORS[a.id] ?? AGENT_COLORS[(i + 3) % AGENT_COLORS.length],
      };
    return out;
  }

  async timeline(sid: string) {
    const got = await this.entries(sid);
    if (!got) return undefined;
    const note = `${persona(got.chat.persona)}\n\n(Plus the conduct and write rules, the app list and each app's skill, added by the engine as prompt sections.)`;
    return timelineOf(got.chat, got.entries, await this.looks(), note, got.redactions);
  }

  async messages(sid: string) {
    const got = await this.entries(sid);
    return got ? messagesOf(turnsOf(got.entries, got.redactions)) : undefined;
  }

  async export(sid: string): Promise<string | undefined> {
    const timeline = await this.timeline(sid);
    return timeline ? exportLines(timeline) : undefined;
  }

  async draftCase(turnId: number, kind: "golden" | "regression", note = "") {
    for (const sid of Object.keys((await this.index()).chats)) {
      const got = await this.entries(sid);
      if (!got) continue;
      const draft = caseOf(
        turnsOf(got.entries, got.redactions),
        turnId,
        kind,
        await this.looks(),
        note,
      );
      if (draft) return draft;
    }
    return undefined;
  }

  async turns(sid: string) {
    const got = await this.entries(sid);
    return got ? { turns: turnsOf(got.entries, got.redactions), chat: got.chat } : undefined;
  }
  async row(sid: string): Promise<ChatRow | undefined> {
    return (await this.index()).chats[sid];
  }

  private async index() {
    const index = (await this.engine.harness.snapshot(TalkIndex, ctx)) as
      | Partial<IndexState>
      | undefined;
    return {
      chats: index?.chats ?? {},
      viewed: index?.viewed ?? {},
      settings: index?.settings ?? {},
    };
  }

  async list(options: { agent?: string; tests?: boolean; q?: string; limit?: number } = {}) {
    const words = (options.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const rows = Object.entries((await this.index()).chats)
      .filter(([sid, c]) => c.turns > 0 && !sid.includes("/"))
      .filter(([, c]) => !options.agent || c.agent === options.agent)
      .filter(([, c]) => (options.tests ? c.test : !c.test || c.pinnedAt))
      .filter(([, c]) =>
        words.every((w) => `${c.title} ${c.first ?? ""} ${c.last ?? ""}`.toLowerCase().includes(w)),
      )
      .sort(([, a], [, b]) => (b.lastAt ?? b.createdAt) - (a.lastAt ?? a.createdAt));
    return rows.slice(0, options.limit ?? 500).map(([sid, c]) => row(sid, c));
  }

  async pinned() {
    return Object.entries((await this.index()).chats)
      .filter(([, c]) => c.pinnedAt)
      .sort(([, a], [, b]) => (a.pinnedAt ?? 0) - (b.pinnedAt ?? 0))
      .map(([sid, c]) => ({
        id: sid,
        agent_id: c.agent,
        pinned_at: new Date(c.pinnedAt!).toISOString(),
        title: c.title || null,
        first: c.first || null,
      }));
  }

  private async change(sid: string, change: (row: ChatRow) => void): Promise<boolean> {
    return this.engine.harness.commit(async (tx) => {
      const row = (await tx.doc(TalkIndex)).chats[sid];
      if (!row) return false;
      change(row);
      return true;
    }, ctx);
  }
  pin(sid: string, pinned: boolean) {
    return this.change(sid, (r) => {
      r.pinnedAt = pinned ? Date.now() : null;
    });
  }
  rename(sid: string, title: string) {
    return this.change(sid, (r) => {
      r.title = title.trim().slice(0, 120);
    });
  }

  async last(agent: string) {
    const index = await this.index();
    const newest = Object.entries(index.chats)
      .filter(([, c]) => c.agent === agent && c.last && !c.test)
      .sort(([, a], [, b]) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0];
    if (!newest) return { last: null, unread: false };
    const [sid, c] = newest;
    return {
      last: { text: c.last!, at: new Date(c.lastAt!).toISOString(), session_id: sid },
      unread: (c.lastAt ?? 0) > (index.viewed[agent] ?? 0),
    };
  }
  async viewed(agent: string): Promise<void> {
    await this.engine.harness.commit(async (tx) => {
      const doc = await tx.doc(TalkIndex);
      doc.viewed ??= {};
      doc.viewed[agent] = Date.now();
    }, ctx);
  }

  async setting<T>(key: string, fallback: T): Promise<T> {
    return ((await this.index()).settings[key] as T | undefined) ?? fallback;
  }
  async saveSetting(key: string, value: unknown): Promise<void> {
    await this.engine.harness.commit(async (tx) => {
      const doc = await tx.doc(TalkIndex);
      doc.settings ??= {};
      doc.settings[key] = value as never;
    }, ctx);
  }

  async redactTurn(turnId: number): Promise<boolean> {
    for (const sid of Object.keys((await this.index()).chats)) {
      const got = await this.entries(sid);
      if (
        !got?.entries.some((e) => (e.id as unknown as number) === turnId && e.kind === "talk.turn")
      )
        continue;
      const conv = (await this.engine.conversationOf(sid))!;
      await this.engine.harness.commit(async (tx) => {
        (await tx.doc(TalkRedactions, conv.id)).turns[String(turnId)] = new Date().toISOString();
      }, ctx);
      return true;
    }
    return false;
  }

  async clear(sid: string): Promise<boolean> {
    const conv = await this.engine.conversationOf(sid);
    if (!conv) return false;
    await conv.reset(undefined, ctx);
    const newest =
      ((await conv.entries({ order: "descending" } as never, 1, undefined, ctx)).items[0]
        ?.id as unknown as number) ?? 0;
    await this.engine.harness.commit(async (tx) => {
      const doc = await tx.doc(TalkRedactions, conv.id);
      doc.clearedAt = new Date().toISOString();
      doc.clearedBefore = newest;
      const chat = await tx.doc(TalkChat, conv.id);
      chat.seen = [] as never;
      chat.pretendLog = [] as never;
      const row = (await tx.doc(TalkIndex)).chats[sid];
      if (row) {
        row.first = "";
        row.last = "";
      }
    }, ctx);
    return true;
  }
}

const row = (sid: string, c: ChatRow) => ({
  id: sid,
  agent_id: c.agent,
  first: c.title || c.first || null,
  title: c.title || null,
  last_at: c.lastAt ? new Date(c.lastAt).toISOString() : null,
  started_at: new Date(c.createdAt).toISOString(),
  turns: c.turns,
  pinned_at: c.pinnedAt ? new Date(c.pinnedAt).toISOString() : null,
  test: c.test ? 1 : 0,
});
