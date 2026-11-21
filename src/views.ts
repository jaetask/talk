import type { EntryRecord } from "@earendil-works/pi-durable";
import type { Card } from "./apps/cards.ts";
import type { JsonObject } from "./apps/classify.ts";
import { TURN_KIND, type TurnRecord } from "./engine.ts";
import type { ToolDetails } from "./ext/apps.ts";
import { NOTE } from "./ext/gate.ts";

export type Span = { kind: string; label?: string; start: number; end: number; first?: number | null };
export type ToolCallView = {
	seq: number; name: string; kind: string; args: JsonObject; outcome: string; result: string; start_s: number | null; duration_s: number | null;
	agent_id: string | null; card?: Card;
};
export type TurnView = {
	id: number; idx: number; at: string; source: string; user_text: string; reply: string; model: string | null; harness: string; route_how: string;
	timings: { [k: string]: number }; spans: Span[]; interrupted: boolean; error: string | null; tool_calls: ToolCallView[]; agent_id: string | null;
	redacted: boolean; redacted_at: string | null; tokens_in: number; tokens_out: number; tokens_cached: number; cost: number | null; cost_basis: string | null;
	stop: string;
};

export type Redactions = { turns: { [turnId: string]: string }; clearedAt: string | null; clearedBefore: number };

