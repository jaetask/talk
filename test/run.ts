import "./env.ts";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snap, table } from "@jaetask/snap";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { classifyTool, modelView, verbAndThing } from "../src/apps/classify.ts";
import { Catalog, compactGeneric, compactTasks, maskNumbers } from "../src/apps/compact.ts";
import { collectItems, question, refusal, resolve, YES } from "../src/apps/gate.ts";
import { parseSkill, readOnlySkill } from "../src/apps/skills.ts";
import { Hold } from "../src/hold.ts";
import { ollamaModel, ollamaStream, toWire } from "../src/model/ollama.ts";
import { shownTools } from "../src/models.ts";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { Registry } from "../src/apps/registry.ts";
import { codingExtension } from "../src/ext/coding.ts";
import { Parked } from "../src/ext/gate.ts";
import { researcherExtension, webExtension } from "../src/ext/web.ts";
import { serve } from "../src/server.ts";
import { Chats } from "../src/store.ts";
import { readerExtension } from "../src/ext/reader.ts";
import { findSection, matchFile, splitSections, spokenSentences } from "../src/reader/articles.ts";
import { splitSentences } from "../packages/pi-voice/src/index.ts";
import { checkUrl, runWebTool } from "../src/web/read.ts";
import { fakeMoney, fakeTasks, fakeWeb, scripted, turn } from "./support.ts";

const here = new URL("./cases/", import.meta.url).pathname;
const mask = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
const code = (v: unknown) => "```json\n" + mask(JSON.stringify(v, null, 2)) + "\n```";

async function conversation(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const tasks = fakeTasks();
	const money = c.apps?.includes("money") ? fakeMoney() : undefined;
	const { engine, faux } = await scripted(c.script, [{ name: "tasks", label: "Tasks", url: tasks.url }, ...(money ? [{ name: "money", label: "Money", url: money.url }] : [])]);
	const out = [`# ${name}`, "", c.about ?? "", ""];
	try {
		for (const t of c.turns) {
			if (t.saveAgent) {
				const saved = await engine.agents.save(t.saveAgent.id, t.saveAgent.change);
				out.push(`## Settings: ${saved.name} is changed`, "", code(saved), "");
				continue;
			}
			if (t.scripted) {
				out.push(`## Written into the chat, no model call: ${await engine.scripted(t.sid ?? "chat", t.scripted)} turn`, "", ...t.scripted.map((x: { say: string; reply: string }) => `- "${x.say}" answered "${x.reply}"`), "");
				continue;
			}
			out.push(`## ${t.sid ?? "chat"}: "${t.say}"`, "");
			const { lines, done } = await turn(engine, t.sid ?? "chat", t.say, t.config ?? {});
			out.push(...lines.map((l) => `- ${mask(l)}`));
			if (t.show?.includes("context")) {
				const seen = (await (await engine.conversationOf(t.sid ?? "chat"))!.context(ctx)).entries.flatMap((e: any) => (e.model ?? []).filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => `${m.role}: ${typeof m.content === "string" ? m.content : m.content.map((c: any) => c.text ?? "").join("")}`));
				out.push("- what the model had in front of it:", ...seen.map((l: string) => `  - ${l}`));
			}
			if (t.show?.includes("transcript")) {
				const seen = (await (await engine.conversationOf(t.sid ?? "chat"))!.context(ctx)).entries.flatMap((e: any) => (e.model ?? []).map((m: any) =>
					m.role === "toolResult" ? `result of ${m.toolName}: ${m.content.map((c: any) => c.text ?? "").join("").replace(/\s+/g, " ").slice(0, 400)}`
					: `${m.role}: ${typeof m.content === "string" ? m.content : m.content.map((c: any) => (c.type === "toolCall" ? `[calls ${c.name}]` : (c.text ?? ""))).join("")}`));
				out.push("- the transcript the model is sent next:", ...seen.map((l: string) => `  - ${mask(l)}`));
			}
			if (t.show?.includes("usage")) out.push(`- usage: model calls so far ${faux.state.callCount}, cost ${done.usage.cost}`);
			out.push("");
		}
		const reached = (app: { calls: { name: string; args: unknown }[] }) => app.calls.filter((x) => x.name !== "catalog-read" || c.showCatalog).map(({ name: n, args }) => ({ tool: n, args }));
		out.push("## What reached Tasks", "", reached(tasks).length ? code(reached(tasks)) : "Nothing.", "");
		if (money) out.push("## What reached Money", "", reached(money).length ? code(reached(money)) : "Nothing.", "");
		if (c.pretendLog) out.push("## Pretend writes", "", code(await engine.pretendLog(c.pretendLog)), "");
	} finally {
		await engine.close();
		tasks.stop();
		money?.stop();
	}
	return out.join("\n");
}

