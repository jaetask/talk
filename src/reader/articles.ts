import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Section = { title: string; level: number; text: string; order: number; id: string; parent: string | null };
export type Article = { slug: string; title: string; sections: Section[] };

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const STOP_WORDS = new Set("the a an of and to on in it is what that this section part bit about for from with one please".split(" "));
const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "article";

export function splitSections(markdown: string): Section[] {
	const raw: { title: string | null; level: number; text: string }[] = [];
	let title: string | null = null;
	let level = 1;
	let buf: string[] = [];
	const flush = () => {
		const body = buf.join("\n").trim();
		if (title !== null || body) raw.push({ title, level, text: body });
	};
	for (const line of markdown.split("\n")) {
		const m = line.match(HEADING);
		if (m) {
			flush();
			title = m[2].trim();
			level = m[1].length;
			buf = [];
		} else buf.push(line);
	}
	flush();
	const stack: Section[] = [];
	return raw.map((s, i) => {
		const section: Section = { title: s.title ?? "Introduction", level: s.level, text: s.text, order: i, id: `${String(i).padStart(2, "0")}-${slug(s.title ?? "Introduction")}`, parent: null };
		while (stack.length && stack[stack.length - 1].level >= section.level) stack.pop();
		section.parent = stack.length ? stack[stack.length - 1].title : null;
		stack.push(section);
		return section;
	});
}

export function loadArticles(folder: string): Article[] {
	if (!existsSync(folder)) return [];
	return readdirSync(folder).filter((f) => f.endsWith(".md")).sort().map((f) => {
		const sections = splitSections(readFileSync(join(folder, f), "utf8"));
		const stem = f.slice(0, -3);
		return { slug: stem, title: sections.find((s) => s.level === 1)?.title ?? stem.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), sections };
	});
}

const BYLINE = /^\s*[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}\s*·\s*@\w+\s*$/gm;

function cleanProse(body: string): string {
	return body
		.replace(BYLINE, "")
		.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ")
		.replace(/`([^`]*)`/g, "$1")
		.replace(/!?\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))*\)/g, "$1")
		.replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2")
		.replace(/^\s*([-*+•]|\d+[.)])\s+/gm, "")
		.replace(/^\s*(#{1,6}|>)\s*/gm, "")
		.replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, "")
		.replace(/\n{2,}/g, "\n\n")
		.trim();
}

const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

export function tableCells(line: string): string[] {
	let s = line.trim();
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
	const out: string[] = [];
	let cur = "";
	let tick = false;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "\\" && s[i + 1] === "|") {
			cur += "|";
			i++;
			continue;
		}
		if (s[i] === "`") tick = !tick;
		if (s[i] === "|" && !tick) {
			out.push(cur.trim());
			cur = "";
		} else cur += s[i];
	}
	out.push(cur.trim());
	return out;
}

