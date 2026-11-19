// One chat's own state, stored beside its transcript as a Pi Durable document: who is speaking, what they may
// touch, what a dangerous call is waiting on, and what tests need to read back.
import { defineDoc } from "@earendil-works/pi-durable";
import type { Json, JsonObject } from "./apps/classify.ts";

export type Pending = { callId: string; name: string; args: JsonObject; question: string; item: string; askedAt: number };
export type Seen = { app: string; id: string; name: string; record: JsonObject; source: string; turn: number };
export type PretendWrite = { app: string; tool: string; args: JsonObject };

export type ChatState = {
	sid: string;
	/** The speaking agent's id; writes are signed with it. */
	agent: string;
	agentName: string;
	persona: string;
	/** The agent's own instructions, after its role. */
	instructions: string;
	voice: string;
	/** App names this agent may use; empty means every app. */
	apps: string[];
	writes: boolean;
	pretend: boolean;
	onCall: boolean;
	noConfirm: boolean;
	fixtures: { [tool: string]: Json } | null;
	fixturesOnly: boolean;
	turn: number;
	seen: Seen[];
	pending: Pending | null;
	decisions: { [callId: string]: { yes: boolean; said: string; question?: string } };
	pretendLog: PretendWrite[];
	endCall: boolean;
	/**
	 * A long job (a coding session) that holds this chat's run after its turn ended: what was said when it started,
	 * and where it has got to, for when Jae asks.
	 */
	working: { callId: string; started: string; status: string } | null;
	/** The file open beside this chat, and where the reading is. */
	article: { slug: string; index: number; sentence: number; playing: boolean } | null;
	/** What the reader should do once the reply has been spoken (the reader shares the one voice). */
	readerAction: { kind: "open" | "read"; slug: string; index: number; sentence: number; play: boolean } | null;
	/** The submission of the run a parked call belongs to, so the next turn can follow it. */
	runSubmission: number | null;
	[key: string]: Json;
};

export const initialChat = (): ChatState => ({
	sid: "",
	agent: "heart",
	agentName: "Heart",
	persona: "",
	instructions: "",
	voice: "af_heart",
	apps: [],
	writes: false,
	pretend: false,
	onCall: false,
	noConfirm: false,
	fixtures: null,
	fixturesOnly: false,
	turn: 0,
	seen: [],
	pending: null,
	decisions: {},
	pretendLog: [],
	endCall: false,
	working: null,
	article: null,
	readerAction: null,
	runSubmission: null,
});

export const TalkChat = defineDoc<ChatState>({
	kind: "talk.chat",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: initialChat,
	checkpointWhen: () => true,
});

export type ChatRow = {
	conversation: number; agent: string; createdAt: number; title: string;
	/** What the chat was first asked, when it was last active, how many turns it has: kept here so a list needs no scan. */
	first: string; lastAt: number | null; last: string; turns: number;
	pinnedAt: number | null;
	/** A test run (pretend writes): tagged, and kept out of the chat list unless asked for. */
	test: boolean;
};
export type IndexState = { chats: { [sid: string]: ChatRow }; viewed: { [agent: string]: number }; settings: { [key: string]: Json } };

/** sid to conversation, for the whole store. */
export const TalkIndex = defineDoc<IndexState>({
	kind: "talk.index",
	version: 1,
	scope: "session",
	initial: () => ({ chats: {}, viewed: {}, settings: {} }),
	checkpointWhen: () => true,
});

/** What has been cleared from view: single turns, or everything up to a point (Clear chat). The transcript itself is immutable. */
export type RedactionState = { turns: { [turnId: string]: string }; clearedAt: string | null; clearedBefore: number };
export const TalkRedactions = defineDoc<RedactionState>({
	kind: "talk.redactions",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ turns: {}, clearedAt: null, clearedBefore: 0 }),
	checkpointWhen: () => true,
});