async function protocol(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const tasks = fakeTasks();
	const { engine } = await scripted(c.script, [{ name: "tasks", label: "Tasks", url: tasks.url }]);
	const server = serve(engine, 0);
	const out = [`# ${name}`, "", c.about ?? "", ""];
	try {
		const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
		await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
		const inbox: any[] = [];
		let wake = () => {};
		ws.onmessage = (e) => { inbox.push(JSON.parse(String(e.data))); wake(); };
		const until = async (type: string) => {
			for (;;) {
				const i = inbox.findIndex((m) => m.type === type);
				if (i >= 0) return inbox.splice(0, i + 1);
				await new Promise<void>((resolve) => { wake = resolve; });
			}
		};
		for (const step of c.steps) {
			ws.send(JSON.stringify(step.send));
			out.push(`## sent ${JSON.stringify(step.send)}`, "");
			if (!step.until) continue;
			for (const m of await until(step.until)) {
				if (m.type === "done") out.push(`- done: stop ${m.stop}, harness ${m.harness}, model ${m.model}, call_end ${m.call_end}, timings ${Object.keys(m.timings).sort().join("+")}, usage ${Object.keys(m.usage).sort().join("+")}`);
				else if (m.type === "call") out.push(`- call: ${m.name} (${m.kind}) ${m.outcome} ${mask(JSON.stringify(m.args))}`);
				else if (m.type === "card") out.push(`- card: ${m.card.name} drawn as ${m.card.view}`);
				else out.push(`- ${m.type}: ${mask(JSON.stringify(m.text ?? m.writes ?? m))}`);
			}
			out.push("");
		}
		ws.close();
	} finally {
		server.stop(true);
		await engine.close();
		tasks.stop();
	}
	return out.join("\n");
}

async function web(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const site = fakeWeb();
	const dir = join(tmpdir(), `talk-next-web-${crypto.randomUUID()}`);
	const port = new URL(site.base).port;
	const fill = <T,>(v: T): T => JSON.parse(JSON.stringify(v).replaceAll("{web}", site.base));
	const tidy = (s: string) => mask(s).replaceAll(site.base, "http://web.test");
	const options = {
		searxng: c.searchDown ? "http://127.0.0.1:9" : site.base, cacheDir: join(dir, "web"), filesDir: join(dir, "files"), researchSeconds: 20, today: () => "2026-11-19",
		resolve: async (url: string) => (new URL(url).port === port && new URL(url).hostname === "127.0.0.1" ? url : checkUrl(url)),
	};
	const out = [`# ${name}`, "", c.about ?? "", ""];
	try {
		if (c.tools) {
			for (const t of fill(c.tools) as { name: "web_search" | "web_read"; args: object }[]) {
				const res = await runWebTool(t.name, t.args as never, options);
				out.push(`## ${t.name} ${tidy(JSON.stringify(t.args))}`, "", code(JSON.parse(tidy(res.text))), "");
			}
			return out.join("\n");
		}
		const researcher = researcherExtension(options);
		const { engine } = await scripted(fill(c.script), [], "memory", { extra: [webExtension(options, researcher)], childOnly: [researcher] });
		try {
			for (const t of c.turns) {
				out.push(`## "${t.say}"`, "", ...(await turn(engine, "chat", t.say, t.config ?? {})).lines.map((l) => `- ${tidy(l)}`), "");
			}
			const conv = (await engine.conversationOf("chat"))!;
			const page = await conv.entries({ order: "ascending" } as never, 100, undefined, ctx);
			const result = page.items.map((e: any) => e.model?.[0]).filter((m: any) => m?.role === "toolResult" && m.toolName === "web_research").pop();
			if (result) out.push("## What the research tool gave the model", "", code(JSON.parse(tidy(result.content[0].text))), "");
			for (const f of existsSync(options.filesDir) ? readdirSync(options.filesDir) : []) out.push(`## Saved file ${f}`, "", "```markdown", tidy(readFileSync(join(options.filesDir, f), "utf8")).trim(), "```", "");
		} finally {
			await engine.close();
		}
	} finally {
		site.stop();
		rmSync(dir, { recursive: true, force: true });
	}
	return out.join("\n");
}

