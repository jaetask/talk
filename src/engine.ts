// The engine: Pi Durable under Talk. Every chat is a durable conversation; every mode shares this one path. A turn
// submits what Jae said and follows the run through the conversation's watch, so a screen, a voice loop or a test
// sees the same events.
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
	createRegistry, Harness, MemoryStorage, UsageDoc,
	type AgentChange, type Conversation, type EntryRecord, type Extension, type ToolRegistration,
} from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { Agents, HEART, type Agent } from "./agents.ts";
import { appOf, toolOf, type Json, type JsonObject } from "./apps/classify.ts";
import { YES } from "./apps/gate.ts";
import type { Registry } from "./apps/registry.ts";
import { initialChat, TalkChat, TalkIndex, type ChatState, type PretendWrite } from "./chat.ts";
import { agentsExtension } from "./ext/agents.ts";
import { appExtension, appExtensionName, type ToolDetails } from "./ext/apps.ts";
import { CALL_END, coreExtension, READ_SKILL, STAY_QUIET, TOOL_SEARCH } from "./ext/core.ts";
import { gateExtension, NOTE, Parked } from "./ext/gate.ts";
import { Hold, HOLD_CHARS } from "./hold.ts";
import { openBunSqlite } from "./storage/bun-sqlite.ts";

export type ChatConfig = {
	agent?: string;
	persona?: string;
	voice?: string;
	writes?: boolean;
	pretend?: boolean;
	onCall?: boolean;
	noConfirm?: boolean;
	fixtures?: { [tool: string]: Json } | null;
	fixturesOnly?: boolean;
	model?: string;
	/** typed or voice: how what was said arrived. */
	source?: string;
};

export type TurnEvent =
	| { type: "token"; text: string }
	| { type: "tool"; text: string; name: string; args: JsonObject; callId: string }
	| { type: "result"; name: string; callId: string; isError: boolean; details?: ToolDetails; text: string }
	| { type: "ask"; question: string }
	| { type: "status"; text: string };

/** What an observer of all chats is told: a turn starting, its events, and its end. */
export type TurnNotice = TurnEvent | { type: "start"; said: string; source: string } | { type: "done"; done: TurnDone } | { type: "failed"; error: string };

export type TurnDone = {
	reply: string;
	/** answered; asked: something needs Jae's yes; working: a long job has the run and will report when it ends. */
	stop: "answered" | "asked" | "working" | "failed" | "aborted";
	error?: string;
	model: string;
	endCall: boolean;
	timings: { first_token?: number; total: number };
	usage: { input: number; output: number; cost: number };
	tools: { name: string; args: JsonObject; outcome: string }[];
};

export type EngineOptions = {
	/** A SQLite file, or "memory". */
	storage: string;
	models: Models;
	provider: string;
	model: string;
	registry: Registry;
	/** More extensions: features that add tools or context to every chat (the web, the reader, agents). */
	extra?: Extension[];
	/** Extensions installed for subagents only; an ordinary chat never selects them. */
	childOnly?: Extension[];
	maxTurns?: number;
	/**
	 * How much of a model step's text is held back before it is spoken, in case the step turns out to be narration on
	 * the way to a tool call (default 300). 0 streams it as it comes, for a model that never narrates.
	 */
	holdChars?: number;
	/** The calls waiting on Jae; shared with features that ask him things of their own (a coding session's steps). */
	parked?: Parked;
	/** How long a delegate may take before the agent that asked is told it ran out of time. */
	delegateSeconds?: number;
};

export const TURN_KIND = "talk.turn";
/** One turn as the person saw it: what was said, what was answered, how it ended and what it used. */
export type TurnRecord = {
	v: 1; at: string; startedMs: number; said: string; source: string; reply: string; stop: TurnDone["stop"]; error: string | null;
	model: string; agent: string; timings: { [k: string]: number }; usage: { input: number; output: number; cost: number };
};
const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The part of a chat's state that comes from its agent. */
export const chatOfAgent = (a: Agent) => ({ agent: a.id, agentName: a.name, persona: a.persona, instructions: a.instructions, voice: a.voice, apps: [...a.apps] });

