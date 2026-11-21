import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SttProvider, TtsProvider } from "../packages/pi-voice/src/index.ts";
import type { Agent } from "./agents.ts";
import type { Card } from "./apps/cards.ts";
import type { JsonObject } from "./apps/classify.ts";
import { YES } from "./apps/gate.ts";
import { readSkill, skillNames } from "./apps/skills.ts";
import type { ChatState } from "./chat.ts";
import { NUM_CTX } from "./config.ts";
import type { ChatConfig, Engine, TurnNotice } from "./engine.ts";
import type { Chats } from "./store.ts";
import type { TurnView } from "./views.ts";
import { DEFAULT_SPEED, pronunciations } from "./voice.ts";

export type Bot = {
  id: string;
  name: string;
  label: string;
  description: string;
  instructions: string;
  avatarShape: string;
  avatarColor: string;
  mode: "personal" | "teammate";
  isPrimary: boolean;
  kind: "agent";
  pinned: boolean;
  effort: "medium";
  voice: string;
  voiceSpeed: number;
  voiceLanguage: string;
  generation: number;
  unread: number;
  lastPreview: string | null;
  lastActivityAt: number;
  createdAt: number;
};
export type RowBody =
  | {
      type: "message";
      role: "user" | "assistant";
      text: string;
      streaming?: boolean;
      from?: { kind: "voice"; id: string; name: string };
    }
  | {
      type: "tool-call";
      callId: string;
      name: string;
      label: string;
      status: "running" | "done" | "error" | "awaiting-approval" | "denied";
      args?: unknown;
      summary?: string;
    }
  | {
      type: "card";
      card: "approval";
      approvalId: string;
      title: string;
      detail: string;
      tool: string;
      toolkit?: string;
      args: unknown;
      status: "pending" | "allowed" | "denied" | "expired";
    }
  | { type: "card"; card: "tool"; data: Card }
  | { type: "notice"; text: string; tone?: "info" | "warn" | "error" };
export type Row = {
  botId: string;
  generation: number;
  seq: number;
  updatedSeq: number;
  kind: "message" | "tool-call" | "card" | "event" | "notice";
  body: RowBody;
  createdAt: number;
};
export type LiveState = {
  botId: string;
  isRunning: boolean;
  activity: { kind: string; detail?: string; since: number } | null;
  awaiting: { reason: string; since: number } | null;
  startedAt: number | null;
};

type Extra = {
  sid: string;
  generation: number;
  shape: string;
  color: string;
  readAt: number;
  speed: number;
  createdAt: number;
  label?: string;
};
type Extras = { [agent: string]: Extra };

const SHAPES = [
  "blob",
  "cloud",
  "square",
  "sparkle",
  "clover",
  "heart",
  "flower",
  "teardrop",
  "tablet",
  "wedge",
  "house",
  "star",
  "hex",
];
const COLORS = [
  "orange",
  "magenta",
  "blue",
  "green",
  "violet",
  "cyan",
  "red",
  "yellow",
  "brown",
  "gray",
  "black",
];
const LOOKS: Record<string, [string, string]> = {
  cooper: ["blob", "orange"],
  maddy: ["flower", "magenta"],
};
const VOICES = [
  ["af_heart", "Heart"],
  ["af_bella", "Bella"],
  ["af_nicole", "Nicole"],
  ["af_sarah", "Sarah"],
  ["am_adam", "Adam"],
  ["am_michael", "Michael"],
  ["bf_emma", "Emma"],
  ["bm_george", "George"],
];
function voices(): { id: string; name: string }[] {
  try {
    const snapshots = join(
      homedir(),
      ".cache/huggingface/hub/models--mlx-community--Kokoro-82M-bf16/snapshots",
    );
    const found = new Set<string>();
    for (const snap of readdirSync(snapshots))
      for (const f of readdirSync(join(snapshots, snap, "voices")))
        if (/^[ab][fm]_\w+\.safetensors$/.test(f)) found.add(f.replace(".safetensors", ""));
    if (found.size)
      return [...found].sort().map((id) => ({
        id,
        name: `${id.slice(3, 4).toUpperCase()}${id.slice(4)} (${id.startsWith("a") ? "US" : "UK"}, ${id[1] === "f" ? "f" : "m"})`,
      }));
  } catch {}
  return VOICES.map(([id, name]) => ({ id, name }));
}
const PAINT: Record<string, string> = {
  black: "#6E6E6E",
  white: "#959595",
  brown: "#A06B39",
  red: "#FB2B3E",
  orange: "#FD690F",
  yellow: "#F59312",
  green: "#14C16F",
  cyan: "#13B7A2",
  blue: "#1E86FC",
  violet: "#8F59F9",
  magenta: "#F93498",
  gray: "#959595",
};
const paint = (color: string): string => PAINT[color] ?? "#959595";
const SPEEDS = [0.8, 0.9, 0.94, 1, 1.1, 1.2, 1.3];