async function coding(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const dir = mkdtempSync(join(tmpdir(), "talk-next-coding-"));
	const work = join(dir, "scratch");
	mkdirSync(work, { recursive: true });
	const tasks = fakeTasks();
	const parked = new Parked();
	const registry = new Registry([{ name: "tasks", label: "Tasks", url: tasks.url, about: "Tasks" }]);
	const out = [`# ${name}`, "", c.about ?? "", ""];
	const { engine } = await scripted(c.script, [], "memory", {
		registry, parked,
		extra: [codingExtension({
			registry, parked, appsRoot: dir, defaultRepo: join(dir, "talk"), worktrees: dir, makeWorktree: () => work,
			command: ["env", `FAKE_ACP=${c.agent ?? ""}`, "bun", new URL("./fixtures/fake-acp-agent.ts", import.meta.url).pathname],
		})],
	});
	try {
		const heard: any[] = [];
		let wake = () => {};
		engine.listen("chat", (e) => { heard.push(e); wake(); });
		for (const step of c.steps) {
			if (step.say) {
				out.push(`## "${step.say}"`, "", ...(await turn(engine, "chat", step.say, step.config ?? {})).lines.map((l) => `- ${mask(l).replaceAll(dir, "<tmp>")}`), "");
				continue;
			}
			out.push(`## Unasked: the session ${step.wait === "asked" ? "needs Jae" : "reports"}`, "");
			for (;;) {
				const i = heard.findIndex((e) => e.type === "done");
				if (i >= 0) {
					for (const e of heard.splice(0, i + 1)) {
						if (e.type === "ask") out.push(`- ask: ${e.question}`);
						else if (e.type === "result") out.push(`- result: ${e.name} ${e.isError ? "error" : "ok"} ${mask(e.text).replaceAll(dir, "<tmp>").slice(0, 400)}`);
						else if (e.type === "done") out.push(`- reply (${e.done.stop}): ${e.done.reply}`);
					}
					break;
				}
				const waited = await Promise.race([new Promise<"heard">((resolve) => { wake = () => resolve("heard"); }), new Promise<"late">((resolve) => setTimeout(() => resolve("late"), 20_000))]);
				if (waited === "late") throw new Error(`nothing arrived for "${step.wait}" within 20 seconds`);
			}
			out.push("");
		}
	} finally {
		await engine.close();
		tasks.stop();
		rmSync(dir, { recursive: true, force: true });
	}
	return out.join("\n");
}

async function views(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const tasks = fakeTasks();
	const { engine } = await scripted(c.script, [{ name: "tasks", label: "Tasks", url: tasks.url }]);
	const chats = new Chats(engine);
	const quiet = (v: unknown) => mask(JSON.stringify(v, null, 2))
		.replace(/"(at|redacted_at|createdAt|started_at|last_at|pinned_at)": "\d{4}-[^"]+"/g, '"$1": "<when>"')
		.replace(/"timings": \{[^}]*\}/g, '"timings": "<timings>"')
		.replace(/"(startedMs|start_s|duration_s|ms)": [\d.]+/g, '"$1": "<n>"');
	const out = [`# ${name}`, "", c.about ?? "", ""];
	try {
		for (const t of c.turns) await turn(engine, "chat", t.say, t.config ?? {});
		const first = async () => (await chats.timeline("chat"))!;
		for (const step of c.show as string[]) {
			const timeline = await first();
			if (step === "timeline") out.push("## Timeline (what the Trajectory is given)", "", "```json", quiet(timeline.turns.map(({ spans, ...t }) => ({ ...t, spans: spans.map((s) => s.kind).join(", ") }))), "```", "", `Chat total: ${timeline.session.usage.turns_counted ? `${timeline.session.usage.tokens_in} tokens in, ${timeline.session.usage.tokens_out} out over ${timeline.session.usage.turns_counted} turns` : "nothing counted"}.`, "");
			else if (step === "messages") out.push("## Messages (what the chat is given)", "", "```json", quiet(await chats.messages("chat")), "```", "");
			else if (step === "export") out.push("## Export", "", `${(await chats.export("chat"))!.trim().split("\n").length} lines: the session, then one per turn. First line: \`${quiet(JSON.parse((await chats.export("chat"))!.split("\n")[0])).replace(/\s+/g, " ")}\``, "");
			else if (step === "case") out.push("## Make test (a draft Dojo case from the last turn)", "", "```json", quiet(await chats.draftCase(timeline.turns.at(-1)!.id, "golden")), "```", "");
			else if (step === "redact-first") {
				await chats.redactTurn(timeline.turns[0].id);
				out.push("## After clearing the first turn", "", ...(await chats.messages("chat"))!.map((m) => `- ${m.role}: ${m.parts.map((p) => (p.type === "text" ? p.text : `[card ${p.widget.title}]`)).join(" ")}`), "");
			} else if (step === "clear") {
				await chats.clear("chat");
				const conv = (await engine.conversationOf("chat"))!;
				const seen = (await conv.context(ctx)).entries.filter((e: any) => e.kind === "pi.user" || e.kind === "pi.assistant").length;
				out.push("## After Clear chat", "", ...(await chats.messages("chat"))!.map((m) => `- ${m.role}: ${m.parts.map((p) => (p.type === "text" ? p.text : `[card ${p.widget.title}]`)).join(" ")}`), "", `What the model still sees of it: ${seen} messages.`, "");
			} else if (step === "list") out.push("## The chat in the list", "", "```json", quiet(await chats.list({ tests: c.tests })), "```", "");
		}
	} finally {
		await engine.close();
		tasks.stop();
	}
	return out.join("\n");
}

