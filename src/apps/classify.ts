// How Talk sees an app tool: read, write or dangerous (from its annotations and the verb in its name), the name the
// model calls it by, and the view of its schema the model gets. Ported from Python Talk's server/apps/classify.py.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Kind = "read" | "write" | "danger";
export type AppTool = {
	name: string;
	description?: string;
	inputSchema?: JsonObject;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
};

/** Framework helpers, and image or export tools that make no sense in a spoken answer. */
export const DENY = new Set([
	"ask_app", "ask_app_status", "list_apps", "open_app", "create_embed_session", "tool-search", "navigate",
	"view-screen", "get-protocol", "read-task-image", "list-task-images", "get-work-media", "get-export", "get-work-export",
]);

export const SEP = "__";
export const fullName = (app: string, tool: string): string => `${app}${SEP}${tool}`;
export const toolKey = (name: string): string => String(name ?? "").trim().replace(/[-_\s]+/g, "_").toLowerCase();
export const appOf = (name: string): string => (name?.includes(SEP) ? name.slice(0, name.indexOf(SEP)) : "");
export const toolOf = (name: string): string => (name?.includes(SEP) ? name.slice(name.indexOf(SEP) + SEP.length) : name);

const THINGS = new Set(["ticket", "project", "feature", "actor", "location", "board", "catalog"]);
const PLAIN_VERBS = new Set([
	"read", "find", "create", "rename", "write", "change", "set", "add", "check", "uncheck", "edit", "react", "attach",
	"record", "cancel", "assign", "clear", "upload", "claim", "release", "handoff", "blocked",
]);
const DANGER_VERBS = new Set([
	"delete", "remove", "trash", "purge", "archive", "reset", "restore", "send", "reply", "notify", "invite", "email",
	"message", "share", "grant", "revoke", "publish", "post", "pay", "transfer", "run", "start", "collect",
]);
const DANGER_NAMES = new Set(["mark-paid", "skip-payment", "set-balance", "request-production", "request-demo", "move-account", "move-trade"]);
const DANGER_WORDS = ["credential", "token", "password", "secret", "permission", "auth"];
const SAFE_NAMES = new Set([
	"reply-to-comment", "ticket-comment-reply-to", "ticket-tag-remove", "ticket-owner-remove",
	"ticket-blocked-by-ticket-remove", "ticket-backlog-send",
]);

/** (verb, thing) of a tool name in either order: "delete-item" and "ticket-comment-delete" both give delete. */
export function verbAndThing(tool: string): [string, string] {
	const parts = toolKey(tool).split("_");
	if (parts.length === 1) return [parts[0], "item"];
	if (THINGS.has(parts[0])) {
		const verb = [...parts].reverse().find((p) => DANGER_VERBS.has(p) || PLAIN_VERBS.has(p)) ?? parts[parts.length - 1];
		const i = parts.lastIndexOf(verb);
		return [verb, i > 0 ? parts[i - 1] : parts[0]];
	}
	return [parts[0], parts[parts.length - 1]];
}

/** read, write (runs directly) or danger (waits for Jae's yes). */
export function classifyTool(tool: AppTool): Kind {
	const ann = tool.annotations ?? {};
	if (ann.readOnlyHint === true) return "read";
	if (SAFE_NAMES.has(tool.name) && ann.destructiveHint !== true) return "write";
	if (
		ann.destructiveHint === true ||
		DANGER_NAMES.has(tool.name) ||
		DANGER_VERBS.has(verbAndThing(tool.name)[0]) ||
		DANGER_WORDS.some((w) => tool.name.includes(w))
	)
		return "danger";
	return "write";
}

/** Arguments Talk fills in itself; the model never sees or sets them. */
export const MODEL_HIDDEN_ARGS = ["by", "requestId"];
const MODEL_DROPPED_KEYS = new Set([
	"pattern", "format", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
	"minItems", "maxItems", "additionalProperties", "$schema", "examples",
]);

/**
 * What the model is shown of a tool's input schema: no regex patterns, formats, length or range limits (they cost
 * tokens and only matter to the app, which still validates the real schema), no union roots, and none of the
 * arguments Talk fills in itself.
 */
export function modelView(schema: JsonObject | undefined): JsonObject {
	const clean = (o: Json, names = false): Json => {
		if (Array.isArray(o)) return o.map((v) => clean(v));
		if (o && typeof o === "object") {
			const out: JsonObject = {};
			for (const [k, v] of Object.entries(o)) if (names || !MODEL_DROPPED_KEYS.has(k)) out[k] = clean(v, k === "properties" && !names);
			return out;
		}
		return o;
	};
	let s = clean({ ...(schema ?? {}) }) as JsonObject;
	const props = s.properties;
	if (!props || typeof props !== "object" || Array.isArray(props) || "anyOf" in s || "oneOf" in s)
		s = { type: "object", properties: props && typeof props === "object" && !Array.isArray(props) ? props : {} };
	s.properties = Object.fromEntries(Object.entries(s.properties as JsonObject).filter(([k]) => !MODEL_HIDDEN_ARGS.includes(k)));
	if (Array.isArray(s.required)) s.required = s.required.filter((k) => !MODEL_HIDDEN_ARGS.includes(String(k)));
	if (s.type === undefined) s.type = "object";
	return s;
}
