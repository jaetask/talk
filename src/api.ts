// The page's HTTP API: the endpoints Talk's page (ui/) already calls, answered from the engine and the durable
// store. Shapes are Python Talk's, so the same page works against either Talk. What the new Talk doesn't have
// (the Model Arena, alerts, ChatGPT sign-in) answers with an empty, well-formed result rather than an error page.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { type Agent, HEART } from "./agents.ts";
import { personalities } from "./apps/skills.ts";
import { MODEL, REPO, writesEnabled } from "./config.ts";
import type { Engine } from "./engine.ts";
import { loadArticles } from "./reader/articles.ts";
import { AGENT_COLORS, type Chats } from "./store.ts";
import { DEFAULT_GAP_MS, DEFAULT_SPEED } from "./voice.ts";

export type ApiOptions = {
	engine: Engine;
	chats: Chats;
	filesDir: string;
	/** The built page (ui/dist). */
	uiDist: string;
	/** Where "Make test" saves a case. */
	casesDir: string;
	voices?: () => Promise<{ id: string; label: string }[]>;
};

const json = (body: unknown, status = 200): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
	".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".map": "application/json", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};
const DEFAULTS = { eq: { preset: "custom", bypass: false, bass: 4, warmth: 4, presence: 2, treble: 1, comp: 0 }, voiceopts: { speed: DEFAULT_SPEED, gap_ms: DEFAULT_GAP_MS }, voice: "af_heart", quality: "16" };

