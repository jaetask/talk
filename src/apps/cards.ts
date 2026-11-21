import { appOf, toolOf, type Json, type JsonObject } from "./classify.ts";

export const CARD_VERSION = 1;
const QUIET = new Set(["catalog-read", "get-catalog", "get-today", "context-read", "call-end"]);
const PLUMBING = new Set(["id", "by", "requestId", "expectedVersion", "actorId", "ticketId"]);
const TICKET_KEYS = ["id", "title", "status", "owner", "priority", "feature", "where", "due"];
const STATUS_WORDS: Record<string, string> = { todo: "To do", doing: "Doing", review: "Review", done: "Done", canceled: "Cancelled" };
const MAX_ROWS = 200;
const CELL_ITEMS = 12;

export type Card = {
	v: number; name: string; app: string; app_label: string; tool: string; kind: string; outcome: string; args: JsonObject; at: string;
	view: "tickets" | "change" | "sources" | "table";
	data: JsonObject;
};

export function parseCardResult(text: string | undefined): Json | undefined {
	if (!text) return undefined;
	const t = String(text).trim();
	try {
		return JSON.parse(t);
	} catch {
	}
	for (const line of t.split("\n").reverse()) {
		try {
			return JSON.parse(line);
		} catch {
		}
	}
	return undefined;
}

const isObj = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);
const empty = (v: Json | undefined): boolean => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
const word = (field: string, value: Json): Json => (field === "status" && typeof value === "string" ? (STATUS_WORDS[value] ?? value) : value);
const ticketRow = (t: JsonObject): JsonObject => Object.fromEntries(TICKET_KEYS.filter((k) => !empty(t[k])).map((k) => [k, word(k, t[k])]));
const isTicket = (o: unknown): o is JsonObject => isObj(o) && typeof o.id === "string" && "title" in o;
const recordList = (v: Json): v is JsonObject[] => Array.isArray(v) && v.length > 0 && v.every(isObj);

function namedRows(data: Json): [string | undefined, JsonObject[] | undefined] {
	if (recordList(data)) return [undefined, data];
	if (isObj(data)) {
		const lists = Object.entries(data).filter(([, v]) => recordList(v));
		if (lists.length === 1) return [lists[0][0], lists[0][1] as JsonObject[]];
	}
	return [undefined, undefined];
}

const scalar = (v: Json): Json => (typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v);
const scalarList = (v: Json): v is Json[] => Array.isArray(v) && v.every((x) => x === null || typeof x !== "object");

function flat(d: JsonObject, prefix = "", depth = 0, out: JsonObject = {}): JsonObject {
	for (const [k, v] of Object.entries(d)) {
		const key = `${prefix}${k}`;
		if (isObj(v) && Object.keys(v).length && depth < 2) flat(v, `${key}.`, depth + 1, out);
		else if (isObj(v)) out[key] = Object.keys(v).length ? `${Object.keys(v).length} fields` : "none";
		else if (Array.isArray(v)) out[key] = !v.length ? "none" : scalarList(v) && v.length <= 3 ? v.map((x) => String(scalar(x))).join(", ") : `${v.length} items`;
		else out[key] = v === null || v === "" ? "none" : scalar(v);
	}
	return out;
}

function cell(v: Json | undefined): Json {
	if (v === undefined) return null;
	if (Array.isArray(v)) {
		if (!scalarList(v)) return `${(v as Json[]).length} items`;
		const items = v.slice(0, CELL_ITEMS).map((x) => String(scalar(x)));
		return v.length > CELL_ITEMS ? [...items, `+${v.length - CELL_ITEMS} more`] : items;
	}
	if (isObj(v)) {
		const f = flat(v);
		const out = Object.fromEntries(Object.entries(f).slice(0, CELL_ITEMS)) as JsonObject;
		if (Object.keys(f).length > CELL_ITEMS) out.more = `${Object.keys(f).length - CELL_ITEMS} more fields`;
		return out;
	}
	return scalar(v);
}

export function tableView(data: Json): JsonObject | undefined {
	const [noun, rows] = namedRows(data);
	if (rows) {
		const cols: string[] = [];
		for (const r of rows.slice(0, MAX_ROWS)) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
		const shown = cols.slice(0, 8);
		const total = isObj(data) && Number.isInteger(data.total) ? (data.total as number) : rows.length;
		return { columns: shown, rows: rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(shown.map((k) => [k, cell(r[k])]))), total, ...(noun ? { noun } : {}) };
	}
	if (isObj(data) && Object.keys(data).length) {
		const pairs = Object.entries(data).filter(([, v]) => !empty(v) && !(isObj(v) && !Object.keys(v).length)).map(([k, v]) => ({ field: k, value: cell(v) }));
		return pairs.length ? { columns: ["field", "value"], rows: pairs.slice(0, MAX_ROWS), total: pairs.length } : undefined;
	}
	if (Array.isArray(data) && data.length) return { columns: ["value"], rows: data.slice(0, MAX_ROWS).map((v) => ({ value: cell(v) })), total: data.length };
	return undefined;
}

