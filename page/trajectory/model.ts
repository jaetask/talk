export interface Span {
  kind: string;
  label?: string;
  start: number;
  end: number;
  first?: number | null;
}
export interface ToolCall {
  seq: number;
  name: string;
  kind?: string;
  args?: Record<string, unknown>;
  outcome?: string;
  result?: string;
  start_s?: number | null;
  duration_s?: number | null;
  hidden?: boolean | number;
  agent_id?: string | null;
}
export interface Turn {
  id: number;
  idx: number;
  source?: string;
  user_text: string;
  reply?: string;
  model?: string | null;
  harness?: string | null;
  route_how?: string | null;
  timings?: Record<string, number> | null;
  spans?: Span[];
  interrupted?: boolean | number;
  error?: string | null;
  tool_calls?: ToolCall[];
  agent_id?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
  tokens_cached?: number | null;
  cost?: number | null;
  cost_basis?: string | null;
}
export interface Usage {
  tokens_in?: number | null;
  tokens_out?: number | null;
  tokens_cached?: number | null;
  cost?: number | null;
  cost_basis?: string | null;
  turns_counted?: number;
  turns_unpriced?: number;
}
export interface Session {
  id?: string;
  agent_name?: string;
  agent_color?: string;
  personality?: string;
  system_note?: string;
  usage?: Usage;
}
export interface Timeline {
  session: Session;
  turns: Turn[];
  agents?: Record<string, { name: string; color: string }>;
}

export const LANES: [string, string[]][] = [
  ["User", ["asr"]],
  ["Model", ["route", "llm"]],
  ["Tools", ["tool"]],
  ["Voice", ["tts"]],
];
const TURN_GAP_S = 0.6;

const count = (n: number) => n.toLocaleString("en-US");
export const dollars = (c: number) =>
  c === 0 ? "$0" : c < 1 ? `$${c.toFixed(4)}` : `$${c.toFixed(2)}`;
export function usageLine(u: Usage | null | undefined): string {
  if (!u || (!u.tokens_in && !u.tokens_out)) return "";
  const cached = u.tokens_cached ? ` (${count(u.tokens_cached)} from cache)` : "";
  const left = u.turns_unpriced
    ? `, ${u.turns_unpriced} turn${u.turns_unpriced === 1 ? "" : "s"} without a price`
    : "";
  const cost =
    u.cost == null
      ? "cost not known"
      : u.cost === 0 && !u.turns_unpriced
        ? "no cost (local model)"
        : `${dollars(u.cost)}${u.cost_basis ? ` (${u.cost_basis})` : ""}${left}`;
  return `${count(u.tokens_in ?? 0)} tokens in${cached} · ${count(u.tokens_out ?? 0)} out · ${cost}`;
}

const CLAUDE_CODE = "#d97757"; // toolkit-guard-allow

export const secs = (x: number | null | undefined) =>
  x == null || Number.isNaN(x) ? "—" : x < 1 ? `${Math.round(x * 1000)} ms` : `${x.toFixed(1)} s`;
export const appOf = (n: string) => (n.includes("__") ? n.split("__")[0] : n.split("_")[0]);
export const toolOf = (n: string) =>
  (n.includes("__")
    ? n.split("__").slice(1).join("__").replaceAll("_", "-")
    : n.split("_").slice(1).join("_")) || n;
