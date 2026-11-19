// Jae's apps as Talk connects to them: Tasks, Marketing, Money, Tables and Knowledge, each over its own MCP server
// (MCP only, never an app-to-app HTTP API). Access tokens are read from each app's .env at request time and are
// never stored, printed or logged.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpClient, StreamableHttpTransport } from "@earendil-works/pi-mcp";
import { APPS_FILE, APPS_ROOT, DETERMINISTIC } from "../config.ts";
import { Catalog, compactGeneric, compactTasks, displayGeneric, displayTasks, maskNumbers, maybeJson } from "./compact.ts";
import { classifyTool, DENY, fullName, toolKey, type AppTool, type Json, type JsonObject, type Kind } from "./classify.ts";
import { readSkill, type Skill } from "./skills.ts";

export type Tool = AppTool & { kind: Kind };
export type CallResult = { text: string; full?: string; isError: boolean };

function token(envPath: string, key = "ACCESS_TOKEN"): string | undefined {
	try {
		for (const line of readFileSync(envPath, "utf8").split("\n"))
			if (line.trim().startsWith(`${key}=`)) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
	} catch {
		// no file: the app is reached without a token and will refuse if it needs one
	}
	return undefined;
}

export type AppSpec = { name: string; label: string; url: string; envPath?: string; about: string };

export class McpApp {
	readonly name: string;
	readonly label: string;
	url: string;
	readonly envPath?: string;
	private readonly fallbackAbout: string;
	tools: Tool[] = [];
	online = false;
	error?: string;
	catalog = new Catalog();
	/** Names and ids for tool arguments (Tasks projects, Marketing entities), read with the tool list. */
	context = "";
	private client?: McpClient;
	private contextAt = 0;

	constructor(spec: AppSpec) {
		this.name = spec.name;
		this.label = spec.label;
		this.url = spec.url;
		this.envPath = spec.envPath;
		this.fallbackAbout = spec.about;
	}

	get skill(): Skill | undefined {
		return readSkill(this.name);
	}
	get about(): string {
		return this.skill?.description || this.fallbackAbout;
	}
	/**
	 * Is this tool offered without a search? The ones the skill lists in `tools:`; for a skill with no list, the ones
	 * its text names (the skill is the app's vocabulary), or failing that the app's plain listings. Everything else
	 * waits behind tool search, so the prompt stays small enough for a local model whichever apps are connected.
	 */
	isCore(tool: Tool): boolean {
		return this.coreNames().has(tool.name);
	}

	private coreNames(): Set<string> {
		const skill = this.skill;
		if (skill?.tools) return new Set(this.tools.filter((t) => skill.tools!.includes(toolKey(t.name))).map((t) => t.name));
		const esc = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const named = this.tools.filter((t) => new RegExp(`(?<![\\w-])${esc(t.name)}(?![\\w-])`).test(skill?.body ?? ""));
		if (named.length) return new Set(named.map((t) => t.name));
		// A skill that names no tool at all: the app's plain listings (reads that need no argument) are the way in.
		const ways = this.tools.filter((t) => t.kind === "read" && !((t.inputSchema?.required as unknown[] | undefined)?.length)).slice(0, 6);
		return new Set(ways.map((t) => t.name));
	}

	private transport(purpose?: string): StreamableHttpTransport {
		return new StreamableHttpTransport({
			url: this.url,
			openGetStream: false,
			// The token is read at each request, so a rotated token works without a restart and is never held in memory.
			fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
				const headers = new Headers(init?.headers);
				const tok = this.envPath ? token(this.envPath) : undefined;
				if (tok) headers.set("authorization", `Bearer ${tok}`);
				if (purpose) headers.set("x-talk-call", purpose);
				return fetch(input, { ...init, headers });
			}) as never,
		});
	}

	async connect(): Promise<void> {
		await this.close();
		this.tools = [];
		this.online = false;
		this.error = undefined;
		const client = new McpClient({ name: "talk-next", version: "0.1.0", requestTimeoutMs: 30_000 });
		await client.connect(this.transport());
		this.client = client;
		this.tools = ((await client.listTools()) as unknown as AppTool[]).filter((t) => !DENY.has(t.name)).map((t) => ({ ...t, kind: classifyTool(t) }));
		this.online = true;
		await this.loadContext();
	}

	async close(): Promise<void> {
		try {
			await this.client?.close();
		} catch {
			// already gone
		}
		this.client = undefined;
	}

	private async raw(tool: string, args: JsonObject): Promise<{ content?: { type: string; text?: string }[]; structuredContent?: Json; isError?: boolean }> {
		if (!this.client) throw new Error(`${this.label} is not connected`);
		return (await this.client.callTool(tool, args)) as never;
	}

	/** Names the prompt needs: Tasks' projects and owners, Marketing's entities and accounts. */
	async loadContext(): Promise<void> {
		this.contextAt = Date.now();
		try {
			if (this.name === "tasks") {
				const res = await this.raw("catalog-read", {});
				this.catalog = new Catalog(((res.structuredContent as any)?.entities ?? []) as never);
				this.context = this.catalog.promptBlock();
			} else if (this.name === "marketing") {
				const parts: string[] = [];
				const ents: any[] = ((await this.raw("list-entities", {})).structuredContent as any)?.entities ?? [];
				if (ents.length) parts.push(`Marketing entities (brands/people being marketed): ${ents.filter((e) => !e.archived).map((e) => `${e.name} (entityId ${e.id})`).join("; ")}`);
				const today: any = (await this.raw("get-today", {})).structuredContent ?? {};
				const accts: any[] = (today.accounts ?? []).filter((a: any) => !a.archived);
				if (accts.length)
					parts.push(
						`Marketing accounts: ${accts.map((a) => `${a.handle || a.name} on ${a.channelKind || "a channel"} for ${a.entityName || "an entity"} (accountId ${a.id})`).join("; ")}`,
					);
				this.context = parts.join("\n");
			}
		} catch {
			this.context = "";
		}
	}

	async refreshContext(maxAgeMs = 60_000): Promise<void> {
		if (this.online && Date.now() - this.contextAt > (DETERMINISTIC ? 0 : maxAgeMs)) await this.loadContext();
	}

	/**
	 * One call, as the model should see it (short) and as the chat's card shows it (full). A lookup that fails is tried
	 * once more on a fresh connection. A change is never sent twice: if it breaks mid-call it throws, and the caller
	 * reports that the outcome is unknown.
	 */
	async call(tool: string, args: JsonObject, options: { change?: boolean } = {}): Promise<CallResult> {
		let res: Awaited<ReturnType<McpApp["raw"]>>;
		try {
			res = await this.raw(tool, args);
		} catch (first) {
			if (options.change) throw first;
			try {
				await this.connect(); // the session may have expired or the app restarted: reconnect and retry once
				res = await this.raw(tool, args);
			} catch (e) {
				this.online = false;
				return { text: offlineResult(this.label, e), isError: true };
			}
		}
		const text = (res.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
		if (res.isError) return { text: JSON.stringify({ error: text.slice(0, 500) }), isError: true };
		const sc = res.structuredContent as Record<string, any> | undefined;
		if (this.name === "tasks") {
			const shown = displayTasks(sc, this.catalog);
			return { text: compactTasks(tool, sc, text, this.catalog), full: shown ? JSON.stringify(shown) : undefined, isError: false };
		}
		const body = sc !== undefined ? (sc as Json) : maybeJson(text);
		let out = compactGeneric(body);
		let full = displayGeneric(body);
		if (this.name === "money") [out, full] = [maskNumbers(out), maskNumbers(full)];
		return { text: out, full: full !== out ? full : undefined, isError: false };
	}
}

