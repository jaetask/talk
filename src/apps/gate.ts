import { verbAndThing, type Json } from "./classify.ts";

export type SeenItem = { app: string; id: string; name: string; record: Record<string, Json>; source: string };

const NAME_KEYS = ["name", "title", "label", "summary", "project", "feature"];
const IGNORED_ARGS = new Set(["by", "requestId", "expectedVersion", "note", "reason"]);

export function parseResult(result: unknown): Json | undefined {
	if (typeof result !== "string") return result as Json;
	for (let i = 0; i < result.length; i++) {
		if (result[i] !== "{" && result[i] !== "[") continue;
		let depth = 0;
		let inString = false;
		for (let j = i; j < result.length; j++) {
			const ch = result[j];
			if (inString) {
				if (ch === "\\") j++;
				else if (ch === '"') inString = false;
			} else if (ch === '"') inString = true;
			else if (ch === "{" || ch === "[") depth++;
			else if (ch === "}" || ch === "]") {
				depth--;
				if (depth === 0) {
					try {
						return JSON.parse(result.slice(i, j + 1));
					} catch {
						break;
					}
				}
			}
		}
	}
	return undefined;
}

const nameOf = (r: Record<string, Json>): string | undefined => {
	for (const k of NAME_KEYS) if (typeof r[k] === "string" && (r[k] as string).trim()) return (r[k] as string).trim();
	return undefined;
};

export function collectItems(app: string, result: unknown, source = ""): SeenItem[] {
	const found: SeenItem[] = [];
	const walk = (v: Json | undefined) => {
		if (Array.isArray(v)) v.forEach(walk);
		else if (v && typeof v === "object") {
			const name = nameOf(v);
			if (v.id !== undefined && v.id !== null && v.id !== "" && name) found.push({ app, id: String(v.id), name, record: v, source });
			Object.values(v).forEach(walk);
		}
	};
	walk(parseResult(result));
	return found;
}

const norm = (v: unknown): string => String(v).replace(/\s+/g, " ").trim().toLowerCase();
const scalar = (v: unknown): v is string | number => typeof v === "string" || typeof v === "number";

export function resolve(app: string, args: Record<string, Json>, seen: SeenItem[], tool = ""): { item?: SeenItem; why?: string } {
	const values = new Set(
		Object.entries(args ?? {}).filter(([k, v]) => !IGNORED_ARGS.has(k) && scalar(v) && String(v).trim()).map(([, v]) => norm(v)),
	);
	const mine = seen.filter((s) => s.app === app);
	if (!mine.length) return { why: "not_looked_up" };
	let hits = new Map(mine.filter((s) => values.has(norm(s.id)) || values.has(norm(s.name))).map((s) => [s.id, s]));
	if (!hits.size) return { why: "not_found" };
	const noun = tool ? verbAndThing(tool)[1] : "";
	if (hits.size > 1 && noun && scalar(args?.[noun])) {
		const want = norm(args[noun]);
		const narrowed = new Map([...hits].filter(([, h]) => want === norm(h.id) || want === norm(h.name)));
		const ofKind = new Map([...narrowed].filter(([, h]) => noun in h.record));
		hits = ofKind.size ? ofKind : narrowed.size ? narrowed : hits;
	}
	if (hits.size > 1) return { why: `ambiguous: ${[...hits.values()].map((h) => h.name).sort().join(", ")}` };
	const item = [...hits.values()][0];
	for (const [k, v] of Object.entries(args ?? {})) {
		if (IGNORED_ARGS.has(k) || k === "id" || !scalar(v)) continue;
		const have = item.record[k];
		if (scalar(have) && norm(have) !== norm(v) && norm(v) !== norm(item.id) && norm(v) !== norm(item.name))
			return { why: `mismatch: ${k} is '${v}' but ${item.name} has '${have}'` };
	}
	return { item };
}

export function refusal(tool: string, why: string): string {
	const hint = why.startsWith("mismatch")
		? `${why.split(": ").slice(1).join(": ")}. Use the item's own values.`
		: why.startsWith("ambiguous")
			? `More than one item matches (${why.split(": ").slice(1).join(": ")}). Ask Jae which one, in one short question.`
			: why === "not_found"
				? "None of the items you looked up matches. If it isn't there, tell Jae you can't find it."
				: "You haven't looked it up yet. After the lookup, call the tool again straight away; don't ask Jae to confirm in words, the system asks him itself.";
	return JSON.stringify({
		status: "refused",
		instruction: `Not done. Look it up first: call a list or get tool that returns the item, then call ${tool} again with its exact id or name. ${hint}`,
	});
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function question(appLabel: string, tool: string, item: SeenItem): string {
	const [verb, noun] = verbAndThing(tool);
	if (tool === "mark-paid") return `Mark ${item.name} as paid in ${appLabel}?`;
	if (tool === "skip-payment") return `Skip the next ${item.name} payment in ${appLabel}?`;
	if (["delete", "remove", "archive", "trash", "purge", "restore", "reset"].includes(verb)) return `${cap(verb)} the ${item.name} ${noun} in ${appLabel}?`;
	if (["send", "post", "publish"].includes(verb)) return `${cap(verb)} ${item.name} from ${appLabel}?`;
	return `${cap(tool.replace(/-/g, " "))}: ${item.name} in ${appLabel}?`;
}

export const YES = /^\W*(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please do|confirm(ed)?|correct|that'?s right|absolutely|definitely)\b/i;
