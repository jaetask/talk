import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import { VoiceLoop, withPhrases, type Brain, type SttProvider, type TtsProvider } from "../packages/pi-voice/src/index.ts";
import { createApi } from "./api.ts";
import { defaultApps, Registry } from "./apps/registry.ts";
import { APPS_ROOT, DATA, HOLD_CHARS, MODEL, PORT, PRETEND_WRITES, REPO, SEARXNG, UI_DIST, writesEnabled } from "./config.ts";
import { Engine, type ChatConfig, type TurnDone, type TurnEvent } from "./engine.ts";
import { codingExtension } from "./ext/coding.ts";
import { Parked } from "./ext/gate.ts";
import { researcherExtension, webExtension } from "./ext/web.ts";
import { ollamaModels, useModel } from "./models.ts";
import { createBots } from "./bots.ts";
import { Chats } from "./store.ts";
import { ASR_VOCAB, DEFAULT_GAP_MS, DEFAULT_SPEED, FILLERS, fixHeard, pronunciations, sttProvider, ttsProvider, voiceFor } from "./voice.ts";

type Socket = {
	cfg: Record<string, any>; sid: string; agent: string; busy: Promise<unknown>;
	heard?: { sid: string; stop: () => void }; voice?: { key: string; loop: VoiceLoop }; mic?: Promise<unknown>;
};

const BRAIN_ALIASES = new Set(["smart", "fast", "gemma", "default"]);

export type ServeOptions = {
	uiDist?: string; casesDir?: string;
	tts?: (provider: string) => TtsProvider; stt?: () => SttProvider;
	botConfig?: (agent: string) => ChatConfig;
};

export async function start(port = PORT) {
	mkdirSync(DATA, { recursive: true });
	const registry = new Registry(defaultApps());
	const web = { searxng: SEARXNG, cacheDir: join(DATA, "web") };
	const researcher = researcherExtension(web);
	const parked = new Parked();
	const coding = codingExtension({ registry, parked, appsRoot: APPS_ROOT, defaultRepo: REPO, worktrees: join(DATA, "worktrees") });
	const engine = await Engine.open({
		storage: join(DATA, "talk-next.sqlite"), models: ollamaModels((name) => registry.isHidden(name)), provider: "ollama", model: MODEL, registry, parked, holdChars: HOLD_CHARS,
		extra: [webExtension(web, researcher), coding], childOnly: [researcher],
	});
	await engine.syncApps();
	console.log(`apps: ${registry.status().map((a) => `${a.label}=${a.online ? `online, ${a.tools} read and ${a.writeTools} write tools` : "offline"}`).join(", ")}`);
	const server = serve(engine, port);
	console.log(`talk-next: http://127.0.0.1:${server.port} (model ${MODEL}, storage ${join(DATA, "talk-next.sqlite")})`);
	return { server, engine, registry };
}