export function offlineResult(label: string, err: unknown): string {
	return JSON.stringify({
		error: "offline",
		app: label,
		detail: String((err as Error)?.message ?? err).slice(0, 200),
		instruction: `${label} didn't answer, even after reconnecting and retrying once. Say plainly that ${label} is offline right now and may need restarting. Don't promise to try again, and don't guess what it would have said.`,
	});
}

export class Registry {
	readonly apps = new Map<string, McpApp>();
	constructor(specs: AppSpec[]) {
		for (const s of specs) this.apps.set(s.name, new McpApp(s));
	}
	async connectAll(): Promise<void> {
		await Promise.all(
			[...this.apps.values()].map(async (app) => {
				try {
					await app.connect();
				} catch (e) {
					app.online = false;
					app.tools = [];
					app.error = (e as Error)?.name ?? "Error"; // never the message: it could carry a header
				}
			}),
		);
	}
	online(): McpApp[] {
		return [...this.apps.values()].filter((a) => a.online && a.tools.length);
	}
	/** (app, the tool as the app names it) for a model-facing name. */
	resolve(name: string): { app?: McpApp; tool?: Tool } {
		const i = name.indexOf("__");
		const app = i > 0 ? this.apps.get(name.slice(0, i)) : undefined;
		const want = toolKey(i > 0 ? name.slice(i + 2) : name);
		return { app, tool: app?.tools.find((t) => toolKey(t.name) === want) };
	}
	status(): { name: string; label: string; online: boolean; tools: number; writeTools: number; error?: string }[] {
		return [...this.apps.values()].map((a) => ({
			name: a.name,
			label: a.label,
			online: a.online,
			tools: a.tools.filter((t) => t.kind === "read").length,
			writeTools: a.tools.filter((t) => t.kind !== "read").length,
			error: a.error,
		}));
	}
	/** Is this model-facing name a tool that waits behind tool search (real, but not on the short list)? */
	isHidden(name: string): boolean {
		const { app, tool } = this.resolve(name);
		return !!app && !!tool && !app.isCore(tool);
	}
	names(): string[] {
		return [...this.apps.values()].flatMap((a) => a.tools.map((t) => fullName(a.name, t.name)));
	}
}

/** The apps Python Talk connects to, at the same addresses, with the same environment overrides. */
export function defaultApps(): AppSpec[] {
	// The apps are whatever apps.json lists: each one an MCP server Talk reaches over HTTP. No file, no apps.
	let listed: { name: string; label?: string; url: string; about?: string; env?: string }[] = [];
	try {
		listed = JSON.parse(readFileSync(APPS_FILE, "utf8"));
	} catch {
		// no apps configured
	}
	const keep = process.env.TALK_APPS ? new Set(process.env.TALK_APPS.split(",").map((s) => s.trim())) : undefined;
	const specs: AppSpec[] = listed.map((a) => ({
		name: a.name, label: a.label ?? a.name.charAt(0).toUpperCase() + a.name.slice(1), url: process.env[`TALK_${a.name.toUpperCase()}_URL`] ?? a.url,
		envPath: a.env ?? join(APPS_ROOT, a.name, ".env"), about: a.about ?? "",
	}));
	// TALK_APPS=tasks (experiments): the other apps stay listed but unreachable, so they are said to be offline.
	return keep ? specs.map((s) => (keep.has(s.name) ? s : { ...s, url: "http://127.0.0.1:9/mcp" })) : specs;
}
