import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { defineDoc, type Harness } from "@earendil-works/pi-durable";

export type Agent = {
	id: string;
	name: string;
	about: string;
	persona: string;
	instructions: string;
	voice: string;
	apps: string[];
	model: string;
};

export const SEED: Agent[] = [
	{ id: "cooper", name: "Cooper", about: "the lead: every app, and the one to ask when unsure", persona: "3-cooper", instructions: "", voice: "af_heart", apps: [], model: "" },
	{ id: "maddy", name: "Maddy", about: "the marketer: plans, drafts and replies in Marketing, and the tickets behind them", persona: "4-maddy", instructions: "", voice: "af_bella", apps: ["marketing", "tasks"], model: "" },
];

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