async function page(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const tasks = fakeTasks();
	const dir = mkdtempSync(join(tmpdir(), "talk-next-page-"));
	const files = new URL("./fixtures/files", import.meta.url).pathname;
	const out = [`# ${name}`, "", c.about ?? "", ""];
	const tone = (ms: number) => new Uint8Array(new Int16Array(Array.from({ length: Math.round(ms * 24) }, (_, i) => Math.round(6000 * Math.sin(i / 8)))).buffer);
	const tts = () => ({ name: "fake", sampleRate: 24000, async *synthesize(text: string) { yield tone(Math.min(400, 60 + text.length * 4)); } });
	const quiet = (v: unknown) => mask(JSON.stringify(v, null, 2))
		.replace(/"(at|createdAt|updatedAt|started_at|last_at|pinned_at|startedAt|completedAt|occurredAt)": "\d{4}-[^"]+"/g, '"$1": "<when>"')
		.replace(/"timings": \{[^}]*\}/g, '"timings": "<timings>"').replace(/"(startedMs|start_s|duration_s|ms)": [\d.]+/g, '"$1": "<n>"').replaceAll(dir, "<tmp>");
	const researcher = researcherExtension({ searxng: "http://127.0.0.1:9", cacheDir: join(dir, "web"), filesDir: files });
	const { engine } = await scripted(c.script ?? [], [{ name: "tasks", label: "Tasks", url: tasks.url }], "memory", { extra: [readerExtension({ filesDir: files })], childOnly: [researcher] });
	const server = serve(engine, 0, { filesDir: files, uiDist: join(dir, "no-ui"), casesDir: join(dir, "cases"), tts });
	const base = `http://127.0.0.1:${server.port}`;
	try {
		for (const step of c.steps ?? []) {
			if (step.http) {
				const [method, path] = step.http.split(" ");
				const res = await fetch(base + path, { method, ...(step.body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(step.body) } : {}) });
				const text = await res.text();
				let shown: unknown = text;
				try { shown = JSON.parse(text); } catch { const n = text.trim().split("\n").length; shown = `${res.headers.get("content-type")}: ${n} line${n === 1 ? "" : "s"}${text.length < 200 ? `: ${text.trim()}` : ""}`; }
				if (step.pick) shown = step.pick.split(".").reduce((v: any, k: string) => (Array.isArray(v) && k === "*" ? v : Array.isArray(v) ? v.map((x) => x?.[k]) : v?.[k]), shown);
				out.push(`## ${step.http}${step.body ? ` ${JSON.stringify(step.body)}` : ""}${step.pick ? ` (${step.pick})` : ""}`, "", `${res.status}`, "", "```json", quiet(shown), "```", "");
			} else if (step.ws) {
				const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
				ws.binaryType = "arraybuffer";
				await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
				const got: string[] = [];
				let audio = 0;
				let wake = () => {};
				let last: any;
				ws.onmessage = (e) => {
					if (typeof e.data !== "string") { audio += (e.data as ArrayBuffer).byteLength; return; }
					last = JSON.parse(e.data);
					if (last.type === "token") { if (got.at(-1)?.startsWith("says: ")) got[got.length - 1] += last.text; else got.push(`says: ${last.text}`); }
					else if (last.type === "article_sentence") got.push(`  reads [${last.index}.${last.sentence}] ${last.text}`);
					else if (last.type === "article") got.push(`article: ${last.slug} at section ${last.index}${last.playing ? ", reading" : ", not reading"}${last.finished ? " (finished)" : ""}`);
					else if (last.type === "done") got.push(`done (${last.stop})`);
					else if (!["call", "agent", "state"].includes(last.type)) got.push(`${last.type}: ${mask(JSON.stringify(last.text ?? last.slug ?? ""))}`);
					wake();
				};
				for (const m of step.ws as any[]) {
					if (m.until) {
						const hit = () => (m.until === "finished" ? last?.type === "article" && last.finished : m.until === "paused" ? last?.type === "article" && !last.playing : last?.type === m.until);
						const deadline = Date.now() + 20_000;
						while (!hit()) {
							if (Date.now() > deadline) throw new Error(`nothing arrived for "${m.until}"`);
							await Promise.race([new Promise<void>((resolve) => { wake = resolve; }), new Promise((resolve) => setTimeout(resolve, 500))]);
						}
						last = undefined;
					} else if (m.waitMs) await new Promise((resolve) => setTimeout(resolve, m.waitMs));
					else { got.push(`> ${JSON.stringify(m)}`); ws.send(JSON.stringify(m)); }
				}
				ws.close();
				out.push("## Over the websocket", "", "```", ...got, "```", "", audio ? "Audio was sent for what was read." : "No audio was sent.", "");
			}
		}
	} finally {
		server.stop(true);
		await engine.close();
		tasks.stop();
		rmSync(dir, { recursive: true, force: true });
	}
	return out.join("\n");
}

