import type { Context } from "@earendil-works/chord/context";
import { defineExtension, defineTool, section, type Extension } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { fullName, modelView, toolKey } from "../apps/classify.ts";
import type { Registry } from "../apps/registry.ts";
import {
  ACTION_RULE,
  CONDUCT,
  INSPECT,
  LOAD,
  persona,
  readSkill,
  skillIndex,
  skillNames,
  TOOL_RULES,
  WRITE_RULE,
} from "../apps/skills.ts";
import { initialChat, TalkChat } from "../chat.ts";

export const CALL_END = "talk__call-end";
export const READ_SKILL = "read_skill";
export const STAY_QUIET = "talk__stay-quiet";
export const TOOL_SEARCH = "tool_search";

export function searchTools<T extends { name: string; text: string }>(
  docs: T[],
  query: string,
  k = 5,
): T[] {
  const toks = (t: string): string[] => t.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const q = new Set(toks(query));
  const tokenized = docs.map((d) => ({
    d,
    words: toks(`${d.name.replace(/[_-]/g, " ")} ${d.text}`),
  }));
  if (!q.size || !tokenized.length) return [];
  const avg = tokenized.reduce((n, x) => n + x.words.length, 0) / tokenized.length;
  const scored: [number, T][] = [];
  for (const { d, words } of tokenized) {
    let score = 0;
    for (const w of q) {
      const f = words.filter((x) => x === w).length;
      if (!f) continue;
      const df = tokenized.filter((x) => x.words.includes(w)).length;
      const idf = Math.log(1 + (tokenized.length - df + 0.5) / (df + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * words.length) / avg));
    }
    if (score > 0) scored.push([score, d]);
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, k)
    .map(([, d]) => d);
}

const allowed = (apps: string[], name: string): boolean => apps.length === 0 || apps.includes(name);

const LOOK_UP =
  "The reference lists in your skills are only for filling in tool arguments; they are not news. When Jae asks what is in an app (which projects, " +
  "what a project or ticket is about, what bills there are), look it up with that app's tool before you answer, even when a name is listed above.";
const QUIET = `When what Jae said needs no reply (only a filler sound such as "um", "uh" or "hmm", with no request), call ${STAY_QUIET} and say nothing.`;

