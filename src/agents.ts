// The agents Jae talks to. Each is a set of choices a chat starts with: a role (a personality file, or its own
// instructions), a voice, the apps it may use and, optionally, its own brain. They live in the store, so Settings can
// change one without a restart; a new store is seeded with the same two Python Talk has.
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { defineDoc, type Harness } from "@earendil-works/pi-durable";

export type Agent = {
	id: string;
	name: string;
	/** One line on what the agent is for: shown in the sidebar, and to other agents that may hand it work. */
	about: string;
	/** A personality file's id (personalities/<id>.txt). */
	persona: string;
	/** Extra instructions of its own, after the role. */
	instructions: string;
	/** The voice it speaks with (a voice name of the chat's voice provider). */
	voice: string;
	/** App names it may use; empty means every app. */
	apps: string[];
	/** Its own model id; empty means Talk's default brain. */
	model: string;
};

export const SEED: Agent[] = [
	{ id: "cooper", name: "Cooper", about: "the lead: every app, and the one to ask when unsure", persona: "3-cooper", instructions: "", voice: "af_heart", apps: [], model: "" },
	{ id: "maddy", name: "Maddy", about: "the marketer: plans, drafts and replies in Marketing, and the tickets behind them", persona: "4-maddy", instructions: "", voice: "af_bella", apps: ["marketing", "tasks"], model: "" },
];

/** A chat with no agent chosen: Talk's first voice, every app, whatever personality the chat asks for. */
export const HEART: Agent = { id: "heart", name: "Heart", about: "Talk's own voice", persona: "", instructions: "", voice: "af_heart", apps: [], model: "" };

type AgentsState = { seeded: boolean; agents: { [id: string]: Agent } };

export const TalkAgents = defineDoc<AgentsState>({
	kind: "talk.agents",
	version: 1,
	scope: "session",
	initial: () => ({ seeded: false, agents: {} }),
	checkpointWhen: () => true,
});

const ID = /^[a-z][a-z0-9-]{0,31}$/;

export class Agents {
	constructor(private readonly harness: () => Harness) {}

	async seed(): Promise<void> {
		const state = await this.harness().snapshot(TalkAgents, ctx);
		if (state?.seeded) return;
		await this.harness().commit(async (tx) => {
			const doc = await tx.doc(TalkAgents);
			if (doc.seeded) return;
			for (const a of SEED) doc.agents[a.id] ??= { ...a };
			doc.seeded = true;
		}, ctx);
	}

	async list(): Promise<Agent[]> {
		return Object.values((await this.harness().snapshot(TalkAgents, ctx))?.agents ?? {});
	}

	async get(id: string | undefined): Promise<Agent | undefined> {
		if (!id) return undefined;
		if (id === HEART.id) return HEART;
		return (await this.harness().snapshot(TalkAgents, ctx))?.agents[id];
	}

	/** Create or change an agent. Unknown fields are ignored; a new agent needs a name. */
	async save(id: string, change: Partial<Agent>): Promise<Agent> {
		if (!ID.test(id) || id === HEART.id) throw new Error("An agent's id is lowercase letters, digits and hyphens, starting with a letter.");
		return this.harness().commit(async (tx) => {
			const doc = await tx.doc(TalkAgents);
			const before = doc.agents[id] as Agent | undefined;
			const next: Agent = {
				id,
				name: String(change.name ?? before?.name ?? "").trim(),
				about: String(change.about ?? before?.about ?? "").trim(),
				persona: String(change.persona ?? before?.persona ?? ""),
				instructions: String(change.instructions ?? before?.instructions ?? ""),
				voice: String(change.voice ?? before?.voice ?? HEART.voice),
				apps: Array.isArray(change.apps) ? change.apps.map(String) : (before?.apps ?? []),
				model: String(change.model ?? before?.model ?? ""),
			};
			if (!next.name) throw new Error("An agent needs a name.");
			doc.agents[id] = next;
			return next;
		}, ctx);
	}

	async remove(id: string): Promise<void> {
		await this.harness().commit(async (tx) => {
			delete (await tx.doc(TalkAgents)).agents[id];
		}, ctx);
	}
}
