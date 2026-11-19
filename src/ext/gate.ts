// The danger gate, as a Pi Durable beforeTool hook. A change is refused while the write switch is off. A dangerous
// change (delete, archive, money, send or publish) must point at one item a lookup returned, and then the call is
// parked: the server asks Jae its own question, and the call runs only on an explicit yes.
import { awaitWithContext, type Context } from "@earendil-works/chord/context";
import { defineExtension, GenerationTask, hook, LiveDoc, ToolTask, type Extension, type Harness } from "@earendil-works/pi-durable";
import { fullName, toolOf, type JsonObject } from "../apps/classify.ts";
import { question, refusal, resolve } from "../apps/gate.ts";
import type { Registry } from "../apps/registry.ts";
import { initialChat, TalkChat } from "../chat.ts";

export type Decision = { yes: boolean; said: string };

/** How a note from Talk itself to the model begins. It is placed as a user message; screens leave it out. */
/** How a call Jae declined reads in the transcript. */
export const DECLINED = "Not done, nothing was changed.";
export const NOTE = "(Talk)";

/** Calls parked in this process, by conversation and call id. A restart finds the decision in the chat document. */
export class Parked {
	private waiters = new Map<string, (d: Decision) => void>();
	wait(key: string): Promise<Decision> {
		return new Promise((resolve) => this.waiters.set(key, resolve));
	}
	settle(key: string, decision: Decision): boolean {
		const w = this.waiters.get(key);
		this.waiters.delete(key);
		w?.(decision);
		return w !== undefined;
	}
}

/**
 * Ask Jae a yes-or-no question on behalf of a running tool call, and park until he answers. The question is the
 * server's own words. A decision recorded before a restart is found in the chat document, so nothing is asked twice.
 */
export async function askJae(
	parked: Parked,
	api: { conversationId: any; commit: (change: (tx: any) => any, context: Context) => Promise<any>; snapshot: (...args: any[]) => Promise<any> },
	context: Context,
	ask: { key: string; name: string; args: JsonObject; question: string; item: string },
): Promise<Decision> {
	const chat = ((await api.snapshot(TalkChat, api.conversationId, context)) as ReturnType<typeof initialChat> | undefined) ?? initialChat();
	const known = chat.decisions[ask.key] as Decision | undefined;
	if (known) return known;
	const wait = parked.wait(`${api.conversationId}:${ask.key}`);
	await api.commit(async (tx: any) => {
		(await tx.doc(TalkChat, api.conversationId)).pending = { callId: ask.key, name: ask.name, args: ask.args, question: ask.question, item: ask.item, askedAt: Date.now() };
	}, context);
	return awaitWithContext(wait, context);
}