const textOf = (content: readonly { type: string; text?: string }[] | undefined): string =>
	(content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
const secs = (ms: number): number => Math.round(ms) / 1000;

const local = (model: string | null): boolean => !!model && !/:(remote|chatgpt)$/.test(model);

export function turnsOf(entries: readonly EntryRecord[], redactions?: Redactions): TurnView[] {
	const turns: TurnView[] = [];
	let steps: any[] = [];
	const names = new Map<string, { name: string; args: JsonObject }>();
	for (const entry of entries) {
		const message = (entry as { model?: readonly any[] }).model?.[0];
		if (entry.kind === "pi.assistant" && message?.role === "assistant") {
			steps.push(message);
			for (const c of message.content ?? []) if (c.type === "toolCall") names.set(c.id, { name: c.name, args: c.arguments ?? {} });
		} else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") steps.push(message);
		else if (entry.kind === TURN_KIND) {
			const r = entry.data as unknown as TurnRecord;
			const id = entry.id as unknown as number;
			const t0 = r.startedMs;
			const spans: Span[] = [];
			const calls: ToolCallView[] = [];
			if (r.timings.asr) spans.push({ kind: "asr", label: "hearing", start: 0, end: r.timings.asr });
			for (const m of steps) {
				if (m.role === "assistant") {
					const start = Math.max(0, secs(m.timestamp - t0));
					spans.push({ kind: "llm", label: m.model, start, end: start + secs(m.durationMs ?? 0), first: null });
				} else {
					const d = m.details as ToolDetails | undefined;
					const called = names.get(m.toolCallId);
					const ms = d?.ms ?? 0;
					calls.push({
						seq: calls.length + 1,
						name: m.toolName,
						kind: d?.kind ?? "read",
						args: (d?.args ?? called?.args ?? {}) as JsonObject,
						outcome: m.isError ? "error" : (d?.outcome ?? "ok"),
						result: textOf(m.content).slice(0, 2000),
						start_s: Math.max(0, secs(m.timestamp - ms - t0)),
						duration_s: secs(ms),
						agent_id: r.agent,
						...(d?.card ? { card: d.card } : {}),
					});
				}
			}
			if (r.timings.first_audio) spans.push({ kind: "tts", label: "speaking", start: r.timings.first_audio, end: Math.max(r.timings.total ?? 0, r.timings.first_audio) });
			const redactedAt = redactions?.turns[String(id)] ?? (redactions && id <= redactions.clearedBefore ? redactions.clearedAt : null) ?? null;
			const hidden = redactedAt !== null;
			turns.push({
				id, idx: turns.length, at: r.at, source: r.source, user_text: hidden ? "" : r.said, reply: hidden ? "" : r.reply, model: r.model, harness: "pi-durable",
				route_how: "pi-durable", timings: r.timings, spans, interrupted: r.stop === "aborted", error: r.error,
				tool_calls: hidden ? calls.map((c) => ({ ...c, args: {}, result: "", card: undefined })) : calls, agent_id: r.agent, redacted: hidden, redacted_at: redactedAt,
				tokens_in: r.usage.input, tokens_out: r.usage.output, tokens_cached: 0, cost: local(r.model) ? 0 : r.usage.cost || null, cost_basis: local(r.model) ? "local" : r.usage.cost ? "reported" : null,
				stop: r.stop,
			});
			steps = [];
		}
	}
	return turns;
}

export function usageOf(turns: readonly TurnView[]) {
	const counted = turns.filter((t) => t.tokens_in || t.tokens_out);
	const unpriced = counted.filter((t) => t.cost === null).length;
	return {
		tokens_in: counted.reduce((n, t) => n + t.tokens_in, 0),
		tokens_out: counted.reduce((n, t) => n + t.tokens_out, 0),
		tokens_cached: 0,
		cost: counted.length && unpriced === counted.length ? null : Math.round(counted.reduce((n, t) => n + (t.cost ?? 0), 0) * 1e6) / 1e6,
		turns_counted: counted.length,
		turns_unpriced: unpriced,
	};
}

export type AgentLook = { name: string; color: string };

export function timelineOf(
	chat: { sid: string; agent: string; persona: string; voice: string },
	entries: readonly EntryRecord[],
	agents: { [id: string]: AgentLook },
	systemNote: string,
	redactions?: Redactions,
) {
	const turns = turnsOf(entries, redactions);
	const look = agents[chat.agent];
	return {
		session: {
			id: chat.sid, agent_id: chat.agent, brain: turns.at(-1)?.model ?? null, personality: chat.persona, voice: chat.voice, usage: usageOf(turns),
			...(look ? { agent_name: look.name, agent_color: look.color } : {}), system_note: systemNote,
		},
		agents,
		turns,
	};
}

export type ChatMessage = {
	id: string; role: "user" | "assistant"; createdAt: string; status: "complete";
	parts: ({ type: "text"; text: string } | { type: "widget"; widget: { id: string; kind: string; title: string; data: Card } })[];
};
export const CARD_KIND = "talk.tool-card";

export function messagesOf(turns: readonly TurnView[]): ChatMessage[] {
	const out: ChatMessage[] = [];
	for (const t of turns) {
		const text = (s: string) => [{ type: "text" as const, text: t.redacted ? "(cleared)" : s }];
		if (t.user_text || t.redacted) out.push({ id: `t${t.id}-u`, role: "user", createdAt: t.at, status: "complete", parts: text(t.user_text) });
		const drawn = new Set<string>();
		for (const c of t.tool_calls) {
			if (!c.card) continue;
			const key = JSON.stringify([c.card.name, c.card.args]);
			if (drawn.has(key)) continue;
			drawn.add(key);
			out.push({ id: `t${t.id}-c${c.seq}`, role: "assistant", createdAt: t.at, status: "complete", parts: [{ type: "widget", widget: { id: `t${t.id}-c${c.seq}`, kind: CARD_KIND, title: `${c.card.app_label} · ${c.card.tool}`, data: c.card } }] });
		}
		if (t.reply || t.redacted) out.push({ id: `t${t.id}-a`, role: "assistant", createdAt: t.at, status: "complete", parts: text(t.reply) });
	}
	return out;
}

export function exportLines(timeline: ReturnType<typeof timelineOf>): string {
	return `${[JSON.stringify({ session: timeline.session }), ...timeline.turns.map((t) => JSON.stringify(t))].join("\n")}\n`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function caseOf(turns: readonly TurnView[], turnId: number, kind: "golden" | "regression", agents: { [id: string]: AgentLook }, note = "") {
	const upTo = turns.findIndex((t) => t.id === turnId);
	if (upTo < 0) return undefined;
	const used = turns.slice(0, upTo + 1).filter((t) => !t.redacted);
	const last = used.at(-1);
	if (!last || last.id !== turnId) return undefined;
	const label = (name: string) => {
		const app = name.includes("__") ? name.split("__")[0] : "";
		return app ? `${app.charAt(0).toUpperCase()}${app.slice(1)} · ${name.split("__").slice(1).join("__")}` : name.replace(/_/g, " ");
	};
	const fixtures: { [k: string]: unknown } = {};
	for (const t of used) for (const c of t.tool_calls) if (c.kind === "read" && c.outcome === "ok" && c.result && c.name.includes("__")) fixtures[c.name] = safeJson(c.result);
	const reads = last.tool_calls.filter((c) => c.kind === "read" && c.name.includes("__"));
	const writes = last.tool_calls.filter((c) => (c.kind === "write" || c.kind === "danger") && ["ok", "pretend", "confirmed"].includes(c.outcome));
	const checks: { [k: string]: unknown } =
		kind === "golden"
			? {
					...(reads.length ? { tool: [...new Set(reads.map((c) => label(c.name)))] } : last.tool_calls.length ? {} : { no_tool: true }),
					...(writes.length ? { wrote: writes[0].name.split("__").pop() } : { no_write: true }),
					...(UUID.test(last.reply) ? {} : { no_uuid: true }),
					no_claim_without_tool: true,
				}
			: { no_claim_without_tool: true, no_uuid: true };
	const agent = last.agent_id && agents[last.agent_id] ? last.agent_id : undefined;
	return {
		name: `${kind}.${slug(last.user_text)}`,
		case: {
			...(note ? { note } : {}),
			brain: "smart",
			config: { ...(agent ? { agent } : {}), writes: writes.length > 0, ...(Object.keys(fixtures).length ? { fixtures } : {}) },
			turns: used.map((t, i) => ({ say: t.user_text, ...(i === used.length - 1 ? { checks } : {}) })),
			runs: 3,
		},
	};
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "turn";
const safeJson = (s: string): unknown => {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
};

export { NOTE };
