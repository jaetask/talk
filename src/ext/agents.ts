import { defineExtension, defineTool, section, type AgentChange, type Extension } from "@earendil-works/pi-durable";
import type { Agent, Agents } from "../agents.ts";
import { initialChat, TalkChat, type ChatState } from "../chat.ts";
import { runChild } from "./subagent.ts";

export const AGENT_ASK = "agent_ask";
export const AGENTS_EXTENSION = "talk-agents";

export type AgentsExtensionOptions = {
	agents: Agents;
	agentChange: (chat: Pick<ChatState, "apps" | "writes">, model: string | undefined, without: string[]) => AgentChange;
	chatOfAgent: (agent: Agent) => Partial<ChatState>;
	seconds?: number;
};

export function agentsExtension(opts: AgentsExtensionOptions): Extension {
	const others = async (me: string) => (await opts.agents.list()).filter((a) => a.id !== me);
	return defineExtension({
		name: AGENTS_EXTENSION,
		sections: [
			section(
				"agents",
				async (input, context) => {
					const chat = (await input.read.snapshot(TalkChat, input.conversationId, context)) ?? initialChat();
					const list = await others(chat.agent);
					if (!list.length) return undefined;
					return (
						`Other agents you can hand a self-contained piece of work to with ${AGENT_ASK} (they don't see this conversation, so say everything they need):\n` +
						list.map((a) => `- ${a.id}: ${a.name}, ${a.about || "an agent"}`).join("\n")
					);
				},
				{ tag: false },
			),
		],
		tools: [
			defineTool({
				name: AGENT_ASK,
				description:
					"Hand one self-contained piece of work to another agent and get their answer back. They work with their own apps and sign their own changes. " +
					'They can\'t see this conversation: put everything they need in the task. Example: {"agent": "maddy", "task": "Draft a reply to the newest reply opportunity for Scale and tell me what you wrote."}',
				parameters: { type: "object", properties: { agent: { type: "string", description: "The agent's id, from the list of other agents" }, task: { type: "string", description: "What they should do, in full" } }, required: ["agent", "task"] },
				replay: "safe",
				execute: async (args: any, api, context) => {
					const chat = (await api.snapshot(TalkChat, api.conversationId, context)) ?? initialChat();
					const list = await others(chat.agent);
					const want = String(args.agent ?? "").trim().toLowerCase();
					const agent = list.find((a) => a.id === want || a.name.toLowerCase() === want);
					const text = (t: string) => [{ type: "text" as const, text: t }];
					if (!agent)
						return { output: text(JSON.stringify({ error: `There is no agent "${args.agent}" to hand work to. The agents are: ${list.map((a) => a.id).join(", ") || "none"}.` })), isError: true };
					if (!String(args.task ?? "").trim()) return { output: text(JSON.stringify({ error: "Say what the agent should do: a task in full." })), isError: true };
					const childChat: Partial<ChatState> = {
						...opts.chatOfAgent(agent),
						sid: `${chat.sid}/${agent.id}`,
						writes: chat.writes,
						pretend: chat.pretend,
						fixtures: chat.fixtures,
						fixturesOnly: chat.fixturesOnly,
						noConfirm: true,
					};
					const child = await runChild(api, context, {
						agent: opts.agentChange({ apps: agent.apps, writes: chat.writes }, agent.model || undefined, [AGENTS_EXTENSION]),
						chat: childChat,
						task: String(args.task),
						timeoutMs: (opts.seconds ?? 120) * 1000,
					});
					const made = ((await api.snapshot(TalkChat, child.conversation, context))?.pretendLog ?? []) as ChatState["pretendLog"];
					if (made.length)
						await api.commit(async (tx) => {
							(await tx.doc(TalkChat, api.conversationId)).pretendLog.push(...(made as never[]));
						}, context);
					const details = { conversationId: child.conversation as unknown as number, agent: agent.id } as never;
					if (child.status !== "done")
						return {
							output: text(JSON.stringify({ error: child.reason === "timeout" ? `${agent.name} ran out of time. Say so plainly.` : `${agent.name} couldn't finish (${child.reason}). Say so plainly.` })),
							isError: true,
							details,
						};
					return { output: text(JSON.stringify({ from: agent.name, answer: child.text })), details };
				},
			}),
		],
	});
}
