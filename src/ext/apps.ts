import type { Context } from "@earendil-works/chord/context";
import {
  defineExtension,
  defineTool,
  section,
  type Extension,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { buildCard, type Card } from "../apps/cards.ts";
import {
  fullName,
  modelView,
  MODEL_HIDDEN_ARGS,
  toolKey,
  type Json,
  type JsonObject,
} from "../apps/classify.ts";
import { collectItems } from "../apps/gate.ts";
import type { McpApp, Registry, Tool } from "../apps/registry.ts";
import { readOnlySkill } from "../apps/skills.ts";
import { initialChat, TalkChat, type ChatState } from "../chat.ts";

export const appExtensionName = (app: string): string => `app-${app}`;

export const OUTCOME_UNKNOWN = JSON.stringify({
  outcome: "unknown",
  instruction:
    "The change may or may not have happened (the app didn't confirm). Don't say it worked. Check with a read tool if you can, otherwise tell Jae it's unconfirmed.",
});

export function fixtureResult(fixtures: { [k: string]: Json }, name: string, app: string): string {
  const key = name in fixtures ? name : `${app}__*`;
  if (key in fixtures)
    return typeof fixtures[key] === "string"
      ? (fixtures[key] as string)
      : JSON.stringify(fixtures[key]);
  return JSON.stringify({ error: "Nothing found for that lookup." });
}

export function appActor(app: McpApp, chat: Pick<ChatState, "agent" | "agentName">): string {
  const actors = app.catalog.actors();
  const hit = actors.find(
    (a) =>
      a.id === chat.agent ||
      (a.name ?? "").trim().toLowerCase() === chat.agentName.trim().toLowerCase(),
  );
  return hit?.id ?? chat.agent;
}

export type ToolDetails = {
  app: string;
  label: string;
  tool: string;
  kind: string;
  args: JsonObject;
  outcome: "ok" | "error" | "pretend" | "unknown";
  full?: string;
  ms: number;
  card?: Card;
  at?: string;
};

function appTool(_registry: Registry, app: McpApp, tool: Tool): ToolRegistration {
  const name = fullName(app.name, tool.name);
  const real = (tool.inputSchema?.properties ?? {}) as JsonObject;
  return defineTool({
    name,
    description: `[${app.label}] ${(tool.description ?? "").slice(0, 300)}`,
    parameters: modelView(tool.inputSchema),
    execute: async (args, api, context: Context) => {
      const started = performance.now();
      const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
      const input = { ...(args as JsonObject) };
      const details = (
        outcome: ToolDetails["outcome"],
        shown: JsonObject,
        full?: string,
        result = "",
      ): ToolDetails => {
        const at = new Date(api.now()).toISOString().slice(0, 19);
        const card = buildCard({
          name,
          args: shown,
          kind: tool.kind,
          outcome: outcome === "pretend" ? "ok" : outcome,
          result,
          full,
          appLabel: app.label,
          at,
        });
        return {
          app: app.name,
          label: app.label,
          tool: tool.name,
          kind: tool.kind,
          args: shown,
          outcome,
          ms: Math.round(performance.now() - started),
          at,
          ...(card ? { card } : {}),
        };
      };
      const text = (t: string) => [{ type: "text" as const, text: t }];

      if (tool.kind === "read") {
        const canned =
          chat.fixtures &&
          (name in chat.fixtures || `${app.name}__*` in chat.fixtures || chat.fixturesOnly);
        const res = canned
          ? { text: fixtureResult(chat.fixtures!, name, app.name), isError: false, full: undefined }
          : await app.call(tool.name, input);
        const items = collectItems(app.name, res.text, tool.name);
        if (items.length)
          await api.commit(async (tx) => {
            const doc = await tx.doc(TalkChat, api.conversationId);
            const fresh = new Set(items.map((i) => `${i.app}:${i.id}`));
            const kept = doc.seen.filter((s) => !fresh.has(`${s.app}:${s.id}`));
            doc.seen = [...kept, ...items.map((i) => ({ ...i, turn: doc.turn }))].slice(
              -400,
            ) as never;
          }, context);
        return {
          output: text(res.text),
          isError: res.isError,
          details: details(res.isError ? "error" : "ok", input, res.full, res.text) as never,
        };
      }

      if ("by" in real) input.by = appActor(app, chat);
      if ("requestId" in real)
        input.requestId = await api.memo(
          "requestId",
          `${chat.agent}-${crypto.randomUUID()}`,
          context,
        );
      const shown = Object.fromEntries(
        Object.entries(input).filter(([k]) => k !== "requestId"),
      ) as JsonObject;
      if (chat.pretend) {
        await api.commit(async (tx) => {
          (await tx.doc(TalkChat, api.conversationId)).pretendLog.push({
            app: app.name,
            tool: tool.name,
            args: input,
          } as never);
        }, context);
        const out = {
          ok: true,
          pretend: true,
          tool: tool.name,
          args: input,
          note: "Test mode: the change was accepted but no ticket ID exists, so don't state one.",
        };
        return {
          output: text(JSON.stringify(out)),
          details: details("pretend", shown, undefined, JSON.stringify(out)) as never,
        };
      }
      try {
        const res = await app.call(tool.name, input, { change: true });
        return {
          output: text(res.text),
          isError: res.isError,
          details: details(res.isError ? "error" : "ok", shown, res.full, res.text) as never,
        };
      } catch {
        return { output: text(OUTCOME_UNKNOWN), details: details("unknown", shown) as never };
      }
    },
  }) as ToolRegistration;
}

export function appExtension(registry: Registry, app: McpApp): Extension {
  return defineExtension({
    name: appExtensionName(app.name),
    tools: app.tools.map((t) => appTool(registry, app, t)),
    sections: [
      section(
        `${app.name}-skill`,
        async (input, context) => {
          if (!app.online) return undefined;
          const chat =
            (await input.read.snapshot(TalkChat, input.conversationId, context)) ?? initialChat();
          const body = app.skill?.body || app.about;
          const skill = chat.writes ? body : readOnlySkill(body, app.tools);
          const hidden = new Set(
            app.tools
              .filter((t) => !app.isCore(t) && (chat.writes || t.kind === "read"))
              .map((t) => toolKey(t.name)),
          );
          const named = new Map(
            app.tools.map((t) => [toolKey(t.name), fullName(app.name, t.name)]),
          );
          const more = (app.skill?.topics ?? [])
            .map((topic) => ({
              words: topic.words.join(", "),
              tools: topic.tools.filter((t) => hidden.has(t)).map((t) => named.get(t)!),
            }))
            .filter((topic) => topic.tools.length)
            .map((topic) => `- ${topic.words}: ${topic.tools.join(", ")}`);
          const index = more.length
            ? `\nMore ${app.label} tools, by topic. Call one by its name (its error tells you the arguments if you get them wrong), or find others with tool_search.\n${more.join("\n")}`
            : "";
          const reference =
            app.context && !chat.fixturesOnly
              ? `\n${app.label} reference (names and IDs for tool arguments):\n${app.context}`
              : "";
          return `${app.label} skill:\n${skill}${index}${reference}`;
        },
        { tag: false },
      ),
    ],
  });
}

export { MODEL_HIDDEN_ARGS };