export function gateExtension(registry: Registry, parked: Parked, harness: () => Harness): Extension {
	return defineExtension({
		name: "talk-gate",
		hooks: [
			hook(ToolTask, {
				beforeTool: async (call, api, context: Context) => {
					const { app, tool } = registry.resolve(call.name);
					if (!app || !tool || tool.kind === "read") return undefined;
					const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
					if (!chat.writes) return { block: "Changes are switched off; you can only look things up." };
					if (tool.kind !== "danger") return undefined;

					const args = call.arguments as JsonObject;
					const { item, why } = resolve(app.name, args, chat.seen as never, tool.name);
					if (!item) return { block: JSON.parse(refusal(tool.name, why ?? "not_looked_up")).instruction };
					if (chat.noConfirm)
						return { block: "This needs Jae's yes and there's no way to ask right now, so it wasn't done." };

					const key = `${api.conversationId}:${call.id}`;
					let decision = chat.decisions[call.id] as Decision | undefined;
					if (!decision) {
						const wait = parked.wait(key);
						await harness().commit(async (tx) => {
							(await tx.doc(TalkChat, api.conversationId)).pending = {
								callId: call.id, name: call.name, args, question: question(app.label, tool.name, item), item: item.name, askedAt: Date.now(),
							};
						}, context);
						// Stopping the answer or closing the service ends the wait without deciding; the call stays undecided.
						decision = await awaitWithContext(wait, context);
					}
					if (decision.yes) return undefined;
					return { block: `${DECLINED} Jae was asked first ("${question(app.label, tool.name, item)}") and did not say yes, so ${toolOf(call.name).replace(/-/g, " ")} was not run.` };
				},
			}),
			// A dangerous call was refused because its item hadn't been looked up, and the model is about to answer
			// without calling it again: often with "shall I?" in words, sometimes with a claim that it is done. One
			// note, once per run, sends it back to the tool, where the gate asks Jae properly.
			hook(GenerationTask, {
				onYield: async (_answer, api, context: Context) => {
					const first = (await api.snapshot(LiveDoc, api.conversationId, context))?.run?.first;
					if (first === undefined) return undefined;
					const page = await api.entries({ minEntryId: first, order: "ascending" } as never, 200, undefined, context);
					let waiting: string | undefined;
					for (const entry of page.items) {
						const message = (entry as { model?: readonly any[] }).model?.[0];
						if (entry.kind === "pi.user" && typeof message?.content === "string" && message.content.startsWith(NOTE)) return undefined;
						if (entry.kind !== "pi.tool-result" || message?.role !== "toolResult") continue;
						const kind = registry.resolve(message.toolName).tool?.kind;
						if (kind !== "write" && kind !== "danger") continue;
						const text = (message.content as { text?: string }[]).map((c) => c.text ?? "").join("");
						waiting = message.isError && text.includes("You haven't looked it up yet") ? message.toolName : undefined;
					}
					if (!waiting) return undefined;
					return {
						continue:
							`${NOTE} Nothing has changed yet: ${waiting} was refused and you haven't called it again. If the lookup returned the item, call ${waiting} now with its exact id; ` +
							"the system asks Jae for his yes itself. If the item isn't there, tell Jae you can't find it.",
					};
				},
			}),
			// A call Jae didn't say yes to: its run is stopped while it waits (the engine does that), and here its result
			// is written as what happened, so the model reads "asked, not done" and then Jae's own words as the next turn.
			hook(ToolTask, {
				afterTool: async (call, result, api, context: Context) => {
					if (!result.diagnostics?.some((d) => d.code === "aborted" || d.code === "abandoned")) return undefined;
					const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
					const decision = chat.decisions[call.id] as Decision | undefined;
					if (!decision || decision.yes) return undefined;
					const asked = (decision as { question?: string }).question;
					const text = `${DECLINED} You asked Jae${asked ? ` "${asked}"` : ""} and he did not say yes, so ${toolOf(call.name).replace(/-/g, " ")} was not run. His answer is the next message. If it is a no, tell him in a few words that you have left it as it was.`;
					return { ...result, output: [{ type: "text" as const, text }], isError: true };
				},
			}),
			// A tool name the chat doesn't have: misspelled, another agent's app, a change while changes are off, or
			// made up. The error says which, so the model's next step can be the right one.
			hook(ToolTask, {
				afterTool: async (call, result, api, context: Context) => {
					if (!result.diagnostics?.some((d) => d.code === "tool_unavailable")) return undefined;
					const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
					const say = (text: string) => ({ ...result, output: [{ type: "text" as const, text: JSON.stringify({ error: text }) }], isError: true, diagnostics: [] });
					const guess = call.name.replace(/^([A-Za-z]+)\s*(?:__|[:._])\s*/, "$1__");
					const { app, tool } = registry.resolve(guess);
					if (app && chat.apps.length && !chat.apps.includes(app.name))
						return say(`${app.label} isn't something ${chat.agentName} can use. Say so plainly and suggest asking Cooper.`);
					if (app && tool && tool.kind !== "read" && !chat.writes) return say("Changes are switched off; you can only look things up.");
					if (app && tool) {
						const name = fullName(app.name, tool.name);
						return say(`The tool is named ${name}. Call it again by that exact name with the same arguments.`);
					}
					if (app && !app.online) return say(`${app.label} is offline right now, so say you can't reach it.`);
					return say(`There is no tool named ${call.name}. Use tool_search with a few words for what you need, then call the tool it finds.`);
				},
			}),
		],
	});
}