function clock(seconds: Json | undefined): string {
	if (typeof seconds !== "number") return "";
	const s = Math.floor(seconds);
	const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
	const pad = (n: number) => String(n).padStart(2, "0");
	return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const quoteRow = (item: JsonObject, q: JsonObject): JsonObject => ({
	title: item.title ?? "", kind: item.kind ?? "", quote: q.text ?? "", exact: q.exact !== false, source: q.sourceTitle ?? "",
	at: clock(q.atSeconds) || (Number.isInteger(q.page) ? `p. ${q.page}` : ""), link: q.link ?? "",
});

export function sourcesRows(data: Json): JsonObject[] | undefined {
	if (!isObj(data)) return undefined;
	if (Array.isArray(data.hits)) {
		const rows: JsonObject[] = [];
		for (const h of data.hits) {
			if (!isObj(h)) continue;
			const snippet = String(h.snippet ?? "").replace(/[«»]/g, "");
			for (const src of ((h.sources ?? []) as JsonObject[]).slice(0, 3)) rows.push({ title: h.title ?? "", kind: h.kind ?? "", quote: snippet, exact: false, source: src.title ?? "", at: src.at ?? "", link: src.link ?? "" });
		}
		return rows;
	}
	if (isObj(data.item) && Array.isArray(data.item.quotes)) return (data.item.quotes as Json[]).filter(isObj).map((q) => quoteRow(data.item as JsonObject, q));
	if (Array.isArray(data.items) && data.items.every((i) => isObj(i) && "quotes" in i))
		return (data.items as JsonObject[]).filter((i) => Array.isArray(i.quotes) && i.quotes.length).map((i) => quoteRow(i, (i.quotes as JsonObject[])[0]));
	return undefined;
}

export function buildCard(call: { name: string; args: JsonObject; kind: string; outcome: string; result: string; full?: string; appLabel?: string; at: string }): Card | undefined {
	const app = appOf(call.name);
	const tool = app ? toolOf(call.name) : "";
	if (!app || QUIET.has(tool) || !["ok", "confirmed"].includes(call.outcome)) return undefined;
	const data = (call.full ? parseCardResult(call.full) : undefined) ?? parseCardResult(call.result);
	if (data === undefined || data === null || (isObj(data) && "error" in data && Object.keys(data).length <= 3)) return undefined;
	const args = Object.fromEntries(Object.entries(call.args ?? {}).filter(([k]) => k !== "requestId")) as JsonObject;
	const card = { v: CARD_VERSION, name: call.name, app, app_label: call.appLabel ?? app.charAt(0).toUpperCase() + app.slice(1), tool, kind: call.kind || "read", outcome: call.outcome, args, at: call.at };
	const pretend = isObj(data) && data.pretend === true;
	if (call.kind === "write" || call.kind === "danger") {
		const target = args.id ?? args.ticketId ?? (isObj(data) ? data.id : undefined) ?? null;
		const after = isObj(data) && isTicket(data.ticket) ? data.ticket : data;
		const changes = Object.entries(args).filter(([k]) => !PLUMBING.has(k)).map(([k, v]) => ({ field: k, to: cell(word(k, v)) }));
		const view: JsonObject = { target, changes, pretend };
		if (isTicket(after) && !pretend) {
			view.after = ticketRow(after);
			view.title = after.title;
		}
		return { ...card, view: "change", data: view };
	}
	if (app === "knowledge") {
		const rows = sourcesRows(data);
		if (rows) return { ...card, view: "sources", data: { rows: rows.slice(0, MAX_ROWS), total: rows.length } };
	}
	if (isObj(data) && Array.isArray(data.tickets)) {
		const rows = (data.tickets as Json[]).slice(0, MAX_ROWS).filter(isObj).map(ticketRow);
		return { ...card, view: "tickets", data: { rows, total: (data.total as number) ?? rows.length } };
	}
	const one = isObj(data) && isTicket(data.ticket) ? data.ticket : data;
	if (isTicket(one) && app === "tasks") return { ...card, view: "tickets", data: { rows: [ticketRow(one)], total: 1 } };
	const table = tableView(data);
	return table ? { ...card, view: "table", data: table } : undefined;
}

export const cardKey = (card: Pick<Card, "name" | "args">): string => JSON.stringify([card.name, Object.fromEntries(Object.entries(card.args).sort(([a], [b]) => a.localeCompare(b)))]);