const BLOCK = 1000;
const SAID = 0;
const CALL = 10;
const ERROR = 980;
const ASK = 990;
const REPLY = 999;
const blockOf = (turnIndex: number): number => (turnIndex + 1) * BLOCK;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });
const hash = (s: string): number => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const plain = (label: string): string => label.replace(/^🔧\s*/, "");

export type BotsOptions = {
  engine: Engine;
  chats: Chats;
  config: (agent: string) => ChatConfig;
  tts: (provider?: string) => TtsProvider;
  stt: () => SttProvider;
  casesDir?: string;
  voices?: () => { id: string; name: string }[];
  base?: string;
};

export function createBots(o: BotsOptions) {
  const { engine, chats } = o;
  const registry = engine.options.registry;
  const base = o.base ?? "/api/v2";

  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const emit = (event: unknown): void => {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    for (const c of clients) {
      try {
        c.enqueue(chunk);
      } catch {
        clients.delete(c);
      }
    }
  };
  const ping = setInterval(() => emit({ type: "ping" }), 20_000);

  let rev = 0;
  const nextRev = (): number => (rev = Math.max(rev + 1, Date.now()));

  let cache: Extras | undefined;
  const extras = async (): Promise<Extras> => {
    const agents = await engine.agents.list();
    cache ??= { ...(await chats.setting<Extras>("bots", {})) };
    const saved = cache;
    let changed = false;
    for (const [i, a] of agents.entries()) {
      if (saved[a.id]) continue;
      const [shape, color] = LOOKS[a.id] ?? [
        SHAPES[hash(a.id) % SHAPES.length],
        COLORS[(hash(a.id) + i) % COLORS.length],
      ];
      saved[a.id] = {
        sid: `${a.id}-${crypto.randomUUID()}`,
        generation: 1,
        shape,
        color,
        readAt: 0,
        speed: DEFAULT_SPEED,
        createdAt: Date.now(),
      };
      changed = true;
    }
    if (changed) await chats.saveSetting("bots", saved);
    return saved;
  };
  const saveExtra = async (agent: string, change: Partial<Extra>): Promise<Extra> => {
    const all = await extras();
    all[agent] = { ...all[agent], ...change };
    await chats.saveSetting("bots", all);
    return all[agent];
  };
  const primaryId = async (agents: Agent[]): Promise<string> => {
    const saved = await chats.setting("primaryBot", "cooper");
    return agents.some((a) => a.id === saved) ? saved : (agents[0]?.id ?? "");
  };
  const botOf = async (a: Agent, x: Extra, primary: string): Promise<Bot> => {
    const row = (await chats.row(x.sid)) ?? undefined;
    const lastAt = row?.lastAt ?? 0;
    return {
      id: a.id,
      name: a.name,
      label: x.label ?? "",
      description: a.about,
      instructions: a.instructions,
      avatarShape: x.shape,
      avatarColor: x.color,
      mode: "personal",
      isPrimary: a.id === primary,
      kind: "agent",
      pinned: false,
      effort: "medium",
      voice: a.voice,
      voiceSpeed: x.speed,
      voiceLanguage: "en",
      generation: x.generation,
      unread: lastAt > x.readAt && row?.last ? 1 : 0,
      lastPreview: row?.last || null,
      lastActivityAt: lastAt || x.createdAt,
      createdAt: x.createdAt,
    };
  };
  const bots = async (): Promise<Bot[]> => {
    const [agents, all] = [await engine.agents.list(), await extras()];
    const primary = await primaryId(agents);
    return Promise.all(agents.map((a) => botOf(a, all[a.id], primary)));
  };
  const bot = async (id: string): Promise<Bot | undefined> =>
    (await bots()).find((b) => b.id === id);
  const emitBot = async (id: string): Promise<void> => {
    const b = await bot(id);
    if (b) emit({ type: "bot", bot: b });
  };
  const botOfChat = async (sid: string): Promise<{ id: string; extra: Extra } | undefined> => {
    const found = Object.entries(await extras()).find(([, x]) => x.sid === sid);
    return found ? { id: found[0], extra: found[1] } : undefined;
  };

  const callStatus = (outcome: string): "done" | "error" | "denied" | "awaiting-approval" =>
    outcome === "error"
      ? "error"
      : outcome === "refused" || outcome === "denied"
        ? "denied"
        : outcome === "waiting"
          ? "awaiting-approval"
          : "done";
  const turnRows = (
    botId: string,
    generation: number,
    t: TurnView,
    index: number,
    next: TurnView | undefined,
    chat: ChatState,
  ): Row[] => {
    if (t.redacted) return [];
    const block = blockOf(index);
    const at = Date.parse(t.at) || Date.now();
    const row = (seq: number, kind: Row["kind"], body: RowBody, offset = 0): Row => ({
      botId,
      generation,
      seq: block + seq,
      updatedSeq: nextRev(),
      kind,
      body,
      createdAt: at + offset,
    });
    const rows: Row[] = [];
    if (t.user_text && t.source !== "button")
      rows.push(
        row(SAID, "message", {
          type: "message",
          role: "user",
          text: t.user_text,
          ...(t.source === "voice"
            ? { from: { kind: "voice" as const, id: botId, name: "voice" } }
            : {}),
        }),
      );
    const drawn = new Set<string>();
    for (const c of t.tool_calls) {
      const k = CALL + 2 * (c.seq - 1);
      const status = callStatus(c.outcome);
      rows.push(
        row(
          k,
          "tool-call",
          {
            type: "tool-call",
            callId: `t${t.id}-c${c.seq}`,
            name: c.name,
            label: plain(engine.describe(c.name, c.args)),
            status,
            args: c.args,
            ...(["ok", "confirmed"].includes(c.outcome) ? {} : { summary: c.outcome }),
          },
          c.seq,
        ),
      );
      if (!c.card) continue;
      const key = JSON.stringify([c.card.name, c.card.args]);
      if (drawn.has(key)) continue;
      drawn.add(key);
      rows.push(row(k + 1, "card", { type: "card", card: "tool", data: c.card }, c.seq));
    }
    if (t.error)
      rows.push(row(ERROR, "notice", { type: "notice", text: t.error, tone: "error" }, 900));
    if (t.stop === "asked") {
      const pending = !next && chat.pending ? chat.pending : null;
      const status = pending
        ? "pending"
        : next
          ? YES.test(next.user_text)
            ? "allowed"
            : "denied"
          : "expired";
      const app = pending ? registry.resolve(pending.name).app : undefined;
      rows.push(
        row(
          ASK,
          "card",
          {
            type: "card",
            card: "approval",
            approvalId: `${botId}~${pending?.callId ?? t.id}`,
            title: t.reply || pending?.question || "This needs your yes.",
            detail: pending ? plain(engine.describe(pending.name, pending.args)) : "",
            tool: pending?.name ?? "confirm",
            ...(app ? { toolkit: app.label } : {}),
            args: pending?.args ?? {},
            status,
          },
          990,
        ),
      );
    } else if (t.reply)
      rows.push(row(REPLY, "message", { type: "message", role: "assistant", text: t.reply }, 999));
    return rows;
  };
  const committed = async (
    botId: string,
    x: Extra,
    fromTurn = 0,
  ): Promise<{ rows: Row[]; turns: number }> => {
    const got = await chats.turns(x.sid);
    if (!got) return { rows: [], turns: 0 };
    const rows = got.turns.flatMap((t, i) =>
      i < fromTurn ? [] : turnRows(botId, x.generation, t, i, got.turns[i + 1], got.chat),
    );
    return { rows, turns: got.turns.length };
  };

  type LiveTurn = {
    botId: string;
    generation: number;
    index: number;
    at: number;
    asked: boolean;
    calls: Map<string, { k: number; name: string; args: JsonObject; label: string }>;
    text: string;
  };
  const turns = new Map<string, LiveTurn>();
  const live = new Map<string, LiveState>();
  const idle = (botId: string): LiveState => ({
    botId,
    isRunning: false,
    activity: null,
    awaiting: null,
    startedAt: null,
  });
  const setLive = (state: LiveState): void => {
    live.set(state.botId, state);
    emit({ type: "live", state });
  };
  const activityOf = (name: string): { kind: string; detail?: string } => {
    if (name === "web_search") return { kind: "searching_web" };
    if (name === "web_read" || name === "web_research") return { kind: "reading_web" };
    if (name.includes("coding")) return { kind: "running_commands" };
    if (name === "agent_ask") return { kind: "messaging_named" };
    const { app } = registry.resolve(name);
    return app ? { kind: "connecting_service", detail: app.label } : { kind: "working" };
  };
  const begin = async (
    sid: string,
    said?: { text: string; source: string },
  ): Promise<LiveTurn | undefined> => {
    const b = await botOfChat(sid);
    if (!b) return undefined;
    const index = (await chats.turns(sid))?.turns.length ?? 0;
    const turn: LiveTurn = {
      botId: b.id,
      generation: b.extra.generation,
      index,
      at: Date.now(),
      asked: Boolean(said),
      calls: new Map(),
      text: "",
    };
    turns.set(sid, turn);
    if (said?.text && said.source !== "button")
      emitRows(turn, [
        liveRow(turn, SAID, "message", {
          type: "message",
          role: "user",
          text: said.text,
          ...(said.source === "voice"
            ? { from: { kind: "voice" as const, id: b.id, name: "voice" } }
            : {}),
        }),
      ]);
    setLive({
      botId: b.id,
      isRunning: true,
      activity: { kind: "thinking", since: Date.now() },
      awaiting: null,
      startedAt: Date.now(),
    });
    return turn;
  };
  const liveRow = (t: LiveTurn, seq: number, kind: Row["kind"], body: RowBody): Row => ({
    botId: t.botId,
    generation: t.generation,
    seq: blockOf(t.index) + seq,
    updatedSeq: nextRev(),
    kind,
    body,
    createdAt: t.at + Math.min(seq, 999),
  });
  const emitRows = (t: LiveTurn, rows: Row[], replace?: [number, number]): void =>
    emit({
      type: "rows",
      botId: t.botId,
      generation: t.generation,
      rows,
      ...(replace ? { replace } : {}),
    });

  const queues = new Map<string, Promise<void>>();
  const stop = engine.observe((sid, e) => {
    const run = (queues.get(sid) ?? Promise.resolve())
      .then(() => onTurn(sid, e))
      .catch((err) => console.error("talk: bots page:", String(err?.message ?? err).slice(0, 200)));
    queues.set(sid, run);
    return e.type === "start" ? run : undefined;
  });
  async function onTurn(sid: string, e: TurnNotice): Promise<void> {
    if (e.type === "start") return void (await begin(sid, { text: e.said, source: e.source }));
    const t =
      turns.get(sid) ?? (e.type === "done" || e.type === "failed" ? undefined : await begin(sid));
    if (e.type === "done" || e.type === "failed") {
      turns.delete(sid);
      const b = await botOfChat(sid);
      if (!b) return;
      const from = t?.index ?? Math.max(0, ((await chats.turns(sid))?.turns.length ?? 1) - 1);
      const redraw = Math.max(0, from - 1);
      const { rows, turns: count } = await committed(b.id, b.extra, redraw);
      if (count > from)
        emit({
          type: "rows",
          botId: b.id,
          generation: b.extra.generation,
          rows,
          replace: [blockOf(redraw), Number.MAX_SAFE_INTEGER],
        });
      else if (t && e.type === "done" && e.done.reply)
        emitRows(t, [
          liveRow(t, REPLY, "message", { type: "message", role: "assistant", text: e.done.reply }),
        ]);
      if (e.type === "failed")
        emit({
          type: "rows",
          botId: b.id,
          generation: b.extra.generation,
          rows: [
            {
              botId: b.id,
              generation: b.extra.generation,
              seq: blockOf(from) + ERROR,
              updatedSeq: nextRev(),
              kind: "notice",
              body: { type: "notice", text: e.error.slice(0, 300), tone: "error" },
              createdAt: Date.now(),
            },
          ],
        });
      const chat = await engine.chatState(sid);
      const waiting = e.type === "done" && (e.done.stop === "asked" || Boolean(chat?.pending));
      setLive(
        waiting
          ? { ...idle(b.id), awaiting: { reason: "your yes", since: Date.now() } }
          : e.type === "done" && e.done.stop === "working"
            ? {
                botId: b.id,
                isRunning: true,
                activity: { kind: "running_commands", since: Date.now() },
                awaiting: null,
                startedAt: Date.now(),
              }
            : idle(b.id),
      );
      if (document(b.id)) await saveExtra(b.id, { readAt: Date.now() });
      await emitBot(b.id);
      emit({ type: "tasks", botId: b.id });
      return;
    }
    if (!t) return;
    if (e.type === "token") {
      t.text += e.text;
      emitRows(t, [
        liveRow(t, REPLY, "message", {
          type: "message",
          role: "assistant",
          text: t.text,
          streaming: true,
        }),
      ]);
    } else if (e.type === "tool") {
      const known = t.calls.get(e.callId);
      const call = known ?? {
        k: CALL + 2 * t.calls.size,
        name: e.name,
        args: e.args,
        label: plain(e.text),
      };
      t.calls.set(e.callId, call);
      const waiting = /waiting/.test(e.text);
      emitRows(t, [
        liveRow(t, call.k, "tool-call", {
          type: "tool-call",
          callId: e.callId,
          name: e.name,
          label: plain(engine.describe(e.name, e.args)),
          status: waiting ? "awaiting-approval" : "running",
          args: e.args,
        }),
      ]);
      const prev = live.get(t.botId) ?? idle(t.botId);
      setLive({ ...prev, isRunning: true, activity: { ...activityOf(e.name), since: Date.now() } });
    } else if (e.type === "result") {
      const call = t.calls.get(e.callId) ?? {
        k: CALL + 2 * t.calls.size,
        name: e.name,
        args: (e.details?.args ?? {}) as JsonObject,
        label: e.name,
      };
      t.calls.set(e.callId, call);
      const outcome = e.isError ? "error" : (e.details?.outcome ?? "ok");
      const rows = [
        liveRow(t, call.k, "tool-call", {
          type: "tool-call",
          callId: e.callId,
          name: e.name,
          label: plain(engine.describe(e.name, call.args)),
          status: callStatus(outcome),
          args: call.args,
          ...(["ok", "confirmed"].includes(outcome) ? {} : { summary: outcome }),
        }),
      ];
      if (e.details?.card && !e.isError)
        rows.push(
          liveRow(t, call.k + 1, "card", { type: "card", card: "tool", data: e.details.card }),
        );
      emitRows(t, rows);
      const prev = live.get(t.botId) ?? idle(t.botId);
      setLive({ ...prev, activity: { kind: "thinking", since: Date.now() } });
    }
  }
  const open = new Set<string>();
  const document = (botId: string): boolean => clients.size > 0 && open.has(botId);

  const tasksOf = async (only?: string) => {
    const out: {
      id: string;
      botId: string;
      title: string;
      state: "working" | "needs_input" | "done";
      note: string;
      updatedAt: number;
    }[] = [];
    for (const [id, x] of Object.entries(await extras())) {
      if (only && id !== only) continue;
      const chat = await engine.chatState(x.sid);
      if (chat?.pending)
        out.push({
          id: `${id}-ask`,
          botId: id,
          title: chat.pending.question || "Waiting for your yes",
          state: "needs_input",
          note: plain(engine.describe(chat.pending.name, chat.pending.args)),
          updatedAt: chat.pending.askedAt,
        });
      else if (chat?.working)
        out.push({
          id: `${id}-job`,
          botId: id,
          title: chat.working.started,
          state: "working",
          note: chat.working.status,
          updatedAt: Date.now(),
        });
    }
    return out;
  };
  const toolkits = () =>
    registry.status().map((a) => ({
      slug: a.name,
      name: a.label,
      description: a.online
        ? `${a.tools} lookups and ${a.writeTools} changes, over its MCP server`
        : `Offline${a.error ? `: ${a.error.slice(0, 80)}` : ""}`,
      categories: [],
      managedAuth: false,
      noAuth: true,
      connected: a.online,
    }));
  const slug = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 32) || "bot";

  async function handle(req: Request): Promise<Response | undefined> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith(`${base}/`)) return undefined;
    const seg = url.pathname.slice(base.length).split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method;
    const body = async (): Promise<Record<string, any>> =>
      method === "GET" ? {} : ((await req.json().catch(() => ({}))) as Record<string, any>);
    const missing = () => json({ error: "No such bot." }, 404);

    if (seg[0] === "events") {
      let mine: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          mine = c;
          clients.add(c);
          c.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "hello", serverTime: Date.now() })}\n\n`,
            ),
          );
        },
        cancel() {
          if (mine) clients.delete(mine);
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
          connection: "keep-alive",
        },
      });
    }
    if (seg[0] === "auth")
      return seg[1] === "me"
        ? json({ user: { id: "jae", email: "", name: "Jae", avatarUrl: null }, devLogin: false })
        : json({ ok: true });
    if (seg[0] === "computer")
      return json({ computer: { status: "absent", orgoId: null, error: null, screens: [] } });
    if (seg[0] === "apps") {
      const q = (url.searchParams.get("search") ?? "").toLowerCase();
      const apps = toolkits().filter(
        (a) => !q || a.name.toLowerCase().includes(q) || a.slug.includes(q),
      );
      return json({
        apps,
        connected: apps.filter((a) => a.connected).map((a) => a.slug),
        connectedApps: apps.filter((a) => a.connected),
        categories: [],
        total: apps.length,
      });
    }
    if (seg[0] === "tasks") return json({ tasks: await tasksOf() });
    if (seg[0] === "policies") return json({ policies: [] });
    if (seg[0] === "rooms") return json({ error: "Group chats aren't part of Talk yet." }, 501);

    if (seg[0] === "approvals" && seg[1] && method === "POST") {
      const [botId] = seg[1].split("~");
      const x = (await extras())[botId];
      if (!x) return missing();
      const chat = await engine.chatState(x.sid);
      if (!chat?.pending) return json({ error: "That is no longer waiting." }, 409);
      const yes = (await body()).decision !== "deny";
      void engine
        .turn(x.sid, yes ? "yes" : "no", () => {}, { ...o.config(botId), source: "button" })
        .catch(() => {});
      return json({ ok: true });
    }

    if (seg[0] === "voice") {
      if (seg[1] === "options")
        return json({
          voices: (o.voices ?? voices)(),
          languages: [{ code: "en", name: "English" }],
          speeds: SPEEDS,
        });
      if (seg[1] === "session" && method === "POST") {
        const b = await body();
        const [agent, x] = [await engine.agents.get(b.botId), (await extras())[b.botId]];
        if (!agent || !x) return missing();
        return json({
          callId: crypto.randomUUID(),
          sessionId: x.sid,
          voice: agent.voice,
          speed: x.speed,
        });
      }
      if (seg[1] === "preview" && method === "POST") {
        const b = await body();
        const agent = await engine.agents.get(b.botId);
        const text = String(
          b.text ?? `Hi, I'm ${agent?.name ?? "Talk"}. This is how I sound.`,
        ).slice(0, 300);
        const tts = o.tts();
        const chunks: Uint8Array[] = [];
        try {
          for await (const chunk of tts.synthesize(text, {
            voice: String(b.voice ?? agent?.voice ?? "af_heart"),
            speed: Number(b.speed) || DEFAULT_SPEED,
            pronunciations: pronunciations(),
          } as never))
            chunks.push(chunk);
        } catch (e) {
          return json(
            {
              error: `The speech server didn't answer (${String((e as Error)?.message ?? e).slice(0, 120)}).`,
            },
            502,
          );
        } finally {
          await tts.close?.();
        }
        return new Response(Buffer.concat(chunks), {
          headers: {
            "content-type": "application/octet-stream",
            "x-sample-rate": String(tts.sampleRate),
          },
        });
      }
      if (seg[1] === "stt" && method === "POST") {
        const pcm = new Uint8Array(await req.arrayBuffer());
        if (pcm.byteLength < 3200) return json({ text: "" });
        try {
          return json({
            text: (
              await o.stt().transcribe(pcm, Number(url.searchParams.get("rate")) || 16000)
            ).trim(),
          });
        } catch (e) {
          return json(
            { error: `Couldn't hear that (${String((e as Error)?.message ?? e).slice(0, 120)}).` },
            502,
          );
        }
      }
      return json({ error: "No such voice call." }, 404);
    }

    if (seg[0] !== "bots") return json({ error: `${url.pathname} isn't part of Talk.` }, 404);
    if (!seg[1]) {
      if (method === "POST") {
        const b = await body();
        const name = String(b.name ?? "").trim();
        if (!name) return json({ error: "A bot needs a name." }, 400);
        const taken = new Set((await engine.agents.list()).map((a) => a.id).concat("heart"));
        let id = slug(name);
        for (let n = 2; taken.has(id); n++) id = `${slug(name).slice(0, 28)}-${n}`;
        await engine.agents.save(id, { name, about: "", persona: "", instructions: "", apps: [] });
        await extras();
        await saveExtra(id, {
          ...(SHAPES.includes(b.avatarShape) || b.avatarShape
            ? { shape: String(b.avatarShape) }
            : {}),
          ...(b.avatarColor ? { color: String(b.avatarColor) } : {}),
        });
        emit({ type: "roster" });
        return json({ bot: await bot(id) });
      }
      const all = await bots();
      const xs = await extras();
      for (const b of all) {
        if (live.has(b.id)) continue;
        const pending = (await engine.chatState(xs[b.id].sid))?.pending;
        live.set(
          b.id,
          pending
            ? { ...idle(b.id), awaiting: { reason: "your yes", since: pending.askedAt } }
            : idle(b.id),
        );
      }
      return json({ bots: all, live: all.map((b) => live.get(b.id) ?? idle(b.id)) });
    }
    const id = seg[1];
    const agent = await engine.agents.get(id);
    const x = (await extras())[id];
    if (!agent || !x) return missing();

    if (!seg[2]) {
      if (method === "PATCH") {
        const b = await body();
        await engine.agents.save(id, {
          ...(b.name !== undefined ? { name: String(b.name) } : {}),
          ...(b.description !== undefined ? { about: String(b.description) } : {}),
          ...(b.instructions !== undefined ? { instructions: String(b.instructions) } : {}),
          ...(b.voice !== undefined ? { voice: String(b.voice) } : {}),
        });
        await saveExtra(id, {
          ...(b.avatarShape ? { shape: String(b.avatarShape) } : {}),
          ...(b.avatarColor ? { color: String(b.avatarColor) } : {}),
          ...(Number(b.voiceSpeed) ? { speed: Number(b.voiceSpeed) } : {}),
          ...(b.label !== undefined ? { label: String(b.label).slice(0, 40) } : {}),
        });
        await emitBot(id);
        return json({ bot: await bot(id) });
      }
      if (method === "DELETE") {
        if (id === (await primaryId(await engine.agents.list())))
          return json({ error: "Make another bot the main one first." }, 409);
        await engine.agents.remove(id);
        emit({ type: "roster" });
        return json({ ok: true });
      }
      return json({ bot: await bot(id) });
    }
    switch (seg[2]) {
      case "rows":
        return json({ generation: x.generation, rows: (await committed(id, x)).rows });
      case "messages": {
        const text = String((await body()).text ?? "").trim();
        if (!text) return json({ error: "Nothing to send." }, 400);
        if (turns.get(x.sid)?.asked) await engine.abort(x.sid);
        const row = new Promise<Row>((resolveRow) => {
          setTimeout(
            () =>
              resolveRow({
                botId: id,
                generation: x.generation,
                seq: 0,
                updatedSeq: 0,
                kind: "message",
                body: { type: "message", role: "user", text },
                createdAt: Date.now(),
              }),
            10_000,
          );
          const off = engine.observe((sid, e) => {
            if (sid !== x.sid || e.type !== "start") return;
            off();
            queueMicrotask(async () => {
              await queues.get(sid);
              const t = turns.get(sid);
              resolveRow({
                botId: id,
                generation: x.generation,
                seq: blockOf(t?.index ?? 0) + SAID,
                updatedSeq: nextRev(),
                kind: "message",
                body: { type: "message", role: "user", text },
                createdAt: t?.at ?? Date.now(),
              });
            });
          });
        });
        void engine
          .turn(x.sid, text, () => {}, { ...o.config(id), source: "typed" })
          .catch(() => {});
        return json({ row: await row });
      }
      case "read":
        open.clear();
        open.add(id);
        await saveExtra(id, { readAt: Date.now() });
        await emitBot(id);
        return json({ ok: true });
      case "interrupt":
        await engine.abort(x.sid);
        return json({ ok: true });
      case "fresh": {
        if (live.get(id)?.isRunning) await engine.abort(x.sid);
        const next = await saveExtra(id, {
          sid: `${id}-${crypto.randomUUID()}`,
          generation: x.generation + 1,
        });
        setLive(idle(id));
        emit({ type: "cleared", botId: id, generation: next.generation });
        await emitBot(id);
        return json({ ok: true });
      }
      case "conversations": {
        if (seg[3] && method === "POST") {
          const sid = seg[3];
          if ((await chats.row(sid))?.agent !== id)
            return json({ error: "No such conversation." }, 404);
          if (turns.get(x.sid)?.asked) await engine.abort(x.sid);
          const next =
            sid === x.sid
              ? x
              : await saveExtra(id, { sid, generation: x.generation + 1, readAt: Date.now() });
          const pending = (await engine.chatState(sid))?.pending;
          setLive(
            pending
              ? { ...idle(id), awaiting: { reason: "your yes", since: pending.askedAt } }
              : idle(id),
          );
          emit({ type: "cleared", botId: id, generation: next.generation });
          emit({
            type: "rows",
            botId: id,
            generation: next.generation,
            rows: (await committed(id, next)).rows,
          });
          await emitBot(id);
          return json({ ok: true });
        }
        const seen = new Map<
          string,
          {
            id: string;
            first: string | null;
            last_at: string | null;
            started_at: string;
            turns: number;
          }
        >();
        for (const c of [
          ...(await chats.list({ agent: id })),
          ...(await chats.list({ agent: id, tests: true })),
        ])
          seen.set(c.id, c);
        const list = [...seen.values()].sort((p, q) =>
          (q.last_at ?? q.started_at).localeCompare(p.last_at ?? p.started_at),
        );
        return json({
          conversations: list.map((c) => ({
            id: c.id,
            first: c.first ?? "",
            at: Date.parse(c.last_at ?? c.started_at),
            turns: c.turns,
            current: c.id === x.sid,
          })),
        });
      }
      case "primary":
        await chats.saveSetting("primaryBot", id);
        emit({ type: "roster" });
        return json({ ok: true });
      case "export": {
        const lines = (await chats.export(x.sid)) ?? "";
        return new Response(lines, {
          headers: {
            "content-type": "application/x-ndjson",
            "content-disposition": `attachment; filename="talk-${id}.jsonl"`,
          },
        });
      }
      case "turns": {
        const turnId = Number(seg[3]);
        if (method !== "POST" || !Number.isFinite(turnId)) break;
        if (!(await chats.turns(x.sid))?.turns.some((t) => t.id === turnId))
          return json({ error: "No such turn in this conversation." }, 404);
        if (seg[4] === "redact") {
          await chats.redactTurn(turnId);
          emit({ type: "cleared", botId: id, generation: x.generation });
          emit({
            type: "rows",
            botId: id,
            generation: x.generation,
            rows: (await committed(id, x)).rows,
          });
          await emitBot(id);
          return json({ ok: true });
        }
        if (seg[4] === "case") {
          const b = await body();
          const draft = await chats.draftCase(
            turnId,
            b.kind === "regression" ? "regression" : "golden",
            String(b.note ?? ""),
          );
          if (!draft) return json({ error: "That turn can't be made into a test." }, 409);
          if (!o.casesDir) return json({ ...draft, saved: null });
          mkdirSync(o.casesDir, { recursive: true });
          let name = draft.name;
          for (let n = 2; existsSync(join(o.casesDir, `${name}.json`)); n++)
            name = `${draft.name}-${n}`;
          writeFileSync(
            join(o.casesDir, `${name}.json`),
            `${JSON.stringify(draft.case, null, 1)}\n`,
          );
          return json({
            name,
            case: draft.case,
            saved: `expect/cases/${name}.json`,
            next: "Run the Dojo with --update, read the new expect file, then commit.",
          });
        }
        break;
      }
      case "timeline": {
        const all = await extras();
        const looks = Object.fromEntries(
          Object.entries(await chats.looks()).map(([aid, look]) => [
            aid,
            { ...look, color: all[aid] ? paint(all[aid].color) : look.color },
          ]),
        );
        const timeline = await chats.timeline(x.sid);
        if (!timeline)
          return json({
            session: {
              id: x.sid,
              agent_id: id,
              agent_name: agent.name,
              agent_color: paint(x.color),
            },
            agents: looks,
            turns: [],
          });
        return json({
          ...timeline,
          session: { ...timeline.session, agent_color: paint(x.color) },
          agents: looks,
        });
      }
      case "trajectory": {
        const got = await chats.turns(x.sid);
        const shown = (got?.turns ?? [])
          .filter((t) => !t.redacted)
          .map((t) => {
            const stages = [
              ...t.spans.map((sp) => ({
                kind: sp.kind === "asr" ? "hearing" : sp.kind === "tts" ? "speaking" : "model",
                label: sp.kind === "llm" ? (sp.label ?? "model") : (sp.label ?? sp.kind),
                start: sp.start,
                seconds: Math.max(0, sp.end - sp.start),
                outcome: "",
              })),
              ...t.tool_calls.map((c) => ({
                kind: c.kind === "read" ? "lookup" : "change",
                label: plain(engine.describe(c.name, c.args)),
                start: c.start_s ?? 0,
                seconds: c.duration_s ?? 0,
                outcome: c.outcome === "ok" ? "" : c.outcome,
              })),
            ]
              .sort((p, q) => p.start - q.start)
              .map((st) => ({
                ...st,
                start: Math.round(st.start * 100) / 100,
                seconds: Math.round(st.seconds * 100) / 100,
              }));
            return {
              id: t.id,
              at: t.at,
              said: t.user_text,
              source: t.source,
              stop: t.stop,
              error: t.error,
              model: t.model,
              total: t.timings.total ?? 0,
              firstToken: t.timings.first_token ?? null,
              tokensIn: t.tokens_in,
              tokensOut: t.tokens_out,
              cost: t.cost,
              stages,
            };
          });
        return json({ sessionId: x.sid, turns: shown });
      }
      case "routines":
        return json({ routines: [] });
      case "tasks":
        return json({ tasks: await tasksOf(id) });
      case "settings": {
        const skills = skillNames().map((name) => {
          const s = readSkill(name);
          return {
            id: name,
            botId: id,
            name,
            description: s?.description ?? "",
            body: s?.body ?? "",
            createdAt: 0,
            updatedAt: 0,
          };
        });
        const said = ((await chats.turns(x.sid))?.turns ?? []).reduce(
          (n, t) => n + t.user_text.length + t.reply.length,
          0,
        );
        return json({
          memories: [],
          skills,
          routines: [],
          tasks: await tasksOf(id),
          memory: {
            lastConsolidatedAt: null,
            historyChars: said,
            compactAtChars: NUM_CTX * 3,
            lastCompaction: null,
          },
        });
      }
      case "skills":
      case "screen":
        return json(
          { error: "Skills are files in the Talk repo (.agents/skills); edit them there." },
          501,
        );
    }
    return json({ error: `${url.pathname} isn't part of Talk.` }, 404);
  }

  return {
    handle,
    close(): void {
      clearInterval(ping);
      stop();
      for (const c of clients) {
        try {
          c.close();
        } catch {}
      }
      clients.clear();
    },
    rows: async (id: string) => (await committed(id, (await extras())[id])).rows,
    subscribe(listener: (event: any) => void): () => void {
      const c = {
        enqueue: (chunk: Uint8Array) =>
          listener(JSON.parse(new TextDecoder().decode(chunk).replace(/^data: /, ""))),
        close() {},
      } as unknown as ReadableStreamDefaultController<Uint8Array>;
      clients.add(c);
      return () => clients.delete(c);
    },
  };
}