const plainInline = (text: string): string =>
	text.replace(/!?\[([^\]]*)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, "$1").replace(/`+([^`]*?)`+/g, "$1").replace(/(\*\*|__|~~)(.+?)\1/g, "$2").replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1").trim();

function rowSentence(header: string[], row: string[]): { say: string; shown: string } {
	const head = header.map((h) => plainInline(h).replace(/[?:]+$/, "").trim());
	const cells = head.map((_, i) => plainInline(row[i] ?? ""));
	const word = (t: string) => t.replace(/[_|]/g, " ").replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
	const parts = [cells[0] ? word(cells[0]) : "", ...head.slice(1).map((h, i) => (cells[i + 1] && /\w/.test(cells[i + 1]) ? (h ? `${word(h)}: ${word(cells[i + 1])}` : word(cells[i + 1])) : ""))].filter(Boolean);
	return { say: parts.length ? `${parts.join(". ")}.` : "", shown: cells.filter(Boolean).join(" ") };
}

export function spokenParts(body: string): { text: string; shown?: string }[] {
	const lines = body.split("\n");
	const out: { text: string; shown?: string }[] = [];
	let prose: string[] = [];
	let fenced = false;
	const flush = () => {
		const text = cleanProse(prose.join("\n"));
		if (text) out.push({ text });
		prose = [];
	};
	for (let i = 0; i < lines.length; i++) {
		if (FENCE.test(lines[i])) fenced = !fenced;
		else if (!fenced && lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && TABLE_DELIM.test(lines[i + 1])) {
			flush();
			const header = tableCells(lines[i]);
			i += 2;
			for (; i < lines.length && lines[i].trim() && lines[i].includes("|"); i++) {
				const { say, shown } = rowSentence(header, tableCells(lines[i]));
				if (say) out.push({ text: say, shown });
			}
			i--;
			continue;
		}
		prose.push(lines[i]);
	}
	flush();
	return out;
}

export function spokenSentences(section: Section, split: (text: string) => string[]): { say: string; shown?: string }[] {
	const out: { say: string; shown?: string }[] = [{ say: `${section.title.replace(/[.:]+$/, "")}.` }];
	for (const part of spokenParts(section.text)) out.push(...(part.shown === undefined ? split(part.text).map((say) => ({ say })) : [{ say: part.text, shown: part.shown }]));
	return out;
}


const norm = (text: string, keepAll = false): string[] => text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && (keepAll || !STOP_WORDS.has(w)));
const stem = (word: string): string => word.slice(0, 5);
const NUMBER_WORDS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
const ORDINALS = "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split(" ");
const NUMBERED = /^\s*(\d+)[.)]\s/;

function asNumber(word: string): number | undefined {
	const w = word.toLowerCase().replace(/^[\s.,!?]+|[\s.,!?]+$/g, "");
	if (/^\d+$/.test(w)) return Number(w);
	if (NUMBER_WORDS.includes(w)) return NUMBER_WORDS.indexOf(w);
	if (ORDINALS.includes(w)) return ORDINALS.indexOf(w) + 1;
	return undefined;
}

function numberIn(query: string): number | undefined {
	const m = query.match(new RegExp(`\\b(?:section|part|number|chapter|point|no\\.?)\\s+(\\d+|${NUMBER_WORDS.join("|")})\\b`, "i"));
	if (m) return asNumber(m[1]);
	const o = query.match(new RegExp(`\\b(${ORDINALS.join("|")})\\s+(?:section|part|chapter|one|bit)\\b`, "i"));
	return o ? ORDINALS.indexOf(o[1].toLowerCase()) + 1 : undefined;
}

export function sectionByNumber(article: Article, n: number): number | undefined {
	const numbered = article.sections.filter((s) => NUMBERED.test(s.title));
	if (numbered.length) {
		const hit = numbered.filter((s) => Number(s.title.match(NUMBERED)![1]) === n).sort((a, b) => a.level - b.level)[0];
		return hit?.order;
	}
	const parts = article.sections.filter((s) => s.level > 1);
	const top = Math.min(...parts.map((s) => s.level));
	return parts.filter((s) => s.level === top)[n - 1]?.order;
}

export type Found = { index?: number; ambiguous?: number[] };

const score = (q: Set<string>, t: Set<string>): number => {
	const overlap = [...q].filter((w) => t.has(w)).length;
	if (!overlap) return 0;
	return overlap / q.size + (0.5 * overlap) / t.size + (q.size === t.size && overlap === q.size ? 1 : 0);
};

export function findSection(want: string, article: Article): Found {
	const n = want.trim().split(/\s+/).length === 1 ? asNumber(want) : numberIn(want);
	if (n !== undefined) {
		const k = sectionByNumber(article, n);
		return k === undefined ? {} : { index: k };
	}
	const [strict, all] = [new Set(norm(want)), new Set(norm(want, true))];
	if (!all.size) return {};
	let scored: [number, number][] = [];
	for (const s of article.sections) {
		const title = s.title.replace(NUMBERED, "");
		const [tStrict, tAll] = [new Set(norm(title)), new Set(norm(title, true))];
		const sc = strict.size && tStrict.size ? score(strict, tStrict) : [...tAll].every((w) => all.has(w)) ? score(all, tAll) : 0;
		if (sc) scored.push([sc, s.order]);
	}
	if (!scored.length && strict.size) {
		const stems = [...strict].map(stem);
		for (const s of article.sections) {
			const words = norm(s.text).map(stem);
			const hits = stems.reduce((sum, x) => sum + words.filter((w) => w === x).length, 0);
			if (hits && stems.every((x) => words.includes(x))) scored.push([0.5 + Math.min(hits, 10) / 20, s.order]);
		}
	}
	if (!scored.length) return {};
	scored = scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
	const [best, second] = scored;
	if (second && second[0] >= best[0] - 0.15 && second[0] > 0.6) return { ambiguous: [best[1], second[1]] };
	return best[0] >= 0.5 ? { index: best[1] } : {};
}

const FILE_GENERIC = new Set("deep dive lessons lesson for talk agent file files doc docs document documents the a an of on about notes research".split(" "));
const fileWords = (text: string): string[] => text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

export function matchFile(query: string, files: Article[]): { slug?: string; ambiguous?: string[] } {
	const q = new Set(fileWords(query));
	const scored = files
		.map((f) => {
			const name = new Set(fileWords(`${f.title} ${f.slug.replace(/-/g, " ")}`));
			const hit = [...q].filter((w) => name.has(w) && !FILE_GENERIC.has(w)).length;
			const bonus = ["lessons", "deep", "dive"].filter((w) => q.has(w) && name.has(w)).length * 0.5;
			return [hit ? hit + bonus : 0, f.slug] as [number, string];
		})
		.filter(([s]) => s > 0)
		.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
	if (!scored.length) return {};
	if (scored.length > 1 && scored[1][0] === scored[0][0]) return { ambiguous: [scored[0][1], scored[1][1]] };
	return { slug: scored[0][1] };
}

export const outline = (article: Article): string => article.sections.map((s) => `${"  ".repeat(s.level - 1)}${s.title}`).join("\n");

export function relevantSections(question: string, article: Article, k = 2): number[] {
	const qs = new Set(norm(question).map(stem));
	if (!qs.size) return [];
	return article.sections
		.map((s) => [[...new Set(norm(`${s.title} ${s.text}`).map(stem))].filter((w) => qs.has(w)).length, s.order] as [number, number])
		.filter(([hits]) => hits > 0)
		.sort((a, b) => b[0] - a[0] || a[1] - b[1])
		.slice(0, k)
		.map(([, order]) => order);
}

const FILE_IN_FULL = 40_000;

export function articleContext(article: Article, index: number): string {
	const secs = article.sections;
	const total = secs.reduce((n, s) => n + s.text.length, 0);
	const picks = total <= FILE_IN_FULL ? secs.map((s) => s.order) : [index - 1, index, index + 1].filter((k) => k >= 0 && k < secs.length);
	const body = picks.map((k) => `[${secs[k].title}]\n${secs[k].text}`).join("\n\n");
	return (
		`You and Jae are reading the file "${article.title}" together; the reading is at the section "${secs[Math.min(index, secs.length - 1)].title}". ` +
		"Answer a question about the file in one to three short spoken sentences, using only the file text below. If the file doesn't cover it, say plainly " +
		"that the file doesn't cover that; don't guess or add outside knowledge. Don't offer to continue: Jae will say carry on when ready. When Jae asks you " +
		"to read, play, go to, repeat or move on in the file, use the reader tools and say only a few words; never paste or retell the text instead. Anything " +
		"that isn't about the file (a ticket, Jae's apps, the web) is a normal request: use your other tools for it, as in any chat. A question about the file is " +
		"never a request to read: answer it in words and leave the reader where it is." +
		(total > FILE_IN_FULL ? " The file is long, so only the sections around the reading are below; reader_state lists them all." : "") +
		`\n\nOutline:\n${outline(article)}\n\nFile text:\n${body}`
	);
}