export function coreExtension(registry: Registry): Extension {
  const chatOf = async (input: { read: any; conversationId: any }, context: Context) =>
    (await input.read.snapshot(TalkChat, input.conversationId, context)) ?? initialChat();
  return defineExtension({
    name: "talk-core",
    sections: [
      section(
        "persona",
        async (input, context) => {
          const chat = await chatOf(input, context);
          return (
            persona(chat.persona) +
            (chat.instructions.trim() ? `\n\n${chat.instructions.trim()}` : "")
          );
        },
        { tag: false },
      ),
      section(
        "connected",
        async (input, context) => {
          const chat = await chatOf(input, context);
          const mine = [...registry.apps.values()].filter((a) => allowed(chat.apps, a.name));
          const online = mine.filter((a) => a.online && a.tools.length).map((a) => a.label);
          const offline = mine.filter((a) => !(a.online && a.tools.length)).map((a) => a.label);
          const others = [...registry.apps.values()]
            .filter((a) => !allowed(chat.apps, a.name))
            .map((a) => a.label);
          return (
            `You're connected over MCP to: ${online.join(", ") || "nothing right now"}.` +
            (offline.length
              ? ` Offline right now: ${offline.join(", ")}. If Jae asks about one of them, say you can't reach it; never guess what it holds.`
              : "") +
            (others.length
              ? ` You don't have access to ${others.join(", ")}: if Jae asks about it, say plainly that it's not something you can see, and suggest asking Cooper.`
              : "") +
            " If asked what you can access, or whether you are connected to one of them, say this plainly, naming the apps; you don't need to look anything up for that." +
            "\nYour skills (how to use each feature; read_skill reads one in full). Tools a skill mentions that you aren't offered are found with tool_search:\n" +
            skillIndex()
          );
        },
        { tag: false },
      ),
      section(
        "rules",
        async (input, context) => {
          const chat = await chatOf(input, context);
          return [
            chat.writes ? WRITE_RULE : ACTION_RULE,
            CONDUCT,
            INSPECT,
            LOAD,
            TOOL_RULES,
            LOOK_UP,
            QUIET,
          ].join("\n");
        },
        { tag: false },
      ),
    ],
    tools: [
      defineTool({
        name: READ_SKILL,
        description:
          'Read one of your skills (how to use a feature or app, in Jae\'s words, and which tool to call), by name from the skill list. Example: {"name": "tasks"}',
        parameters: obj({ name: str() }),
        replay: "safe",
        execute: async (args) => {
          const skill = readSkill(String(args.name).trim().toLowerCase());
          if (!skill || skill.builders)
            return {
              output: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: `No skill named "${args.name}". Your skills: ${skillNames()
                      .filter((n) => !readSkill(n)?.builders)
                      .join(", ")}.`,
                  }),
                },
              ],
              isError: true,
            };
          return { output: [{ type: "text", text: skill.body }] };
        },
      }),
      defineTool({
        name: TOOL_SEARCH,
        description:
          "Find an app tool that isn't on your list (you are shown each app's everyday tools; there are many more). Describe what you need in a few words. " +
          'The matches are callable straight away. Example: {"query": "delete a bill"}',
        parameters: obj({ query: str() }),
        replay: "safe",
        execute: async (args, api, context) => {
          const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
          const docs = registry
            .online()
            .filter((a) => allowed(chat.apps, a.name))
            .flatMap((app) => {
              const topics = app.skill?.topics ?? [];
              return app.tools
                .filter((t) => !app.isCore(t) && (chat.writes || t.kind === "read"))
                .map((t) => ({
                  name: fullName(app.name, t.name),
                  tool: t,
                  text: `${t.description ?? ""} ${Object.keys((t.inputSchema?.properties ?? {}) as object).join(" ")} ${topics
                    .filter((x) => x.tools.includes(toolKey(t.name)))
                    .flatMap((x) => x.words)
                    .join(" ")}`,
                }));
            });
          const hits = searchTools(docs, String(args.query ?? ""));
          if (!hits.length)
            return {
              output: [
                {
                  type: "text",
                  text: JSON.stringify({
                    found: [],
                    note: "Nothing matches. Try other words, or tell Jae you can't do that.",
                  }),
                },
              ],
            };
          const found = hits.map((h) => ({
            name: h.name,
            description: (h.tool.description ?? "").slice(0, 300),
            arguments: modelView(h.tool.inputSchema).properties,
          }));
          return {
            output: [
              {
                type: "text",
                text: JSON.stringify({ found, note: "Call the one that fits, by its name." }),
              },
            ],
          };
        },
      }),
      defineTool({
        name: STAY_QUIET,
        description:
          'Say nothing this turn. Use it when Jae only made a filler sound ("um", "hmm") and asked for nothing. Example: {}',
        parameters: obj({}),
        replay: "safe",
        execute: async () => ({
          output: [{ type: "text", text: "(nothing said)" }],
          control: { terminate: true },
        }),
      }),
      defineTool({
        name: CALL_END,
        description:
          "End the voice call when Jae says goodbye or that he is done for now. Say a short goodbye in the same reply. It only ends the call; the chat stays.",
        parameters: obj({}),
        execute: async (_args, api, context) => {
          const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
          if (!chat.onCall)
            return {
              output: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: false,
                    note: "No voice call is on, so there is nothing to end. Just say goodbye.",
                  }),
                },
              ],
            };
          await api.commit(async (tx) => {
            (await tx.doc(TalkChat, api.conversationId)).endCall = true;
          }, context);
          return {
            output: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  note: "The call ends once your goodbye has been spoken.",
                }),
              },
            ],
          };
        },
      }),
    ],
  });
}