export const failed = (c: ToolCall) =>
  ["error", "refused", "switched_off"].includes(c.outcome ?? "") ||
  /^\s*\{"error"/.test(c.result || "");
const oneLine = (s: unknown, n = 160) => {
  const t = String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export interface Bar {
  kind: string;
  tkind?: string;
  lane: number;
  start: number;
  end: number;
  first?: number | null;
  label?: string;
  bad?: boolean;
  row: string;
  turn: number;
  ti: number;
  dur: number;
  gs: number;
  ge: number;
  color?: string;
}
export interface Boundary {
  boundary: true;
  turn: number;
  ti: number;
  gs: number;
}

export function bars(
  turns: Turn[],
  agents: Timeline["agents"] = {},
): { out: (Bar | Boundary)[]; total: number } {
  const out: (Bar | Boundary)[] = [];
  let offset = 0;
  turns.forEach((t, ti) => {
    interface Item {
      kind: string;
      tkind?: string;
      lane: number;
      start: number;
      end: number;
      first?: number | null;
      label?: string;
      bad?: boolean;
      row?: string;
    }
    const items: Item[] = (t.spans || []).map((s) => ({
      ...s,
      lane: LANES.findIndex(([, k]) => k.includes(s.kind)),
    }));
    for (const c of t.tool_calls || []) {
      if (c.start_s == null) continue;
      items.push({
        kind: "tool",
        tkind: c.kind,
        lane: 2,
        start: c.start_s,
        end: c.start_s + (c.duration_s || 0),
        label: `${appOf(c.name)} · ${toolOf(c.name)}`,
        bad: failed(c),
        row: `t${t.idx}c${c.seq}`,
      });
    }
    const dur = Math.max(t.timings?.total || 0, ...items.map((i) => i.end || 0), 0.3);
    const color = t.agent_id && agents?.[t.agent_id]?.color;
    items
      .filter((i) => i.lane >= 0)
      .sort((a, b) => a.start - b.start)
      .forEach((i) => {
        out.push({
          ...i,
          turn: t.idx,
          ti,
          dur,
          gs: offset + i.start,
          ge: offset + i.end,
          color: color || undefined,
          row:
            i.row ||
            ({ asr: `t${t.idx}u`, route: `t${t.idx}x` } as Record<string, string>)[i.kind] ||
            `t${t.idx}a`,
          bad: i.bad || (!!t.error && i.kind === "llm"),
        });
      });
    out.push({ boundary: true, turn: t.idx, ti, gs: offset });
    offset += dur + TURN_GAP_S;
  });
  return { out, total: Math.max(offset - TURN_GAP_S, 0.3) };
}

export type Mode = "duration" | "turns" | "calls";

export function placement(
  b: Bar,
  mode: Mode,
  real: Bar[],
  n: number,
  total: number,
): [number, number] {
  if (mode === "turns") {
    const p = (x: number) => (b.ti + Math.min(x / b.dur, 1) * 0.96) / n;
    return [p(b.start), p(b.end)];
  }
  if (mode === "calls") {
    const i = real.indexOf(b);
    return [(i + 0.05) / Math.max(real.length, 1), (i + 0.95) / Math.max(real.length, 1)];
  }
  return [b.gs / total, b.ge / total];
}

export interface Row {
  id: string;
  role: "system" | "user" | "route" | "tool" | "agent";
  tag: string;
  text: string;
  more: string;
  turn?: number;
  step?: number;
  t?: Turn;
  c?: ToolCall;
  route?: Span;
  by?: string;
  byColor?: string | null;
  color?: string | null;
  mono?: boolean;
  bad?: boolean;
  kind?: string;
  hid?: boolean;
}

export function rows(session: Session, turns: Turn[], agents: Timeline["agents"] = {}): Row[] {
  const who = (id?: string | null) =>
    (id && agents?.[id]) ||
    (session.agent_name
      ? { name: session.agent_name, color: session.agent_color ?? "" }
      : { name: "Assistant", color: "" });
  const r: Row[] = [
    {
      id: "sys",
      role: "system",
      tag: "SYSTEM",
      text: `${session.agent_name || session.personality || "Default"}: personality, rules and app skills`,
      more: session.system_note || "",
    },
  ];
  for (const t of turns) {
    const cc = t.route_how === "coding" && (t.user_text || "").startsWith("Claude Code:");
    r.push(
      cc
        ? {
            id: `t${t.idx}u`,
            role: "system",
            tag: "CLAUDE CODE",
            turn: t.idx,
            t,
            text: `Session started: ${t.user_text.slice(12).trim().split("\n")[0]}`,
            more: "The task Talk gave Claude Code (over ACP), in a scratch worktree. Not something Jae said.",
          }
        : {
            id: `t${t.idx}u`,
            role: "user",
            tag: "USER",
            turn: t.idx,
            t,
            text: t.user_text,
            more: t.source === "voice" ? "Spoken, transcribed by Whisper." : "Typed.",
          },
    );
    const route = (t.spans || []).find((s) => s.kind === "route");
    const apps = route ? (route.label || "").replace(/^route: /, "") : "—";
    r.push({
      id: `t${t.idx}x`,
      role: "route",
      tag: "ROUTE",
      turn: t.idx,
      t,
      route,
      text: `${apps} · ${t.route_how || "—"}${t.model ? ` · ${t.model}` : ""}${t.harness ? ` on ${t.harness}` : ""}${usageLine(t) ? ` · ${usageLine(t)}` : ""}`,
      more: `Apps offered to the model: ${apps}\nHow the route was chosen: ${t.route_how || "—"}\nModel: ${t.model || "—"}\nHarness: ${t.harness || "—"}\nUsed: ${usageLine(t) || "not counted"}\nTimings: ${JSON.stringify(t.timings || {})}`,
    });
    for (const c of (t.tool_calls || [])
      .slice()
      .sort((a, b) => (a.start_s ?? 0) - (b.start_s ?? 0))) {
      const args = JSON.stringify(
        Object.fromEntries(Object.entries(c.args || {}).filter(([k]) => k !== "requestId")),
      );
      const by = who(c.agent_id || t.agent_id);
      r.push({
        id: `t${t.idx}c${c.seq}`,
        role: "tool",
        tag: appOf(c.name).toUpperCase(),
        by: by.name.toUpperCase(),
        byColor: by.color,
        turn: t.idx,
        t,
        c,
        mono: true,
        bad: failed(c),
        kind: c.kind,
        hid: !!c.hidden,
        text: `${c.hidden ? "[hidden from the model after a retry] " : ""}${toolOf(c.name)} ${oneLine(args, 90)} → ${c.outcome || ""}${c.result ? `: ${oneLine(c.result, 120)}` : ""}`,
        more: `${c.kind ? `${c.kind} · ` : ""}${JSON.stringify(c.args || {}, null, 1)}\n\n→ ${c.outcome} · took ${secs(c.duration_s)} · started ${secs(c.start_s)} into the turn\n\n${c.result || "(no result saved)"}`,
      });
    }
    if (t.reply || t.error || t.interrupted) {
      const ag = cc ? { name: "Claude Code", color: CLAUDE_CODE } : who(t.agent_id);
      r.push({
        id: `t${t.idx}a`,
        role: "agent",
        tag: ag.name.toUpperCase(),
        color: ag.color,
        turn: t.idx,
        t,
        bad: !!t.error,
        text:
          (t.reply || "").trim() ||
          (t.error ? `error: ${t.error}` : "(interrupted before replying)"),
        more: `${t.interrupted ? "Interrupted by Jae. " : ""}Turn took ${secs(t.timings?.total)}.`,
      });
    }
  }
  const steps: Record<number, number> = {};
  for (const x of r) if (x.turn != null) x.step = steps[x.turn] = (steps[x.turn] || 0) + 1;
  return r;
}

export const searchText = (r: Row) =>
  `${r.by || ""} ${r.tag} ${r.text} ${r.more || ""}`.toLowerCase();
