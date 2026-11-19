// The brains: one Ollama server, the models Talk is asked for. A model id nobody has asked for yet is added on first
// use, so the picker and the Dojo's model sweep need no list kept here.
import { createModels, type Models } from "@earendil-works/pi-ai";
import { DETERMINISTIC, MAX_REPLY_TOKENS, MODEL, NUM_CTX, OLLAMA } from "./config.ts";
import type { Tool } from "@earendil-works/pi-ai";
import { ollamaProvider, type WireMessage } from "./model/ollama.ts";

const ids = new Set<string>([MODEL]);
const models = createModels();
let hidden: (name: string) => boolean = () => false;

/**
 * The tools a local model is shown: the short list, plus any hidden tool the conversation has already named (in a
 * call, or in a tool search result). The list only grows within a chat, so the prompt's start stays cached.
 */
export function shownTools(tools: Tool[], messages: WireMessage[], isHidden: (name: string) => boolean): Tool[] {
	const named = new Set<string>();
	for (const m of messages) {
		if (m.role === "assistant") for (const c of m.tool_calls ?? []) named.add(c.function.name);
		else if (m.role === "tool" && m.tool_name === "tool_search") for (const hit of m.content.match(/"name":"([^"]+)"/g) ?? []) named.add(hit.slice(8, -1));
	}
	return tools.filter((t) => !isHidden(t.name) || named.has(t.name));
}

const install = () =>
	models.setProvider(
		ollamaProvider([...ids], {
			baseUrl: OLLAMA, numCtx: NUM_CTX, maxReplyTokens: MAX_REPLY_TOKENS, temperature: 0.6, keepAlive: "3h", deterministic: DETERMINISTIC,
			shown: (tools, messages) => shownTools(tools, messages, hidden),
		}),
	);
install();

/** The models, showing a local model only the tools `isHidden` doesn't hold back. */
export function ollamaModels(isHidden?: (name: string) => boolean): Models {
	if (isHidden) hidden = isHidden;
	return models;
}

/** Make sure `id` can be asked for; returns it. */
export function useModel(id: string): string {
	if (!ids.has(id)) {
		ids.add(id);
		install();
	}
	return id;
}
