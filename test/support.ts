import { createModels } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";
import type { Extension } from "@earendil-works/pi-durable";
import { Registry } from "../src/apps/registry.ts";
import type { Parked } from "../src/ext/gate.ts";
import { Engine, type ChatConfig, type TurnDone, type TurnEvent } from "../src/engine.ts";
import { handlerServer, listen, stopServer } from "../src/http.ts";

export type FakeTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: object;
  result: (args: any) => unknown;
};

export async function fakeApp(tools: FakeTool[]) {
  const calls: { name: string; args: any; purpose: string | null }[] = [];
  const server = handlerServer(async (req) => {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const body = (await req.json()) as { id?: number; method: string; params?: any };
    if (body.id === undefined) return new Response(null, { status: 202 });
    const ok = (result: unknown) => Response.json({ jsonrpc: "2.0", id: body.id, result });
    if (body.method === "initialize")
      return ok({
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fake", version: "1" },
      });
    if (body.method === "tools/list") return ok({ tools: tools.map(({ result: _r, ...t }) => t) });
    if (body.method === "tools/call") {
      const tool = tools.find((t) => t.name === body.params?.name);
      calls.push({
        name: body.params?.name,
        args: body.params?.arguments,
        purpose: req.headers.get("x-talk-call"),
      });
      if (!tool)
        return ok({
          content: [{ type: "text", text: `no tool ${body.params?.name}` }],
          isError: true,
        });
      if (body.params?.arguments?.body === "BREAK")
        return new Response("the app fell over", { status: 500 });
      const result = tool.result(body.params?.arguments ?? {});
      return ok({
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      });
    }
    return ok({});
  });
  const port = await listen(server, 0);
  return { url: `http://127.0.0.1:${port}/mcp`, calls, stop: () => stopServer(server) };
}

const READ = { readOnlyHint: true };
const ticket = (id: string, title: string, status = "todo") => ({
  id,
  title,
  status,
  placement: "board",
  projectId: "p-talk",
  actorId: "a-cooper",
  version: 3,
});

export function fakeTasks() {
  return fakeApp([
    {
      name: "catalog-read",
      description: "List projects, features and actors. Example: {}",
      inputSchema: { type: "object", properties: {} },
      annotations: READ,
      result: () => ({
        entities: [
          { id: "p-talk", kind: "project", name: "Talk", ticketPrefix: "TLK" },
          { id: "f-voice", kind: "feature", name: "Voice", projectId: "p-talk" },
          { id: "a-cooper", kind: "actor", name: "Cooper" },
          { id: "a-maddy", kind: "actor", name: "Maddy" },
          { id: "jae", kind: "actor", name: "Jae" },
        ],
      }),
    },
    {
      name: "board-read",
      description: 'Read a board. Example: {"project": "Talk"}',
      inputSchema: { type: "object", properties: { project: { type: "string" } } },
      annotations: READ,
      result: () => ({
        total: 2,
        tickets: [ticket("TLK-1", "Fix the reader", "doing"), ticket("TLK-2", "Tidy the sidebar")],
      }),
    },
    {
      name: "ticket-read",
      description: 'Read one ticket. Example: {"id": "TLK-1"}',
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      annotations: READ,
      result: (a) => ({ ticket: ticket(a.id, "Fix the reader", "doing"), comments: [] }),
    },
    {
      name: "ticket-comment-add",
      description: 'Add a comment. Example: {"id": "TLK-1", "body": "Done"}',
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          body: { type: "string" },
          by: { type: "string" },
          requestId: { type: "string" },
        },
        required: ["id", "body", "by", "requestId"],
      },
      result: (a) => ({ ok: true, ticket: ticket(a.id, "Fix the reader", "doing") }),
    },
    {
      name: "ticket-archive",
      description: 'Archive a ticket. Example: {"id": "TLK-2"}',
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          by: { type: "string" },
          requestId: { type: "string" },
        },
        required: ["id", "by", "requestId"],
      },
      result: (a) => ({ ok: true, archived: a.id }),
    },
    {
      name: "ticket-step-add",
      description: 'Add a checklist step. Example: {"id": "TLK-1", "title": "Test it"}',
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, title: { type: "string" }, by: { type: "string" } },
        required: ["id", "title", "by"],
      },
      result: () => ({ ok: true }),
    },
  ]);
}