function reader(input: string, name: string): string {
	const c = JSON.parse(input);
	const sections = splitSections(c.markdown);
	const article = { slug: "file", title: sections.find((s) => s.level === 1)?.title ?? "File", sections };
	const out = [`# ${name}`, "", "## Sections", "", table(["order", "level", "title", "under", "id"], sections.map((s) => [String(s.order), String(s.level), s.title, s.parent ?? "", s.id])), ""];
	out.push("## What is read aloud", "", ...sections.flatMap((s) => spokenSentences(s, splitSentences).map((line) => `- [${s.order}] ${line.say}${line.shown ? `  (highlights: ${line.shown})` : ""}`)), "");
	if (c.find) out.push("## Finding a section", "", table(["asked for", "found"], (c.find as string[]).map((q) => { const f = findSection(q, article); return [q, f.ambiguous ? `ambiguous: ${f.ambiguous.map((k) => sections[k].title).join(" / ")}` : f.index === undefined ? "nothing" : sections[f.index].title]; })), "");
	if (c.files) out.push("## Finding a file", "", table(["asked for", "found"], (c.ask as string[]).map((q) => { const f = matchFile(q, (c.files as string[]).map((t) => ({ slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title: t, sections: [] }))); return [q, f.ambiguous ? `ambiguous: ${f.ambiguous.join(" / ")}` : (f.slug ?? "nothing")]; })), "");
	return out.join("\n");
}

async function durable(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const file = join(tmpdir(), `talk-next-test-${crypto.randomUUID()}.sqlite`);
	const tasks = fakeTasks();
	const out = [`# ${name}`, "", c.about ?? "", ""];
	try {
		for (const run of c.runs) {
			const { engine } = await scripted(run.script, [{ name: "tasks", label: "Tasks", url: tasks.url }], file);
			out.push("## The service starts", "");
			try {
				for (const t of run.turns) {
					out.push(`### "${t.say}"`, "");
					out.push(...(await turn(engine, "chat", t.say, t.config ?? {})).lines.map((l) => `- ${mask(l)}`), "");
				}
			} finally {
				await engine.close();
			}
		}
		out.push("## What reached Tasks", "", code(tasks.calls.filter((x) => x.name !== "catalog-read").map(({ name: n, args }) => ({ tool: n, args }))), "");
	} finally {
		tasks.stop();
		for (const ext of ["", "-wal", "-shm"]) rmSync(file + ext, { force: true });
	}
	return out.join("\n");
}

function classify(input: string): string {
	const tools: { name: string; annotations?: object }[] = JSON.parse(input);
	return table(["tool", "kind", "verb", "thing"], tools.map((t) => [t.name, classifyTool(t as never), ...verbAndThing(t.name)]));
}

function gate(input: string, name: string): string {
	const c = JSON.parse(input);
	const seen = c.results.flatMap((r: { app: string; tool: string; result: unknown }) => collectItems(r.app, typeof r.result === "string" ? r.result : JSON.stringify(r.result), r.tool));
	const rows = c.calls.map((call: { app: string; label: string; tool: string; args: object }) => {
		const { item, why } = resolve(call.app, call.args as never, seen, call.tool);
		return [`${call.tool} ${JSON.stringify(call.args)}`, item ? "ask" : "refuse", item ? question(call.label, call.tool, item) : JSON.parse(refusal(call.tool, why!)).instruction];
	});
	const yes = (c.answers ?? []).map((a: string) => [a, YES.test(a) ? "yes" : "not a yes"]);
	return [`# ${name}`, "", `Items the lookups returned: ${seen.map((s: { name: string }) => s.name).join(", ") || "none"}`, "", table(["dangerous call", "gate", "what is said"], rows), "",
		...(yes.length ? [table(["Jae says", "counts as"], yes), ""] : [])].join("\n");
}