export function serve(engine: Engine, port: number, options: ServeOptions = {}) {
	const registry = engine.options.registry;
	const chats = new Chats(engine);
	const sockets = new Set<ServerWebSocket<Socket>>();
	const newSid = (agent: string) => `${agent}-${crypto.randomUUID()}`;

	const chatConfig = (cfg: Record<string, any>): ChatConfig => {
		const pretend = Boolean(cfg.pretend_writes) || PRETEND_WRITES;
		const model = typeof cfg.model === "string" && cfg.model ? cfg.model : typeof cfg.brain === "string" && !BRAIN_ALIASES.has(cfg.brain) && cfg.brain.includes(":") ? cfg.brain : undefined;
		return {
			agent: cfg.agent,
			persona: cfg.personality ?? undefined,
			voice: cfg.voice,
			writes: pretend ? Boolean(cfg.writes) : cfg.writes !== false && writesEnabled(),
			pretend,
			onCall: Boolean(cfg.duplex),
			noConfirm: Boolean(cfg.no_confirm),
			fixtures: cfg.fixtures ?? null,
			fixturesOnly: Boolean(cfg.fixtures_only),
			model: model ? useModel(model) : undefined,
		};
	};

	const api = createApi({ engine, chats, uiDist: options.uiDist ?? UI_DIST, casesDir: options.casesDir ?? join(REPO, "cases") });

	const send = (ws: ServerWebSocket<Socket>, o: object) => void ws.send(JSON.stringify(o));
	const relay = (ws: ServerWebSocket<Socket>) => (e: TurnEvent) => {
		if (e.type === "token") send(ws, { type: "token", text: e.text });
		else if (e.type === "tool") send(ws, { type: "tool", text: e.text });
		else if (e.type === "result") {
			const d = e.details;
			send(ws, { type: "call", name: e.name, kind: d?.kind ?? registry.resolve(e.name).tool?.kind ?? "read", args: d?.args ?? {}, outcome: e.isError ? "error" : (d?.outcome ?? "ok"), duration_s: d ? d.ms / 1000 : undefined, result: e.text.slice(0, 2000) });
			if (d?.card && !e.isError) send(ws, { type: "card", card: d.card });
		} else if (e.type === "status") send(ws, { type: "status", text: e.text });
	};
	const round = (timings: object) => Object.fromEntries(Object.entries(timings).filter(([, v]) => v !== undefined).map(([k, v]) => [k, Math.round((v as number) * 100) / 100]));
	const doneMessage = (done: TurnDone | undefined, voice: object) => ({
		type: "done", call_end: done?.endCall ?? false, timings: round({ ...(done?.timings ?? {}), ...voice }), model: done?.model ?? engine.options.model, harness: "pi-durable", stop: done?.stop ?? "answered", usage: done?.usage ?? { input: 0, output: 0, cost: 0 },
	});

	function hear(ws: ServerWebSocket<Socket>, sid: string) {
		const s = ws.data;
		if (s.heard?.sid === sid) return;
		s.heard?.stop();
		s.heard = { sid, stop: engine.listen(sid, (e) => {
			if (e.type === "token") send(ws, { type: "token", text: e.text });
			else if (e.type === "tool") send(ws, { type: "tool", text: e.text });
			else if (e.type === "done") send(ws, { ...doneMessage(e.done, {}), unasked: true });
		}) };
	}

	let fillers = 0;
	const voiceOf = async (s: Socket) => {
		const provider = String(s.cfg.tts ?? process.env.TALK_NEXT_TTS ?? "kokoro");
		return { provider, voice: voiceFor(provider, s.cfg.voice ?? (await engine.agents.get(s.agent))?.voice) };
	};

	async function voiceLoop(ws: ServerWebSocket<Socket>): Promise<VoiceLoop> {
		const s = ws.data;
		const { provider, voice } = await voiceOf(s);
		const key = JSON.stringify([provider, voice, s.cfg.speed, s.cfg.gap_ms, s.cfg.end_ms, s.cfg.barge_rms]);
		if (s.voice?.key === key) return s.voice.loop;
		await s.voice?.loop.close();
		let last: TurnDone | undefined;
		const brain: Brain = {
			async *reply(text, { signal }) {
				const [sid, cfg] = [s.sid, chatConfig(s.cfg)];
				hear(ws, sid);
				const queue: (string | { aside: string } | null)[] = [];
				let wake: () => void = () => {};
				const forward = relay(ws);
				let said = false;
				const abort = () => void engine.abort(sid);
				signal.addEventListener("abort", abort);
				const turn = engine
					.turn(sid, text, (e) => {
						if (e.type === "token") {
							said = true;
							queue.push(e.text);
							wake();
						} else {
							if (e.type === "tool" && !said && registry.resolve(e.name).tool?.kind === "read") {
								said = true;
								queue.push({ aside: FILLERS[fillers++ % FILLERS.length] });
								wake();
							}
							forward(e);
						}
					}, { ...cfg, source: s.cfg.duplex ? "voice" : "typed" })
					.then((done) => { last = done; }, (e) => { queue.push(`Talk couldn't answer (${String((e as Error)?.message ?? e).slice(0, 160)}).`); })
					.finally(() => { queue.push(null); wake(); });
				try {
					for (;;) {
						while (!queue.length) await new Promise<void>((resolve) => { wake = resolve; });
						const piece = queue.shift()!;
						if (piece === null) return;
						yield piece;
					}
				} finally {
					signal.removeEventListener("abort", abort);
					await turn;
				}
			},
		};
		const speed = Number(s.cfg.speed) || DEFAULT_SPEED;
		const loop = new VoiceLoop({
			stt: (options.stt ?? sttProvider)(), tts: withPhrases((options.tts ?? ttsProvider)(provider), FILLERS, { voice, speed, pronunciations: pronunciations() }), brain, voice,
			speed, gapMs: s.cfg.gap_ms === undefined ? DEFAULT_GAP_MS : Number(s.cfg.gap_ms),
			pronunciations: pronunciations(), vocabulary: ASR_VOCAB, fixHeard,
			detector: s.cfg.end_ms ? { endMs: Number(s.cfg.end_ms) } : undefined,
			bargeRms: s.cfg.barge_rms === undefined ? undefined : Number(s.cfg.barge_rms),
			onAudio: (pcm) => void ws.send(pcm),
			onEvent: (e) => {
				if (e.type === "state") send(ws, { type: "state", state: e.state });
				else if (e.type === "heard") send(ws, { type: "user", text: e.text });
				else if (e.type === "token") send(ws, { type: "token", text: e.text });
				else if (e.type === "barge") send(ws, { type: "barge" });
				else if (e.type === "error") send(ws, { type: "error", text: e.text });
				else if (e.type === "done") {
					send(ws, { ...doneMessage(last, { asr: e.timings.asr, first_sentence: e.timings.first_sentence, first_audio: e.timings.first_audio, total: e.timings.total }), interrupted: e.interrupted });
					last = undefined;
				}
			},
		});
		s.voice = { key, loop };
		return loop;
	}

	const bots = createBots({
		engine, chats, casesDir: options.casesDir ?? join(REPO, "cases"),
		config: options.botConfig ?? ((agent) => chatConfig({ agent, ...(PRETEND_WRITES ? { writes: true } : {}) })),
		tts: (provider) => (options.tts ?? ttsProvider)(provider ?? (process.env.TALK_NEXT_TTS === "kokoro" || !process.env.TALK_NEXT_TTS ? "kokoro-http" : process.env.TALK_NEXT_TTS)),
		stt: options.stt ?? sttProvider,
		...(options.tts ? { voices: () => [{ id: "af_heart", name: "Heart" }, { id: "bf_emma", name: "Emma" }] } : {}),
	});

	const server = Bun.serve<Socket>({
		port,
		hostname: "127.0.0.1",
		async fetch(req, srv) {
			const url = new URL(req.url);
			if (url.pathname === "/ws") {
				const agent = "heart";
				return srv.upgrade(req, { data: { cfg: {}, sid: newSid(agent), agent, busy: Promise.resolve() } }) ? undefined : new Response("expected a websocket", { status: 400 });
			}
			if (url.pathname === "/health") return Response.json({ ok: true, service: "talk-next", engine: "pi-durable", model: engine.options.model, apps: registry.status() });
			try {
				return (await bots.handle(req, srv)) ?? (await api(req)) ?? new Response("not found", { status: 404 });
			} catch (e) {
				return Response.json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, { status: 500 });
			}
		},
		websocket: {
			idleTimeout: 0,
			open(ws) {
				sockets.add(ws);
			},
			close(ws) {
				sockets.delete(ws);
				ws.data.heard?.stop();
				void ws.data.voice?.loop.close();
			},
			async message(ws, raw) {
				const s = ws.data;
				if (typeof raw !== "string") {
					if (s.cfg.duplex) {
						const pcm = new Uint8Array(raw as unknown as ArrayBuffer);
						s.mic = (s.mic ?? Promise.resolve()).then(async () => (await voiceLoop(ws)).feed(pcm)).catch(() => {});
					}
					return;
				}
				let m: Record<string, any>;
				try {
					m = JSON.parse(raw);
				} catch {
					return;
				}
				const kind = m.type;
				if (kind === "stop" || kind === "barge") {
					await s.voice?.loop.interrupt();
					await engine.abort(s.sid);
					send(ws, { type: "stopped" });
					return;
				}
				const next = (work: () => Promise<void>) => {
					s.busy = s.busy.then(work).catch((e) => send(ws, { type: "error", text: `Talk couldn't do that (${String((e as Error)?.message ?? e).slice(0, 200)})` }));
				};
				if (kind === "config") {
					next(async () => {
						const { type: _t, new_session, ...rest } = m;
						const agent = rest.agent && (await engine.agents.get(rest.agent)) ? rest.agent : s.agent;
						if (typeof rest.sid === "string" && rest.sid) s.sid = `talk-${rest.sid}`;
						else if (typeof rest.session_id === "string" && rest.session_id) s.sid = rest.session_id;
						else if (new_session || agent !== s.agent) s.sid = newSid(agent);
						s.agent = agent;
						Object.assign(s.cfg, rest, { agent });
						if (rest.agent && rest.personality === undefined) delete s.cfg.personality;
						if (rest.agent || rest.session_id) send(ws, { type: "agent", agent: await engine.agents.get(agent), session_id: s.sid });
					});
					return;
				}
				if (kind === "scripted" && Array.isArray(m.turns)) return next(async () => send(ws, { type: "scripted", turns: await engine.scripted(s.sid, m.turns, chatConfig(s.cfg)) }));
				if (kind === "pretend_log") return next(async () => send(ws, { type: "pretend_log", writes: await engine.pretendLog(s.sid) }));
				if (kind === "reset") {
					return next(async () => {
						s.sid = newSid(s.agent);
						send(ws, { type: "agent", agent: await engine.agents.get(s.agent), session_id: s.sid });
					});
				}
				if (kind === "text" && typeof m.text === "string") {
					if (s.cfg.speak === true || s.cfg.duplex) {
						return next(async () => {
							await (await voiceLoop(ws)).say(m.text);
						});
					}
					next(async () => {
						const [sid, cfg] = [s.sid, chatConfig(s.cfg)];
						hear(ws, sid);
						const done = await engine.turn(sid, m.text, relay(ws), cfg);
						send(ws, doneMessage(done, {}));
					});
				}
			},
		},
	});
	const stopServer = server.stop.bind(server);
	server.stop = ((closeActive?: boolean) => {
		bots.close();
		return stopServer(closeActive);
	}) as typeof server.stop;
	return server;
}

if (import.meta.main) await start();
