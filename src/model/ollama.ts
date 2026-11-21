import { writeFile } from "node:fs/promises";
import { createProvider, type Model, type Provider } from "@earendil-works/pi-ai";
import type {
  AssistantMessage,
  Message,
  SimpleStreamOptions,
  StreamFunction,
  TextContent,
  Tool,
  ToolCall,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai/utils/event-stream";
import {
  collapseSystemMessages,
  getCurrentSystemPrompt,
  getCurrentTools,
} from "@earendil-works/pi-ai/utils/transcript";

export const OLLAMA_API = "ollama-chat";

export type OllamaOptions = {
  baseUrl: string;
  numCtx: number;
  maxReplyTokens: number;
  temperature: number;
  keepAlive: string;
  deterministic: boolean;
  shown?: (tools: Tool[], messages: WireMessage[]) => Tool[];
  fetch?: typeof fetch;
};

export type WireMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string;
      tool_calls?: { function: { name: string; arguments: unknown } }[];
    }
  | { role: "tool"; content: string; tool_name: string };

const textOf = (content: string | readonly { type: string; text?: string }[]): string =>
  typeof content === "string"
    ? content
    : content.map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");

export function toWire(context: TranscriptContext): WireMessage[] {
  const flat = collapseSystemMessages(context);
  const out: WireMessage[] = [];
  const system = getCurrentSystemPrompt(flat.messages);
  if (system) out.push({ role: "system", content: system });
  for (const m of flat.messages as Message[]) {
    if (m.role === "system") continue;
    if (m.role === "user") out.push({ role: "user", content: textOf(m.content as never) });
    else if (m.role === "assistant") {
      const calls = m.content.filter((c): c is ToolCall => c.type === "toolCall");
      const text = m.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("");
      if (!text && calls.length === 0) continue;
      out.push({
        role: "assistant",
        content: text,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                function: { name: c.name, arguments: c.arguments },
              })),
            }
          : {}),
      });
    } else out.push({ role: "tool", content: textOf(m.content as never), tool_name: m.toolName });
  }
  return out;
}

function emptyMessage(model: Model<string>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "pending",
    timestamp: Date.now(),
  } as AssistantMessage;
}

export function ollamaStream(opts: OllamaOptions): StreamFunction<string, SimpleStreamOptions> {
  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();
    const out = emptyMessage(model);
    void (async () => {
      try {
        const messages = toWire(context);
        const all = getCurrentTools(collapseSystemMessages(context).messages);
        const tools = opts.shown ? opts.shown(all, messages) : all;
        const body = {
          model: model.id,
          messages,
          stream: true,
          think: false,
          keep_alive: opts.keepAlive,
          options: {
            num_ctx: opts.numCtx,
            temperature: options?.temperature ?? opts.temperature,
            num_predict: options?.maxTokens ?? opts.maxReplyTokens,
            ...(opts.deterministic ? { temperature: 0, seed: 42 } : {}),
          },
          ...(tools.length
            ? {
                tools: tools.map((t) => ({
                  type: "function",
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
              }
            : {}),
        };
        if (process.env.TALK_DEBUG_REQUEST)
          await writeFile(process.env.TALK_DEBUG_REQUEST, JSON.stringify(body, null, 1));
        const res = await (opts.fetch ?? fetch)(`${opts.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: options?.signal,
        });
        if (!res.ok || !res.body)
          throw new Error(`Ollama answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
        stream.push({ type: "start", partial: out });
        let textIndex = -1;
        let buffer = "";
        let reason = "stop";
        const decoder = new TextDecoder();
        const take = (line: string) => {
          if (!line.trim()) return;
          const chunk = JSON.parse(line);
          if (chunk.error) throw new Error(String(chunk.error));
          const piece: string = chunk.message?.content ?? "";
          if (piece) {
            if (textIndex < 0) {
              textIndex = out.content.push({ type: "text", text: "" }) - 1;
              stream.push({ type: "text_start", contentIndex: textIndex, partial: out });
            }
            (out.content[textIndex] as TextContent).text += piece;
            stream.push({
              type: "text_delta",
              contentIndex: textIndex,
              delta: piece,
              partial: out,
            });
          }
          for (const call of chunk.message?.tool_calls ?? []) {
            const args = call.function?.arguments;
            const toolCall: ToolCall = {
              type: "toolCall",
              id: `call_${crypto.randomUUID().slice(0, 12)}`,
              name: String(call.function?.name ?? ""),
              arguments: typeof args === "string" ? safeJson(args) : (args ?? {}),
            };
            const index = out.content.push(toolCall) - 1;
            stream.push({ type: "toolcall_start", contentIndex: index, partial: out });
            stream.push({ type: "toolcall_end", contentIndex: index, toolCall, partial: out });
          }
          if (chunk.done) {
            out.usage.input = chunk.prompt_eval_count ?? 0;
            out.usage.output = chunk.eval_count ?? 0;
            out.usage.totalTokens = out.usage.input + out.usage.output;
            reason = chunk.done_reason ?? "stop";
          }
        };
        for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(part, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl >= 0) {
            take(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf("\n");
          }
        }
        take(buffer);
        if (textIndex >= 0)
          stream.push({
            type: "text_end",
            contentIndex: textIndex,
            content: (out.content[textIndex] as TextContent).text,
            partial: out,
          });
        const hasCalls = out.content.some((c) => c.type === "toolCall");
        out.stopReason = hasCalls ? "toolUse" : reason === "length" ? "length" : "stop";
        stream.push({
          type: "done",
          reason: out.stopReason as "stop" | "length" | "toolUse",
          message: out,
        });
        stream.end(out);
      } catch (error) {
        const aborted = options?.signal?.aborted === true;
        out.stopReason = aborted ? "aborted" : "error";
        out.errorMessage = error instanceof Error ? error.message : String(error);
        stream.push({ type: "error", reason: out.stopReason as "aborted" | "error", error: out });
        stream.end(out);
      }
    })();
    return stream;
  };
}

function safeJson(text: string): Record<string, never> {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function ollamaModel(id: string, opts: OllamaOptions): Model<string> {
  return {
    id,
    name: id,
    api: OLLAMA_API,
    provider: "ollama",
    baseUrl: opts.baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: opts.numCtx,
    maxTokens: opts.maxReplyTokens,
  } as Model<string>;
}

export function ollamaProvider(ids: string[], opts: OllamaOptions): Provider {
  const stream = ollamaStream(opts);
  return createProvider({
    id: "ollama",
    name: "Ollama",
    baseUrl: opts.baseUrl,
    auth: { apiKey: { name: "Ollama", resolve: async () => ({ auth: { apiKey: "ollama" } }) } },
    models: ids.map((id) => ollamaModel(id, opts)),
    api: { stream, streamSimple: stream },
  } as never) as Provider;
}