async function ollama(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const opts = { baseUrl: "http://ollama.test", numCtx: 24576, maxReplyTokens: 1024, temperature: 0.6, keepAlive: "3h", deterministic: Boolean(c.deterministic) };
	const context = normalizeContext({ systemPrompt: c.system, messages: c.messages, tools: c.tools });
	let sent: any;
	const events: string[] = [];
	const fetchFake = (async (_url: string, init: RequestInit) => {
		sent = JSON.parse(String(init.body));
		return new Response((c.chunks as object[]).map((x) => JSON.stringify(x)).join("\n") + "\n", { status: c.status ?? 200 });
	}) as never;
	const shown = c.hidden ? (tools: never[], messages: never[]) => shownTools(tools, messages, (n) => c.hidden.includes(n)) : undefined;
	const stream = ollamaStream({ ...opts, fetch: fetchFake, shown: shown as never })(ollamaModel("test-model", opts) as never, context, {});
	for await (const e of stream) events.push(e.type + ("delta" in e ? ` ${JSON.stringify(e.delta)}` : "") + (e.type === "toolcall_end" ? ` ${e.toolCall.name} ${JSON.stringify(e.toolCall.arguments)}` : ""));
	const final = await stream.result();
	return [`# ${name}`, "", "## Request sent to /api/chat", "", code({ ...sent, messages: toWire(context) }), "", "## Events", "", ...events.map((e) => `- ${e}`), "",
		"## Final message", "", code({ stopReason: final.stopReason, content: final.content.map((x: any) => (x.type === "toolCall" ? { ...x, id: "<id>" } : x)), usage: { input: final.usage.input, output: final.usage.output }, errorMessage: final.errorMessage }), ""].join("\n");
}

function compact(input: string, name: string): string {
	const c = JSON.parse(input);
	const cat = new Catalog(c.catalog ?? []);
	const out = c.app === "tasks" ? compactTasks(c.tool, c.structured, "", cat) : c.app === "money" ? maskNumbers(compactGeneric(c.structured)) : compactGeneric(c.structured);
	return [`# ${name}`, "", `What the model sees of ${c.app}'s ${c.tool} (${out.length} characters):`, "", code(JSON.parse(out)), "", ...(c.catalog ? ["The names for the prompt:", "", "```", cat.promptBlock(), "```", ""] : [])].join("\n");
}

function skills(input: string, name: string): string {
	const c = JSON.parse(input);
	if (c.hold) {
		const hold = new Hold(c.limit ?? 300);
		const rows = c.hold.map((step: { text?: string; tool?: boolean; keep?: boolean; end?: boolean }) =>
			step.text !== undefined ? [`text ${JSON.stringify(step.text)}`, JSON.stringify(hold.text(step.text))]
			: step.tool ? ["tool call", (hold.tool(), "(held text dropped)")]
			: step.keep ? ["end the call", JSON.stringify(hold.keep())]
			: ["end of turn", JSON.stringify(hold.end())]);
		return [`# ${name}`, "", table(["step", "said now"], rows), ""].join("\n");
	}
	const skill = parseSkill(c.name, c.text);
	const tools = (c.tools ?? []).map((t: { name: string; kind: string }) => ({ ...t }));
	return [`# ${name}`, "", code({ description: skill.description, tools: skill.tools, topics: skill.topics, builders: skill.builders }), "", "## Body with changes switched off", "", "```", readOnlySkill(skill.body, tools), "```", ""].join("\n");
}