export function fakeMoney() {
  return fakeApp([
    {
      name: "list-items",
      description: "List bills and income. Example: {}",
      inputSchema: { type: "object", properties: {} },
      annotations: READ,
      result: () => ({
        items: [
          { id: 7, name: "Tesco Mobile", amount: "£10" },
          { id: 8, name: "Gym", amount: "£30" },
        ],
      }),
    },
    {
      name: "delete-item",
      description: 'Delete a bill. Example: {"item": 7}',
      inputSchema: { type: "object", properties: { item: { type: "number" } }, required: ["item"] },
      result: (a) => ({ ok: true, deleted: a.item }),
    },
  ]);
}

export type Step =
  | string
  | { call: string; args?: object }
  | { calls: { call: string; args?: object }[]; text?: string };

export async function scripted(
  script: Step[],
  apps: { name: string; label: string; url: string }[] = [],
  storage = "memory",
  more: { extra?: Extension[]; childOnly?: Extension[]; registry?: Registry; parked?: Parked } = {},
) {
  const faux = fauxProvider({ provider: "faux", models: [{ id: "scripted" }] });
  faux.setResponses(
    script.map((s) =>
      typeof s === "string"
        ? fauxAssistantMessage(fauxText(s))
        : "call" in s
          ? fauxAssistantMessage(fauxToolCall(s.call, (s.args ?? {}) as never), {
              stopReason: "toolUse",
            })
          : fauxAssistantMessage(
              [
                ...(s.text ? [fauxText(s.text)] : []),
                ...s.calls.map((c) => fauxToolCall(c.call, (c.args ?? {}) as never)),
              ],
              { stopReason: "toolUse" },
            ),
    ),
  );
  const models = createModels();
  models.setProvider(faux.provider);
  const registry = more.registry ?? new Registry(apps.map((a) => ({ ...a, about: a.label })));
  const engine = await Engine.open({
    storage,
    models,
    provider: "faux",
    model: "scripted",
    ...more,
    registry,
  });
  await engine.syncApps();
  return { engine, faux, registry };
}

export async function turn(
  engine: Engine,
  sid: string,
  said: string,
  config: ChatConfig = {},
): Promise<{ done: TurnDone; lines: string[] }> {
  const lines: string[] = [];
  const done = await engine.turn(
    sid,
    said,
    (e: TurnEvent) => {
      if (e.type === "tool") lines.push(`tool: ${e.text.replace("🔧 ", "")}`);
      else if (e.type === "result")
        lines.push(
          `result: ${e.name} ${e.isError ? `error ${e.text.replace(/\s+/g, " ").slice(0, 260)}` : (e.details?.outcome ?? "ok")}${e.details?.outcome === "unknown" ? ` ${e.text.slice(0, 200)}` : ""}`,
        );
      else if (e.type === "ask") lines.push(`ask: ${e.question}`);
    },
    config,
  );
  lines.push(`reply (${done.stop}): ${done.reply}`);
  return { done, lines };
}

export async function fakeWeb() {
  const pages: Record<string, string> = {
    "/pricing":
      "<html><head><title>Lantern Agent pricing</title><script>var x = '<p>not text</p>';</script></head><body><nav><a href='/'>Home</a></nav>" +
      "<h1>Pricing for teams and solo builders</h1><p>The Solo plan costs twelve dollars a month and includes one agent.</p>" +
      "<p>The Team plan costs forty dollars a seat each month, with shared memory &amp; audit logs.</p><footer>Copyright Lantern</footer></body></html>",
    "/review":
      "<html><head><title>Lantern Agent, reviewed</title></head><body><article><p>We ran Lantern Agent for a month on a small team.</p>" +
      "<p>Reviewers found the Team plan good value but said the audit logs were slow to load.</p></article></body></html>",
    "/empty":
      "<html><head><title>App</title></head><body><div id='root'></div><script>render()</script></body></html>",
    "/moved": "",
  };
  const server = handlerServer((req) => {
    const url = new URL(req.url);
    const base = url.origin;
    if (url.pathname === "/search") {
      const q = url.searchParams.get("q") ?? "";
      const results = /nothing/.test(q)
        ? []
        : [
            {
              title: "Lantern Agent pricing",
              url: `${base}/pricing`,
              content: "Plans for teams and solo builders.",
              engine: "fake",
            },
            {
              title: "Lantern Agent, reviewed",
              url: `${base}/review`,
              content: "A month with Lantern Agent.",
              engines: ["fake"],
            },
            {
              title: "Lantern Agent pricing (again)",
              url: `${base}/pricing/`,
              content: "The same page.",
              engine: "fake",
            },
          ];
      return Response.json({ results });
    }
    if (url.pathname === "/moved")
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    const html = pages[url.pathname];
    return html === undefined
      ? new Response("not found", { status: 404 })
      : new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  const port = await listen(server, 0);
  return { base: `http://127.0.0.1:${port}`, stop: () => stopServer(server) };
}
