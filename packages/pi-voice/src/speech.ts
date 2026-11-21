
const SENTENCE = /([ \t]*\|[^\n]*(?=\n)|[\s\S]+?(?:[.!?](?=\s|$)|\n))(\s+|$)/y;

const MARKDOWN: [RegExp, string][] = [
	[/^\s*(?:[-*•]|\d+[.)])\s+/gm, ""],
	[/[*_#`]+/g, ""],
	[/\s*\n+\s*/g, " "],
	[/\(?\b(?:id\s*)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\)?/gi, ""],
	[/\b[0-9a-f]{16,}\b/gi, ""],
	[/\s{2,}/g, " "],
];

export type Pronunciations = [written: string, spoken: string][];

export function parsePronunciations(text: string): Pronunciations {
	const out: Pronunciations = [];
	for (const line of text.split("\n")) {
		if (!line.includes("=") || line.trimStart().startsWith("#")) continue;
		const written = line.slice(0, line.indexOf("=")).trim();
		const say = line.slice(line.indexOf("=") + 1).trim();
		if (written && say) out.push([written, say]);
	}
	return out;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function tableRow(line: string): string {
	const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) return "";
	return `${cells.filter(Boolean).join(", ")}.`;
}

export function spoken(text: string, pronunciations: Pronunciations = []): string {
	text = text.split("\n").map((line) => (line.trimStart().startsWith("|") ? tableRow(line) : line)).join("\n");
	for (const [rx, to] of MARKDOWN) text = text.replace(rx, to);
	for (const [written, say] of pronunciations) text = text.replace(new RegExp(`\\b${escape(written)}\\b`, "g"), say);
	return text.trim();
}

export function takeSentences(text: string): { sentences: string[]; rest: string } {
	const sentences: string[] = [];
	let at = 0;
	for (;;) {
		SENTENCE.lastIndex = at;
		const m = SENTENCE.exec(text);
		if (!m || m.index !== at) break;
		if (m.index + m[0].length === text.length && !/\s$/.test(m[0])) break;
		if (m[1].trim()) sentences.push(m[1].trim());
		at = m.index + m[0].length;
	}
	return { sentences, rest: text.slice(at) };
}

export function splitSentences(text: string): string[] {
	const { sentences, rest } = takeSentences(`${text.trim()}\n`);
	const out = [...sentences, ...(rest.trim() ? [rest.trim()] : [])];
	return out.length ? out : [text.trim()];
}

export class SentenceStream {
	private pending = "";
	push(piece: string): string[] {
		this.pending += piece;
		const { sentences, rest } = takeSentences(this.pending);
		this.pending = rest;
		return sentences;
	}
	flush(): string[] {
		const rest = this.pending.trim();
		this.pending = "";
		return rest ? [rest] : [];
	}
}

const MAX_CHUNK = 250;
const MIN_CHUNK = 80;

export function splitForTts(text: string): { text: string; endsSentence: boolean }[] {
	const out: { text: string; endsSentence: boolean }[] = [];
	for (const para of text.trim().split(/\n\s*\n/)) {
		const flat = para.split(/\s+/).filter(Boolean).join(" ");
		for (const sentence of flat ? splitSentences(flat) : []) {
			if (sentence.length <= MAX_CHUNK) {
				out.push({ text: sentence, endsSentence: true });
				continue;
			}
			let cur = "";
			for (const part of sentence.split(/(?<=[,;:])\s+/)) {
				if (cur && cur.length + 1 + part.length > MAX_CHUNK) {
					out.push({ text: cur, endsSentence: false });
					cur = part;
				} else cur = `${cur} ${part}`.trim();
			}
			while (cur.length > MAX_CHUNK) {
				const space = cur.lastIndexOf(" ", MAX_CHUNK);
				const cut = space > 0 ? space : MAX_CHUNK;
				out.push({ text: cur.slice(0, cut), endsSentence: false });
				cur = cur.slice(cut).trim();
			}
			if (cur) out.push({ text: cur, endsSentence: true });
		}
	}
	const merged: { text: string; endsSentence: boolean }[] = [];
	for (const chunk of out) {
		const last = merged[merged.length - 1];
		if (last && last.text.length < MIN_CHUNK && last.text.length + 1 + chunk.text.length <= MAX_CHUNK) merged[merged.length - 1] = { text: `${last.text} ${chunk.text}`, endsSentence: chunk.endsSentence };
		else merged.push(chunk);
	}
	return merged;
}