async function bots(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const tasks = fakeTasks();
	const dir = mkdtempSync(join(tmpdir(), "talk-next-bots-"));
	const files = new URL("./fixtures/files", import.meta.url).pathname;
	const out = [`# ${name}`, "", c.about ?? "", ""];
	const tone = (ms: number) => new Uint8Array(new Int16Array(Array.from({ length: Math.round(ms * 24) }, (_, i) => Math.round(6000 * Math.sin(i / 8)))).buffer);
	const tts = () => ({ name: "fake", sampleRate: 24000, async *synthesize(text: string) { yield tone(Math.min(400, 60 + text.length * 4)); } });
	const stt = () => ({ name: "fake", async transcribe(pcm: Uint8Array, rate: number) { return `(heard ${pcm.byteLength / 2 / rate} s of audio)`; } });
	const { engine } = await scripted(c.script ?? [], [{ name: "tasks", label: "Tasks", url: tasks.url }], "memory", { extra: [readerExtension({ filesDir: files })] });
	const server = serve(engine, 0, { filesDir: files, uiDist: join(dir, "no-ui"), casesDir: join(dir, "cases"), tts, stt, botConfig: (agent) => ({ agent, writes: true, pretend: true }) });
	const base = `http://127.0.0.1:${server.port}/api/v2`;
	const quiet = (v: unknown) => mask(JSON.stringify(v, null, 2)).replace(/"(updatedSeq|createdAt|lastActivityAt|since|startedAt|updatedAt|modifiedAt|serverTime|size)": \d+/g, '"$1": "<n>"').replace(/"(start|seconds)": [\d.]+/g, '"$1": "<n>"').replace(/"at": "\d{4}-[^"]+"/g, '"at": "<when>"');
	const events: any[] = [];
	const page = new Map<string, Map<number, any>>();
	let wake = () => {};
	const abort = new AbortController();
	const stream = (await fetch(`${base}/events`, { signal: abort.signal })).body!.getReader();
	const reading = (async () => {
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { value, done } = await stream.read().catch(() => ({ value: undefined, done: true }));
			if (done) return;
			buffer += decoder.decode(value, { stream: true });
			for (let i = buffer.indexOf("\n\n"); i >= 0; i = buffer.indexOf("\n\n")) {
				const e = JSON.parse(buffer.slice(0, i).replace(/^data: /, ""));
				buffer = buffer.slice(i + 2);
				if (e.type === "ping" || e.type === "hello") continue;
				if (e.type === "rows") {
					const rows = page.get(e.botId) ?? new Map();
					page.set(e.botId, rows);
					if (e.replace) for (const k of [...rows.keys()]) if (k >= e.replace[0] && k <= e.replace[1]) rows.delete(k);
					for (const r of e.rows) if (!rows.has(r.seq) || r.updatedSeq >= rows.get(r.seq).updatedSeq) rows.set(r.seq, r);
				} else if (e.type === "cleared") page.set(e.botId, new Map());
				events.push(e);
				wake();
			}
		}
	})();
	const until = async (hit: (e: any) => boolean, from: number) => {
		const deadline = Date.now() + 20_000;
		while (!events.slice(from).some(hit)) {
			if (Date.now() > deadline) throw new Error("the stream went quiet before the turn ended");
			await Promise.race([new Promise<void>((resolve) => { wake = resolve; }), new Promise((resolve) => setTimeout(resolve, 200))]);
		}
	};
	const rowLine = (r: any): string => {
		const b = r.body;
		const what = b.type === "message" ? `${b.role}${b.from ? ` (${b.from.kind})` : ""}${b.streaming ? ", streaming" : ""}: ${b.text}`
			: b.type === "tool-call" ? `${b.label} [${b.status}]${b.summary ? ` ${b.summary}` : ""}`
			: b.type === "card" && b.card === "tool" ? `${b.data.app_label} · ${b.data.tool} [${b.data.view}]`
			: b.type === "card" ? `approval [${b.status}] "${b.title}"${b.detail ? ` for ${b.detail}` : ""}`
			: `${b.tone ?? "info"}: ${b.text}`;
		return `${r.seq} ${r.kind}: ${mask(what)}`;
	};
	const told = (from: number): string[] => {
		const lines: string[] = [];
		const seen = events.slice(from);
		for (let i = 0; i < seen.length; i++) {
			const e = seen[i];
			if (e.type === "rows") {
				for (const r of e.rows) {
					const later = seen.slice(i + 1).some((x) => x.type === "rows" && !x.replace && x.rows.some((y: any) => y.seq === r.seq && y.body.streaming));
					if (r.body.streaming && later) continue;
					lines.push(`rows${e.replace ? ` (replacing ${e.replace[0]} on)` : ""}: ${rowLine(r)}`);
				}
			} else if (e.type === "live") lines.push(`live: ${e.state.isRunning ? `running, ${e.state.activity?.kind}${e.state.activity?.detail ? ` (${e.state.activity.detail})` : ""}` : e.state.awaiting ? `waiting for ${e.state.awaiting.reason}` : "idle"}`);
			else if (e.type === "bot") lines.push(`bot: ${e.bot.id}, last "${mask(e.bot.lastPreview ?? "")}", unread ${e.bot.unread}, conversation ${e.bot.generation}`);
			else lines.push(`${e.type}${e.botId ? `: ${e.botId}` : ""}${e.generation ? `, conversation ${e.generation}` : ""}`);
		}
		return lines.filter((l, i) => l !== lines[i - 1]);
	};
	const call = async (method: string, path: string, body?: unknown) => {
		const res = await fetch(base + path, { method, ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
		const text = await res.text();
		try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: `${res.headers.get("content-type")}: ${text.trim().split("\n").length} lines` }; }
	};
	try {
		for (const step of c.steps ?? []) {
			const from = events.length;
			if (step.http) {
				const [method, path] = step.http.split(" ");
				const res = await call(method, path, step.body);
				let shown = res.body;
				if (step.pick) shown = step.pick.split(".").reduce((v: any, k: string) => (Array.isArray(v) ? v.map((x) => x?.[k]) : v?.[k]), shown);
				await new Promise((resolve) => setTimeout(resolve, 50));
				out.push(`## ${step.http}${step.body ? ` ${JSON.stringify(step.body)}` : ""}${step.pick ? ` (${step.pick})` : ""}`, "", `${res.status}`, "", "```json", quiet(shown), "```", "", ...(events.length > from ? ["The stream:", "", ...told(from).map((l) => `- ${l}`), ""] : []));
			} else if (step.say) {
				const res = await call("POST", `/bots/${step.bot}/messages`, { text: step.say });
				await until((e) => e.type === "tasks" && e.botId === step.bot, from);
				out.push(`## ${step.bot} is told: ${step.say}`, "", `${res.status}, and the row it answers with: ${res.body.row ? rowLine(res.body.row) : JSON.stringify(res.body)}`, "", "The stream:", "", ...told(from).map((l) => `- ${l}`), "");
			} else if (step.decide) {
				const rows = (await call("GET", `/bots/${step.bot}/rows`)).body.rows as any[];
				const card = rows.findLast((r) => r.body.card === "approval");
				const res = await call("POST", `/approvals/${encodeURIComponent(card.body.approvalId)}`, { decision: step.decide });
				await until((e) => e.type === "tasks" && e.botId === step.bot, from);
				out.push(`## The card's button: ${step.decide}`, "", `${res.status}`, "", "The stream:", "", ...told(from).map((l) => `- ${l}`), "");
			} else if (step.voice) {
				const sess = (await call("POST", "/voice/session", { botId: step.bot })).body;
				const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
				await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
				ws.send(JSON.stringify({ type: "config", agent: step.bot, session_id: sess.sessionId }));
				ws.send(JSON.stringify({ type: "text", text: step.voice }));
				await until((e) => e.type === "tasks" && e.botId === step.bot, from);
				ws.close();
				out.push(`## ${step.bot} is told on its call's socket: ${step.voice}`, "", "The stream:", "", ...told(from).map((l) => `- ${l}`), "");
			} else if (step.turn) {
				const turns = (await call("GET", `/bots/${step.bot}/trajectory`)).body.turns as any[];
				const res = await call("POST", `/bots/${step.bot}/turns/${turns[step.which].id}/${step.turn}`, {});
				await new Promise((resolve) => setTimeout(resolve, 50));
				const saved = res.body.saved ? JSON.parse(readFileSync(join(dir, "cases", `${res.body.name}.json`), "utf8")) : undefined;
				out.push(`## Turn ${step.which + 1}: ${step.turn}`, "", `${res.status}`, "", "```json", quiet(saved ? { saved: res.body.saved, case: { ...saved, config: { ...saved.config, fixtures: Object.keys(saved.config?.fixtures ?? {}) } } } : res.body), "```", "", ...(events.length > from ? ["The stream:", "", ...told(from).map((l) => `- ${l}`), ""] : []));
			} else if (step.reopen) {
				const list = (await call("GET", `/bots/${step.reopen}/conversations`)).body.conversations as any[];
				const earlier = list.find((x) => !x.current);
				const res = await call("POST", `/bots/${step.reopen}/conversations/${encodeURIComponent(earlier.id)}`);
				await new Promise((resolve) => setTimeout(resolve, 50));
				out.push(`## ${step.reopen}'s conversations, and the earlier one opened again`, "", ...list.map((x) => `- "${x.first}", ${x.turns} turn${x.turns === 1 ? "" : "s"}${x.current ? ", on screen" : ""}`), "", `${res.status}`, "", "The stream:", "", ...told(from).map((l) => `- ${l}`), "");
			} else if (step.reload) {
				const fetched = (await call("GET", `/bots/${step.reload}/rows`)).body.rows as any[];
				const strip = (r: any) => JSON.stringify({ ...r, updatedSeq: 0, createdAt: 0, body: { ...r.body, callId: undefined, approvalId: undefined, ...(r.body.data ? { data: { ...r.body.data, at: "" } } : {}) } });
				const built = [...(page.get(step.reload)?.values() ?? [])].sort((a, b) => a.seq - b.seq);
				const same = built.length === fetched.length && built.every((r, i) => strip(r) === strip(fetched[i]));
				out.push(`## Reload ${step.reload}`, "", ...fetched.map((r) => `- ${rowLine(r)}`), "", same ? `The ${built.length} rows the stream built are the rows a reload fetches.` : `MISMATCH: the stream built ${built.length} rows, a reload fetches ${fetched.length}:\n${built.map(rowLine).join("\n")}`, "");
			}
		}
	} finally {
		abort.abort();
		await reading.catch(() => {});
		server.stop(true);
		await engine.close();
		tasks.stop();
		rmSync(dir, { recursive: true, force: true });
	}
	return out.join("\n");
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const groups: [string, (input: string, name: string) => string | Promise<string>][] = [
	["conversation", conversation], ["protocol", protocol], ["durable", durable], ["web", web], ["coding", coding], ["views", views], ["page", page], ["bots", bots], ["reader", reader], ["classify", classify], ["gate", gate], ["ollama", ollama], ["compact", compact], ["skills", skills],
];
const failed = await snap(groups.filter(([g]) => !only || g === only).map(([g, render]) => ({ dir: `${here}${g}`, render })));
process.exit(failed === 0 ? 0 : 1);