export function createApi(o: ApiOptions) {
	const { engine, chats } = o;
	const agentRow = async (a: Agent, position: number) => {
		const looks = await chats.looks();
		return {
			id: a.id, name: a.name, color: looks[a.id]?.color ?? AGENT_COLORS[0], role: a.persona, apps: a.apps.length ? a.apps : null, voice: a.voice, engine: "kokoro",
			brain: a.model || "smart", position, label: a.about ? a.about.split(":")[0] : null, about: a.about, instructions: a.instructions, model: a.model, ...(await chats.last(a.id)),
		};
	};
	const brain = async () => ({
		model: await chats.setting("model", MODEL), harness: "pi-durable",
		brains: [{ id: MODEL, name: MODEL, where: "local", note: "On this Mac. Nothing leaves it." }],
		harnesses: [{ id: "pi-durable", name: "Pi Durable", note: "Talk's engine on pi + Pi Durable: durable chats, apps over MCP, the ask-before-delete gate.", available: true }],
		chatgpt: { available: false, connected: false, reconnect: false },
	});

	return async function api(req: Request): Promise<Response | undefined> {
		const url = new URL(req.url);
		const path = url.pathname;
		const body = async (): Promise<Record<string, any>> => (req.method === "GET" ? {} : ((await req.json().catch(() => ({}))) as Record<string, any>));
		const seg = path.split("/").filter(Boolean).map(decodeURIComponent);

		if (!path.startsWith("/api/")) return serveStatic(o.uiDist, path);

		if (path === "/api/defaults") {
			if (req.method === "POST") await chats.saveSetting("defaults", { ...(await chats.setting("defaults", DEFAULTS)), ...(await body()) });
			return json(await chats.setting("defaults", DEFAULTS));
		}
		if (path === "/api/brain") {
			if (req.method === "POST") {
				const want = await body();
				if (typeof want.model === "string" && want.model) await chats.saveSetting("model", want.model);
			}
			return json(await brain());
		}
		if (path === "/api/apps") return json(engine.options.registry.status().map((a) => ({ ...a, write_tools: a.writeTools })).map(({ writeTools: _w, ...a }) => a));
		if (path === "/api/agent-colors") return json(AGENT_COLORS);
		if (path === "/api/agents" && req.method === "GET") return json(await Promise.all((await engine.agents.list()).map(agentRow)));
		if (path === "/api/agents" && req.method === "POST") {
			const b = await body();
			const name = String(b.name ?? "").trim().slice(0, 30);
			if (!name) return json({ error: "An agent needs a name." }, 400);
			const taken = new Set((await engine.agents.list()).map((a) => a.id));
			if ([...taken].some((id) => id === name.toLowerCase())) return json({ error: `There's already an agent called ${name}.` }, 409);
			const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent";
			let id = base;
			for (let n = 2; taken.has(id) || id === HEART.id; n++) id = `${base}-${n}`;
			const made = await engine.agents.save(id, { name, persona: "1-conversational", voice: "af_heart", apps: [], about: "" });
			if (typeof b.color === "string") await chats.saveSetting(`color:${id}`, b.color);
			return json(await agentRow(made, taken.size));
		}
		if (seg[1] === "agents" && seg[2] && req.method === "POST" && !seg[3]) {
			const b = await body();
			try {
				const saved = await engine.agents.save(seg[2], {
					...(typeof b.name === "string" ? { name: b.name } : {}), ...(typeof b.role === "string" ? { persona: b.role } : {}), ...(typeof b.voice === "string" ? { voice: b.voice } : {}),
					...(b.apps === null ? { apps: [] } : Array.isArray(b.apps) ? { apps: b.apps } : {}), ...(typeof b.label === "string" ? { about: b.label } : {}),
					...(typeof b.instructions === "string" ? { instructions: b.instructions } : {}), ...(typeof b.model === "string" ? { model: b.model } : {}),
				});
				return json(await agentRow(saved, 0));
			} catch (e) {
				return json({ error: (e as Error).message }, 400);
			}
		}
		if (seg[1] === "agents" && seg[3] === "viewed") {
			await chats.viewed(seg[2]);
			return json({ ok: true });
		}
		if (seg[1] === "agents" && seg[3] === "sessions")
			return json((await chats.list({ agent: seg[2] })).map((c) => ({ id: c.id, first: c.first, last_at: c.last_at, turns: c.turns })));
		if (path === "/api/sessions") return json(await chats.list({ agent: url.searchParams.get("agent") ?? undefined, tests: url.searchParams.get("tests") === "1", q: url.searchParams.get("q") ?? "", limit: Number(url.searchParams.get("limit")) || 500 }));
		if (path === "/api/pinned") return json(await chats.pinned());
		if (path === "/api/tests") return json({ count: (await chats.list({ tests: true })).filter((c) => !c.pinned_at).length });
		if (path === "/api/tests/clear") return json({ cleared: 0, note: "Test runs are kept in the durable store; clearing them isn't available yet." });
		if (seg[1] === "sessions" && seg[2]) {
			const sid = seg[2];
			if (seg[3] === "timeline") {
				const t = await chats.timeline(sid);
				return t ? json(t) : json({ error: "no such session" }, 404);
			}
			if (seg[3] === "log.jsonl") {
				const lines = await chats.export(sid);
				return lines === undefined ? json({ error: "no such session" }, 404) : new Response(lines, { headers: { "content-type": "application/x-ndjson", "content-disposition": `attachment; filename="talk-session-${sid.slice(0, 8)}.jsonl"` } });
			}
			if (seg[3] === "clear" && req.method === "POST") return (await chats.clear(sid)) ? json({ ok: true }) : json({ error: "no such session" }, 404);
			if (seg[3] === "pin" && req.method === "POST") return (await chats.pin(sid, Boolean((await body()).pinned))) ? json({ ok: true }) : json({ error: "no such session" }, 404);
			if (seg[3] === "rename" && req.method === "POST") return (await chats.rename(sid, String((await body()).title ?? ""))) ? json({ ok: true }) : json({ error: "no such session" }, 404);
		}
		if (seg[1] === "turns" && seg[2]) {
			const id = Number(seg[2]);
			if (seg[3] === "redact" && req.method === "POST") return (await chats.redactTurn(id)) ? json({ ok: true }) : json({ error: "no such turn" }, 404);
			if (seg[3] === "case") {
				const draft = await chats.draftCase(id, url.searchParams.get("kind") === "regression" ? "regression" : "golden", url.searchParams.get("note") ?? "");
				return draft ? json(draft) : json({ error: "no such turn" }, 404);
			}
			if (seg[3] === "llm") return json([]); // the exact model requests are in the durable transcript, not yet shown here
		}
		if (path === "/api/cases" && req.method === "POST") {
			const b = await body();
			const name = String(b.name ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
			if (!name || !b.case || typeof b.case !== "object") return json({ error: "A case needs a name and a body." }, 400);
			mkdirSync(o.casesDir, { recursive: true });
			const file = join(o.casesDir, `${name}.json`);
			if (existsSync(file)) return json({ error: `There's already a case called ${name}.` }, 409);
			writeFileSync(file, `${JSON.stringify(b.case, null, 1)}\n`);
			return json({ saved: file.replace(`${REPO}/`, ""), next: "Run the Dojo with --update, read the new expect file, then commit." });
		}
		if (seg[1] === "tools" && seg[3] === "schema") {
			const { tool } = engine.options.registry.resolve(seg[2]);
			return json({ name: seg[2], kind: tool?.kind ?? "unknown", inputSchema: tool?.inputSchema ?? {} });
		}
		if (path === "/api/articles") {
			const positions = await chats.setting<Record<string, number>>("articles", {});
			return json(loadArticles(o.filesDir).map((a) => ({ slug: a.slug, title: a.title, position: positions[a.slug] ?? 0, sections: a.sections.map(({ order, title, level, id }) => ({ order, title, level, id })) })));
		}
		if (seg[1] === "articles" && seg[2]) {
			const a = loadArticles(o.filesDir).find((x) => x.slug === seg[2]);
			return a ? json(a) : json({ error: "no such article" }, 404);
		}
		if (path === "/api/voices")
			return json({
				kokoro: (await o.voices?.()) ?? [{ id: "af_heart", label: "Heart · fast" }, { id: "af_bella", label: "Bella · fast" }],
				omnivoice: [], personalities: personalities(), quality: [], defaults: { speed: DEFAULT_SPEED, gap_ms: DEFAULT_GAP_MS },
			});
		if (path === "/api/tickets/now") return json({});
		if (path === "/api/alerts/count") return json({ unread: 0, byApp: {} });
		if (path.startsWith("/api/alerts")) return json([]);
		if (path === "/api/flag" && req.method === "POST") return json({ ok: true });
		if (path === "/api/settings-snapshot") return json({ ok: true });
		if (path === "/api/writes") return json({ enabled: writesEnabled() });
		if (path.startsWith("/api/arena")) return json({ error: "The Model Arena stays on Python Talk (port 3910): it scores any Talk from outside." }, 501);
		return json({ error: `${path} isn't served by the new Talk yet.` }, 404);
	};
}

/** The built page. Any path that isn't a file is the page itself (it routes in the browser). */
function serveStatic(dist: string, path: string): Response {
	if (!existsSync(join(dist, "index.html")))
		return new Response("Talk's page isn't built yet: run `pnpm --dir ui install && pnpm --dir ui build` in the Talk repo. The websocket is at /ws and the chat protocol at /agentkit.", { status: 503 });
	const wanted = normalize(join(dist, path));
	const file = wanted.startsWith(dist) && existsSync(wanted) && statSync(wanted).isFile() ? wanted : join(dist, "index.html");
	return new Response(readFileSync(file), { headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...(file.endsWith("index.html") ? { "cache-control": "no-store" } : {}) } });
}

void readdirSync;