const textOf = (content: readonly { type: string; text?: string }[] | undefined): string =>
	(content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");

export class Engine {
	readonly parked: Parked;
	readonly agents = new Agents(() => this.harness);
	readonly extensions = createRegistry();
	harness!: Harness;
	private chains = new Map<string, Promise<unknown>>();
	private running = new Map<string, { abort: () => void }>();
	private constructor(readonly options: EngineOptions) {
		this.parked = options.parked ?? new Parked();
	}

	static async open(options: EngineOptions): Promise<Engine> {
		const engine = new Engine(options);
		const { registry } = options;
		engine.extensions.install(coreExtension(registry));
		engine.extensions.install(gateExtension(registry, engine.parked, () => engine.harness));
		for (const app of registry.apps.values()) engine.extensions.install(appExtension(registry, app));
		engine.extensions.install(
			agentsExtension({ agents: engine.agents, agentChange: (chat, model, without) => engine.agentChange(chat, model, without), chatOfAgent, seconds: options.delegateSeconds }),
		);
		for (const ext of [...(options.extra ?? []), ...(options.childOnly ?? [])]) engine.extensions.install(ext);
		const storage = options.storage === "memory" ? new MemoryStorage() : await SqliteStorage.open(openBunSqlite(options.storage));
		engine.harness = await Harness.open(
			storage,
			{
				models: options.models,
				registry: engine.extensions,
				settings: {
					toolExecution: "sequential",
					retry: { maxRetries: 1 },
					// A 24k local context: keep the newest exchanges word for word, fold older ones into a summary only
					// when the window is nearly full, and never summarize in the background (one model, one GPU).
					compaction: { reserveTokens: 4096, keepRecentTokens: 8000, backgroundTokens: 0 },
				},
				onReport: (report: { kind: string; error?: unknown }) => console.error(`pi-durable report: ${report.kind}`, String((report.error as Error)?.message ?? report.error ?? "").slice(0, 300)),
			} as never,
			ctx,
		);
		await engine.agents.seed();
		return engine;
	}

	private closed = false;
	async close(): Promise<void> {
		this.closed = true;
		await this.harness.close(ctx);
	}

	/**
	 * Connect (or reconnect) the apps and install what they offer now, then carry on with whatever the last process
	 * left unfinished. Work is resumed only here, once the apps' tools exist: a call parked before a restart would
	 * otherwise wake to find its tool missing.
	 */
	async syncApps(): Promise<void> {
		await this.options.registry.connectAll();
		for (const app of this.options.registry.apps.values()) this.lastRetry.set(app.name, Date.now());
		for (const app of this.options.registry.apps.values()) this.extensions.install(appExtension(this.options.registry, app));
		this.harness.resume();
	}

	private lastRetry = new Map<string, number>();
	/** Fresh names for the prompt, and another try at an app that was offline (it may have been restarted). */
	private async refreshApps(): Promise<void> {
		for (const app of this.options.registry.apps.values()) {
			if (app.online) await app.refreshContext();
			else if (Date.now() - (this.lastRetry.get(app.name) ?? 0) > 30_000) {
				this.lastRetry.set(app.name, Date.now());
				try {
					await app.connect();
					this.extensions.install(appExtension(this.options.registry, app));
				} catch {
					// still offline
				}
			}
		}
	}

	// ── chats ──

	async conversationOf(sid: string): Promise<Conversation | undefined> {
		const index = await this.harness.snapshot(TalkIndex, ctx);
		const id = index?.chats[sid]?.conversation;
		return id === undefined ? undefined : await this.harness.conversation(id as never, ctx);
	}

	async chatState(sid: string): Promise<ChatState | undefined> {
		const conv = await this.conversationOf(sid);
		return conv ? ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) : undefined;
	}

	/** The chat for `sid`, created on first use, with `config` applied to it. */
	async chat(sid: string, config: ChatConfig = {}): Promise<Conversation> {
		let conv = await this.conversationOf(sid);
		const agent: Agent = (await this.agents.get(config.agent)) ?? HEART;
		if (!conv) {
			conv = await this.harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
			const id = conv.id;
			await this.harness.commit(async (tx) => {
				(await tx.doc(TalkIndex)).chats[sid] = { conversation: id as unknown as number, agent: agent.id, createdAt: Date.now(), title: "", first: "", lastAt: null, last: "", turns: 0, pinnedAt: null, test: false };
				const doc = await tx.doc(TalkChat, id);
				Object.assign(doc, initialChat(), { sid, ...chatOfAgent(agent) });
			}, ctx);
		}
		const id = conv.id;
		await this.harness.commit(async (tx) => {
			const doc = await tx.doc(TalkChat, id);
			// The agent's settings as they are now, so a change in Settings applies from the next turn.
			if (config.agent ? agent.id === config.agent : doc.agent === agent.id) Object.assign(doc, chatOfAgent(agent));
			else if (!config.agent) {
				const own = await this.agents.get(doc.agent);
				if (own) Object.assign(doc, chatOfAgent(own));
			}
			if (config.persona !== undefined) doc.persona = config.persona;
			if (config.voice !== undefined) doc.voice = config.voice;
			if (config.writes !== undefined) doc.writes = config.writes;
			if (config.pretend !== undefined) doc.pretend = config.pretend;
			if (config.onCall !== undefined) doc.onCall = config.onCall;
			if (config.noConfirm !== undefined) doc.noConfirm = config.noConfirm;
			if (config.fixtures !== undefined) doc.fixtures = config.fixtures as never;
			if (config.fixturesOnly !== undefined) doc.fixturesOnly = config.fixturesOnly;
		}, ctx);
		const chat = ((await this.harness.snapshot(TalkChat, id, ctx)) as ChatState | undefined) ?? initialChat();
		const own = (await this.agents.get(chat.agent)) ?? HEART;
		await conv.configure(this.agentChange(chat, config.model || own.model || undefined), ctx);
		return conv;
	}

	/**
	 * What a conversation runs with, from its chat state: the extensions of the apps its agent may use, no write tools
	 * while writes are off, and its model. A delegate's child conversation is configured the same way, so an agent is
	 * the same agent whether Jae talks to it or another agent hands it work.
	 */
	agentChange(chat: Pick<ChatState, "apps" | "writes">, model?: string, without: string[] = []): AgentChange {
		const mine = (name: string) => chat.apps.length === 0 || chat.apps.includes(name);
		const skip = new Set([...(this.options.childOnly ?? []).map((e) => e.name), ...without]);
		const selected = this.extensions.snapshot().installed().filter((e) => !skip.has(e.name) && (!e.name.startsWith("app-") || mine(e.name.slice(4))));
		const { registry } = this.options;
		const writes: ToolRegistration[] = chat.writes
			? []
			: (selected.flatMap((e) => e.tools ?? []).filter((t) => {
					const { tool } = registry.resolve(t.name);
					return tool !== undefined && tool.kind !== "read";
				}) as ToolRegistration[]);
		return {
			model: { provider: this.options.provider, modelId: model ?? this.options.model },
			extensions: selected,
			tools: writes.length ? { remove: writes } : null,
			modelTools: null,
			maxTurns: this.options.maxTurns ?? 10,
		} as AgentChange;
	}

	/**
	 * Write turns into a chat as given, with no model call: what was said and what was answered. Tests use it to set up
	 * what came before the sentence under test, so the context is the same on every run.
	 */
	async scripted(sid: string, turns: { say: string; reply: string }[], config: ChatConfig = {}): Promise<number> {
		const conv = await this.chat(sid, config);
		const model = config.model ?? this.options.model;
		let written = 0;
		for (const t of turns) {
			const [say, reply] = [String(t.say ?? "").trim(), String(t.reply ?? "").trim()];
			if (!say || !reply) continue;
			const now = Date.now();
			const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
			await conv.submit({
				type: "write",
				entry: {
					kind: "talk.scripted", data: { say, reply },
					model: [
						{ role: "user", content: say, timestamp: now },
						{ role: "assistant", content: [{ type: "text", text: reply }], api: "scripted", provider: this.options.provider, model, usage, stopReason: "stop", timestamp: now },
					],
				},
			} as never, ctx);
			const chat = ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) ?? initialChat();
			const record: TurnRecord = { v: 1, at: new Date(now).toISOString(), startedMs: now, said: say, source: "scripted", reply, stop: "answered", error: null, model, agent: chat.agent, timings: { total: 0 }, usage: { input: 0, output: 0, cost: 0 } };
			await conv.submit({ type: "write", entry: { kind: TURN_KIND, data: record } } as never, ctx);
			written++;
		}
		await conv.waitForIdle(ctx);
		return written;
	}

	async pretendLog(sid: string): Promise<PretendWrite[]> {
		return ((await this.chatState(sid))?.pretendLog ?? []) as PretendWrite[];
	}

	/** Stop the answer that is being given. What was said so far stays. */
	async abort(sid: string): Promise<void> {
		this.running.get(sid)?.abort();
		const conv = await this.conversationOf(sid);
		const chat = await this.chatState(sid);
		if (conv && chat?.pending) this.parked.settle(`${conv.id}:${chat.pending.callId}`, { yes: false, said: "(Jae interrupted)" });
		await conv?.abort(ctx);
	}

	// ── a turn ──

	/** How a call is shown in the chat: the app, the tool, and its arguments with names in place of ids. */
	describe(name: string, args: JsonObject): string {
		if (name === CALL_END) return "Talk · end the call";
		if (name === STAY_QUIET) return "Talk · stay quiet";
		if (name === TOOL_SEARCH) return `🔧 tool search ${String(args.query ?? "").slice(0, 60)}`;
		if (name === READ_SKILL) return `🔧 read skill ${String(args.name ?? "")}`;
		const { app, tool } = this.options.registry.resolve(name);
		const tasks = this.options.registry.apps.get("tasks");
		const plain = Object.entries(args ?? {}).map(([k, v]) => `${k}=${v && typeof v === "object" ? JSON.stringify(v).slice(0, 40) : v}`).join(" ");
		// Talk's own features read like an app: "Reader · goto", "Web · search", "Claude Code · start coding session".
		if (name.startsWith("reader_")) return `🔧 Reader · ${name.slice(7)} ${plain}`.trimEnd();
		if (name.startsWith("web_")) return `🔧 Web · ${name.slice(4)} ${plain}`.trimEnd();
		if (["start_coding_session", "coding_status", "stop_coding_session"].includes(name)) return `🔧 Claude Code · ${name.replace(/_/g, " ")}`;
		const bits = Object.entries(args ?? {}).filter(([k]) => k !== "by" && k !== "requestId").map(([k, v]) => {
			let shown: unknown = v;
			if (["projectId", "featureId", "actorId"].includes(k)) shown = tasks?.catalog.name(v) ?? v;
			else if (["projectIds", "featureIds"].includes(k) && Array.isArray(v)) shown = v.map((x) => tasks?.catalog.name(x) ?? x).join(",");
			if (shown && typeof shown === "object") shown = JSON.stringify(shown).slice(0, 40);
			return `${k.replace("Ids", "s").replace("Id", "")}=${shown}`;
		});
		if (!app) return `🔧 ${name.replace(/_/g, " ")} ${bits.join(" ")}`.trimEnd();
		return `🔧 ${app.label} · ${tool?.name ?? toolOf(name)} ${bits.join(" ")}`.trimEnd();
	}

	/**
	 * Watchers of every chat's turns, however they were started (the page, a voice call, a test): what was said, each
	 * event, and how the turn ended. A screen that shows chats it didn't start (the bots page) draws from these.
	 */
	private observers = new Set<(sid: string, event: TurnNotice) => void | Promise<void>>();
	observe(observer: (sid: string, event: TurnNotice) => void | Promise<void>): () => void {
		this.observers.add(observer);
		return () => this.observers.delete(observer);
	}
	private async notify(sid: string, event: TurnNotice): Promise<void> {
		for (const o of this.observers) {
			try {
				await o(sid, event);
			} catch (e) {
				console.error("talk-next: a turn observer failed:", String((e as Error)?.message ?? e).slice(0, 200));
			}
		}
	}

	turn(sid: string, text: string, onEvent: (event: TurnEvent) => void | Promise<void> = () => {}, config: ChatConfig = {}): Promise<TurnDone> {
		const prev = this.chains.get(sid) ?? Promise.resolve();
		const run = async () => {
			if (!this.observers.size) return this.runTurn(sid, text, onEvent, config);
			await this.notify(sid, { type: "start", said: text, source: config.source ?? "typed" });
			try {
				const done = await this.runTurn(sid, text, async (e) => { await onEvent(e); await this.notify(sid, e); }, config);
				await this.notify(sid, { type: "done", done });
				return done;
			} catch (e) {
				await this.notify(sid, { type: "failed", error: String((e as Error)?.message ?? e) });
				throw e;
			}
		};
		const next = prev.then(run, run);
		this.chains.set(sid, next.catch(() => {}));
		return next;
	}

	private async runTurn(sid: string, said: string, onEvent: (event: TurnEvent) => void | Promise<void>, config: ChatConfig): Promise<TurnDone> {
		const t0 = performance.now();
		await this.refreshApps();
		const conv = await this.chat(sid, config);
		const chat = ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) ?? initialChat();
		const newest = async () => ((await conv.entries({ order: "descending" } as never, 1, undefined, ctx)).items[0]?.id as unknown as number) ?? 0;
		let cursor = await newest();
		const model = config.model ?? this.options.model;
		const quick = (reply: string, stop: TurnDone["stop"]): TurnDone => ({ reply, stop, model, endCall: false, timings: { first_token: (performance.now() - t0) / 1000, total: (performance.now() - t0) / 1000 }, usage: { input: 0, output: 0, cost: 0 }, tools: [] });

		let fresh = false; // does this turn start a run of its own (rather than carry on the one that was waiting)?
		if (chat.pending) {
			// Something is waiting on Jae (a dangerous call, or a step of a long job): what he says now is his answer.
			const pending = chat.pending;
			const yes = YES.test(said);
			await this.harness.commit(async (tx) => {
				const doc = await tx.doc(TalkChat, conv.id);
				doc.decisions[pending.callId] = { yes, said, question: pending.question };
				doc.pending = null;
			}, ctx);
			if (!yes && !chat.working && this.options.registry.resolve(pending.name).tool?.kind === "danger") {
				// Not a yes: the waiting call ends its run there, without the model, and what Jae said is an ordinary turn
				// after it. The model then reads "asked, not done" followed by his own words, as a person would.
				await conv.abort(ctx);
				this.parked.settle(`${conv.id}:${pending.callId}`, { yes, said });
				cursor = await newest();
				fresh = true;
			} else {
				await conv.submit({ type: "write", entry: { kind: "talk.user", data: { text: said, answers: pending.callId } } } as never, ctx);
				cursor = await newest();
				if (yes) await onEvent({ type: "tool", text: `${this.describe(pending.name, pending.args)}  ✓ confirmed`, name: pending.name, args: pending.args, callId: pending.callId });
				if (!this.parked.settle(`${conv.id}:${pending.callId}`, { yes, said })) this.harness.resume();
			}
			if (chat.working) {
				// The job carries on in the background and reports when it is done; this turn only took the answer.
				const reply = yes ? "Okay." : "Okay, I've told it no.";
				await onEvent({ type: "token", text: reply });
				return quick(reply, "answered");
			}
		} else if (chat.working) {
			// A long job is running on this chat and holds its run. Say where it has got to; it reports when it ends.
			const reply = chat.working.status;
			await onEvent({ type: "token", text: reply });
			return quick(reply, "working");
		} else fresh = true;
		if (fresh) {
			await this.harness.commit(async (tx) => {
				const doc = await tx.doc(TalkChat, conv.id);
				doc.turn += 1;
				doc.seen = doc.seen.filter((s) => s.turn >= doc.turn - 1) as never;
				doc.endCall = false;
			}, ctx);
			const submission = await conv.submit({ type: "input", content: said }, ctx);
			await this.harness.commit(async (tx) => {
				(await tx.doc(TalkChat, conv.id)).runSubmission = submission.id as never;
			}, ctx);
		}
		const done = await this.follow(sid, conv, cursor, onEvent, model, t0, false, { said, source: config.source ?? "typed" });
		if (done.stop === "working") void this.background(sid, conv, done.cursor, model);
		return done;
	}

	/** Listeners for what a chat says when nobody asked: a long job finishing, or its question for Jae. */
	private listeners = new Map<string, Set<(event: TurnEvent | { type: "done"; done: TurnDone }) => void>>();
	listen(sid: string, listener: (event: TurnEvent | { type: "done"; done: TurnDone }) => void): () => void {
		const set = this.listeners.get(sid) ?? new Set();
		this.listeners.set(sid, set);
		set.add(listener);
		return () => set.delete(listener);
	}

	/** A long job holds the run after its turn ended. Keep following it, and tell whoever is listening what happens. */
	private async background(sid: string, conv: Conversation, cursor: number, model: string): Promise<void> {
		const emit = (event: TurnEvent | { type: "done"; done: TurnDone }) => {
			for (const l of this.listeners.get(sid) ?? []) l(event);
			void this.notify(sid, event);
		};
		try {
			for (;;) {
				const done = await this.follow(sid, conv, cursor, emit, model, performance.now(), true);
				cursor = done.cursor;
				emit({ type: "done", done });
				if (done.stop !== "asked") return;
				// Wait for Jae's answer (a turn records it), then carry on following.
				const watch = (await this.harness.watchDoc(TalkChat, conv.id, ctx))!;
				await new Promise<void>((resolve) => {
					if (!(watch.value as ChatState | undefined)?.pending) resolve();
					watch.start(async (call) => {
						if (call.kind === "value" && !(call.value as ChatState | undefined)?.pending) resolve();
					});
				});
				await watch.stop();
			}
		} catch (e) {
			if (!this.closed) console.error("talk-next: a background job could not be followed:", String((e as Error)?.message ?? e).slice(0, 200));
		}
	}

	/**
	 * Follow a chat's run from `cursor`: entries as they are committed and the answer as it streams, until the run
	 * answers or fails, something needs Jae (asked), or a long job takes the run over (working; a background follow
	 * ignores that, since it is why it is following).
	 */
	private async follow(sid: string, conv: Conversation, cursor: number, onEvent: (event: TurnEvent) => void | Promise<void>, model: string, t0: number, background: boolean, turn: { said: string; source: string } = { said: "", source: "unasked" }): Promise<TurnDone & { cursor: number }> {
		const startedMs = Date.now();
		const chat = ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) ?? initialChat();
		const usageBefore = await this.harness.snapshot(UsageDoc, conv.id, ctx);
		let lastEntry = cursor;
		const hold = new Hold(this.options.holdChars ?? HOLD_CHARS);
		const tools: TurnDone["tools"] = [];
		const changes = new Map<string, { name: string; args: JsonObject }>();
		let reply = "";
		let firstToken: number | undefined;
		let streamed = ""; // the current model step's text, as far as it has been taken
		let aborted = false;
		const say = async (piece: string) => {
			if (!piece) return;
			firstToken ??= (performance.now() - t0) / 1000;
			reply += piece;
			await onEvent({ type: "token", text: piece });
		};
		const takeText = async (full: string) => {
			if (full.length > streamed.length && full.startsWith(streamed)) {
				const delta = full.slice(streamed.length);
				streamed = full;
				await say(hold.text(delta));
			}
		};
		const takeEntry = async (entry: EntryRecord) => {
			const message = (entry as { model?: readonly any[] }).model?.[0];
			if (entry.kind === "pi.assistant" && message?.role === "assistant") {
				const calls = (message.content as any[]).filter((c) => c.type === "toolCall");
				await takeText(textOf(message.content));
				streamed = "";
				if (!calls.length) return;
				if (calls.every((c) => c.name === CALL_END)) await say(hold.keep());
				else if (calls.every((c) => c.name === STAY_QUIET)) hold.silence();
				else hold.tool();
				for (const c of calls) {
					if (c.name === STAY_QUIET) continue; // not a lookup: nothing to show
					tools.push({ name: c.name, args: c.arguments ?? {}, outcome: "called" });
					// A change is shown once its outcome is known: a held or refused call must not read as one that ran.
					const kind = this.options.registry.resolve(c.name).tool?.kind;
					if (kind === "write" || kind === "danger") changes.set(c.id, { name: c.name, args: c.arguments ?? {} });
					else await onEvent({ type: "tool", text: this.describe(c.name, c.arguments ?? {}), name: c.name, args: c.arguments ?? {}, callId: c.id });
				}
			} else if (entry.kind === "pi.user" && typeof message?.content === "string" && message.content.startsWith(NOTE)) {
				hold.tool(); // Talk sent the model back to work: what it had said so far was not the answer
			} else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
				const row = [...tools].reverse().find((t) => t.name === message.toolName && t.outcome === "called");
				const details = message.details as ToolDetails | undefined;
				if (row) row.outcome = message.isError ? "error" : (details?.outcome ?? "ok");
				const change = changes.get(message.toolCallId);
				// After a refused change the model sometimes answers as if it were done; from here on its words are held
				// until the step ends, so Talk's note can send it back to the tool before anything is spoken.
				if (change && message.isError) hold.limit = Math.max(hold.limit, HOLD_CHARS);
				if (change) {
					changes.delete(message.toolCallId);
					const shown = details?.args ?? change.args;
					await onEvent({ type: "tool", text: this.describe(change.name, shown) + (message.isError ? "  (not done, waiting)" : ""), name: change.name, args: shown, callId: message.toolCallId });
				}
				await onEvent({ type: "result", name: message.toolName, callId: message.toolCallId, isError: Boolean(message.isError), details, text: textOf(message.content) });
			}
		};
		const drain = async () => {
			for (;;) {
				const page = await conv.entries({ minEntryId: lastEntry + 1, order: "ascending" } as never, 100, undefined, ctx);
				for (const entry of page.items) {
					lastEntry = entry.id as unknown as number;
					await takeEntry(entry);
				}
				if (page.items.length < 100) return;
			}
		};

		let wake: (why: "asked" | "working" | "aborted") => void = () => {};
		let woke: "asked" | "working" | "aborted" | undefined;
		const woken = new Promise<"woken">((resolve) => {
			wake = (why) => {
				woke ??= why;
				resolve("woken");
			};
		});
		const watch = await conv.watch(ctx, { min: 1, max: 2 } as never);
		const chatWatch = (await this.harness.watchDoc(TalkChat, conv.id, ctx))!;
		let queue: Promise<void> = Promise.resolve();
		watch.start(async (call) => {
			if (call.kind !== "value") return;
			const live = (call.value as any).docs?.["pi.live"];
			queue = queue.then(async () => {
				await drain();
				const partial = live?.generation?.message?.content;
				if (partial) await takeText(textOf(partial));
			});
			await queue;
		});
		const look = (state: ChatState | undefined) => {
			if (state?.pending) wake("asked");
			else if (state?.working && !background) wake("working");
		};
		chatWatch.start(async (call) => {
			if (call.kind === "value") look(call.value as ChatState | undefined);
		});
		look(chatWatch.value as ChatState | undefined);
		if (!background) this.running.set(sid, { abort: () => { aborted = true; wake("aborted"); } });

		let stop: TurnDone["stop"] = "answered";
		let error: string | undefined;
		try {
			const submissionId = chat.runSubmission as number | null;
			const submission = submissionId == null ? undefined : await this.harness.submission(submissionId as never, ctx);
			const settled = submission ? submission.wait(ctx) : conv.waitForIdle(ctx).then(() => undefined);
			const first = await Promise.race([settled, woken]);
			await watch.stop();
			await chatWatch.stop();
			await queue;
			await drain();
			const now = ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) ?? chat;
			if (first === "woken" && (aborted || woke === "aborted")) stop = "aborted";
			else if (first === "woken" && woke === "asked" && now.pending) {
				stop = "asked";
				hold.tool(); // whatever the model said on the way to the call is not the question
				const pending = now.pending;
				changes.delete(pending.callId);
				await onEvent({ type: "tool", text: `${this.describe(pending.name, pending.args)}  (waiting for your yes)`, name: pending.name, args: pending.args, callId: pending.callId });
				await onEvent({ type: "ask", question: pending.question });
				await say(pending.question);
			} else if (first === "woken" && woke === "working" && now.working) {
				stop = "working";
				hold.tool();
				await say(now.working.started);
			} else {
				const s = (first === "woken" ? await settled : first) as { status?: string; reason?: string; detail?: string } | undefined;
				await drain();
				await say(hold.end());
				if (s && s.status !== "done") {
					stop = s.reason === "aborted" ? "aborted" : "failed";
					if (stop === "failed") {
						error = s.reason === "turn_limit" ? "I took too many steps on that and stopped. Ask me again, a bit more narrowly."
							: `I couldn't answer that (${s.reason}${s.detail ? `: ${String(s.detail).slice(0, 160)}` : ""}).`;
						if (!reply.trim()) await say(error);
					}
				}
			}
		} finally {
			if (!background) this.running.delete(sid);
		}

		const usageAfter = await this.harness.snapshot(UsageDoc, conv.id, ctx);
		const sum = (u: typeof usageAfter) => Object.values(u?.models ?? {}).reduce((a, m: any) => ({ input: a.input + (m.input ?? 0), output: a.output + (m.output ?? 0), cost: a.cost + (m.cost?.total ?? 0) }), { input: 0, output: 0, cost: 0 });
		const [b, a] = [sum(usageBefore), sum(usageAfter)];
		const after = ((await this.harness.snapshot(TalkChat, conv.id, ctx)) as ChatState | undefined) ?? chat;
		const done = {
			reply: reply.trim(),
			stop,
			error,
			model,
			endCall: Boolean(after.endCall),
			timings: { first_token: firstToken, total: (performance.now() - t0) / 1000 },
			usage: { input: a.input - b.input, output: a.output - b.output, cost: a.cost - b.cost },
			tools,
		};
		// The turn as the person saw it, kept in the transcript: screens (the chat, the Trajectory, an export) are drawn
		// from these records and the entries between them, so a chat reopened later shows exactly what happened.
		const record: TurnRecord = {
			v: 1, at: new Date(startedMs).toISOString(), startedMs, said: turn.said, source: turn.source, reply: done.reply, stop, error: error ?? null,
			model, agent: after.agent, timings: { ...(firstToken === undefined ? {} : { first_token: round(firstToken) }), total: round(done.timings.total) },
			usage: done.usage,
		};
		await conv.submit({ type: "write", entry: { kind: TURN_KIND, data: record } } as never, ctx);
		await this.harness.commit(async (tx) => {
			const row = (await tx.doc(TalkIndex)).chats[sid];
			if (!row) return;
			if (!row.first && turn.said) row.first = turn.said.slice(0, 200);
			row.lastAt = Date.now();
			if (done.reply) row.last = done.reply.slice(0, 200);
			row.turns = (row.turns ?? 0) + 1;
			if (after.pretend) row.test = true;
		}, ctx);
		const newest = ((await conv.entries({ order: "descending" } as never, 1, undefined, ctx)).items[0]?.id as unknown as number) ?? lastEntry;
		return { ...done, cursor: Math.max(lastEntry, newest) };
	}
}

export { appExtensionName, appOf };
