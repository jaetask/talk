import { defineExtension, defineTool, section, type Extension } from "@earendil-works/pi-durable";
import { readSkill } from "../apps/skills.ts";
import { initialChat, TalkChat, type ChatState } from "../chat.ts";
import { articleContext, findSection, loadArticles, matchFile, relevantSections, type Article } from "../reader/articles.ts";

export type ReaderOptions = { filesDir: string };

const none = { type: "object", properties: {} } as const;
const json = (o: object, isError = false) => ({ output: [{ type: "text" as const, text: JSON.stringify(o) }], isError });

export function readerExtension(opts: ReaderOptions): Extension {
	const files = () => loadArticles(opts.filesDir);
	const open = (chat: ChatState): Article | undefined => (chat.article ? files().find((f) => f.slug === chat.article!.slug) : undefined);
	const onFile = (name: string, description: string, parameters: object, run: (article: Article, chat: ChatState, args: any) => { result: object; action?: ChatState["readerAction"]; move?: { index: number; sentence: number } }) =>
		defineTool({
			name,
			description,
			parameters,
			execute: async (args: any, api, context) => {
				const chat = ((await api.snapshot(TalkChat, api.conversationId, context)) as ChatState | undefined) ?? initialChat();
				const article = open(chat);
				if (!article) return json({ error: "No file is open. Open one with reader_open first (reader_list_files has the titles)." }, true);
				const { result, action, move } = run(article, chat, args ?? {});
				if (action !== undefined || move)
					await api.commit(async (tx) => {
						const doc = await tx.doc(TalkChat, api.conversationId);
						if (action !== undefined) doc.readerAction = action;
						if (move && doc.article) Object.assign(doc.article, move);
					}, context);
				return json(result, "error" in result);
			},
		});
	const title = (a: Article, k: number) => a.sections[k].title;

	return defineExtension({
		name: "talk-reader",
		sections: [
			section(
				"reader",
				async (input, context) => {
					const chat = ((await input.read.snapshot(TalkChat, input.conversationId, context)) as ChatState | undefined) ?? initialChat();
					const article = open(chat);
					const skill = readSkill("reader");
					const all = files();
					const list = all.length ? `Jae's files (open one with reader_open): ${all.map((f) => f.title).join("; ")}.` : "";
					if (!article) return list || undefined;
					return `${skill ? `Skill reader:\n${skill.body}\n\n` : ""}${articleContext(article, chat.article!.index)}`;
				},
				{ tag: false },
			),
		],
		tools: [
			defineTool({
				name: "reader_list_files",
				description: "The files Jae can read, by title. Example: {}",
				parameters: none,
				replay: "safe",
				execute: async () => json({ files: files().map((f) => f.title) }),
			}),
			defineTool({
				name: "reader_open",
				description:
					"Open one of Jae's files in the reader (the screen switches to it). Use it whenever Jae asks to open, switch to or read a file. Set play to start reading " +
					'it from the top. Example: {"file": "Orca", "play": true}',
				parameters: { type: "object", properties: { file: { type: "string", description: "The file's title or a distinctive part of it, e.g. 'Orca'" }, play: { type: "boolean", description: "Start reading it (default false)" } }, required: ["file"] },
				execute: async (args: any, api, context) => {
					const all = files();
					const hit = matchFile(String(args.file ?? ""), all);
					const titles = new Map(all.map((f) => [f.slug, f.title]));
					if (hit.ambiguous) return json({ status: "ambiguous", candidates: hit.ambiguous.map((s) => titles.get(s)), instruction: "Ask Jae which one, in one short question." });
					if (!hit.slug) return json({ error: "No file matches that. Call reader_list_files for the titles." }, true);
					await api.commit(async (tx) => {
						(await tx.doc(TalkChat, api.conversationId)).readerAction = { kind: "open", slug: hit.slug!, index: 0, sentence: 0, play: Boolean(args.play) };
					}, context);
					return json({ status: "opening", file: titles.get(hit.slug), instruction: "Say a few words, e.g. which file you're opening." });
				},
			}),
			onFile("reader_state", "The open file: its section titles (with level and parent heading), the current section and whether it's reading. Example: {}", none, (article, chat) => ({
				result: {
					file: article.title, current_section: title(article, chat.article!.index), reading: chat.article!.playing,
					note: "Pass reader_goto a title, or the number written in a numbered heading.",
					sections: article.sections.map((s) => ({ title: s.title, level: s.level, under: s.parent })),
				},
			})),
			onFile(
				"reader_find",
				"Look something up in the open file without moving the reading: returns the sections that say most about it, with their text. Use it to answer a question " +
					'about the file when the text you were given doesn\'t settle it. Example: {"about": "egress proxy"}',
				{ type: "object", properties: { about: { type: "string", description: "What to look for, in a few words" } }, required: ["about"] },
				(article, _chat, args) => {
					const hits = relevantSections(String(args.about ?? ""), article, 3);
					if (!hits.length) return { result: { found: [], note: "The file doesn't mention that. Say so plainly; don't guess." } };
					return { result: { found: hits.map((k) => ({ section: title(article, k), text: article.sections[k].text.slice(0, 2500) })), note: "Answer in one to three spoken sentences from this text. The reading has not moved." } };
				},
			),
			onFile(
				"reader_goto",
				"Jump the file reader to a section and read it aloud from there. Only for when Jae asks to hear a section: read, play, go to or start it. Never to answer a question. Then reply in a few " +
					'words; never paste or retell the section text instead. Example: {"section": "6"} or {"section": "How routing works"}',
				{ type: "object", properties: { section: { type: "string", description: 'The section\'s number (e.g. "6") or its title' }, play: { type: "boolean", description: "Start reading (default true)" } }, required: ["section"] },
				(article, _chat, args) => {
					const want = String(args.section ?? "").trim();
					const hit = findSection(want, article);
					if (hit.ambiguous) return { result: { status: "ambiguous", candidates: hit.ambiguous.map((k) => ({ title: title(article, k), under: article.sections[k].parent })), instruction: "Ask Jae which one, in one short question." } };
					if (hit.index === undefined) return { result: { error: `No section matches "${want}". Call reader_state for the list.` } };
					if (args.play === false) return { result: { status: "moved", section: title(article, hit.index) }, move: { index: hit.index, sentence: 0 } };
					return {
						result: { status: "reading", section: title(article, hit.index), instruction: "Say only a few words, e.g. which section you're reading. Don't paste its text." },
						action: { kind: "read", slug: article.slug, index: hit.index, sentence: 0, play: true },
					};
				},
			),
			...(["next", "previous"] as const).map((dir) =>
				onFile(`reader_${dir}`, dir === "next" ? "Read the section after the one Jae last heard. Use this for 'next section'; never work out the next one yourself. Example: {}" : "Read the section before the one Jae last heard. Example: {}", none, (article, chat) => {
					const k = chat.article!.index + (dir === "next" ? 1 : -1);
					if (k < 0 || k >= article.sections.length) return { result: { status: "no section there", current: title(article, chat.article!.index) } };
					return { result: { status: "reading", section: title(article, k) }, action: { kind: "read", slug: article.slug, index: k, sentence: 0, play: true } };
				}),
			),
			onFile("reader_pause", "Pause the file reader. Example: {}", none, (article, chat) => ({ result: { status: "paused", section: title(article, chat.article!.index) }, action: null })),
			onFile("reader_resume", "Carry on reading from where it paused. Example: {}", none, (article, chat) => ({
				result: { status: "will resume", section: title(article, chat.article!.index) },
				action: { kind: "read", slug: article.slug, index: chat.article!.index, sentence: chat.article!.sentence, play: true },
			})),
		],
	});
}
