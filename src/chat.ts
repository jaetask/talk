import { defineDoc } from "@earendil-works/pi-durable";
import type { Json, JsonObject } from "./apps/classify.ts";

export type Pending = { callId: string; name: string; args: JsonObject; question: string; item: string; askedAt: number };
export type Seen = { app: string; id: string; name: string; record: JsonObject; source: string; turn: number };
export type PretendWrite = { app: string; tool: string; args: JsonObject };

export type ChatState = {
	sid: string;
	agent: string;
	agentName: string;
	persona: string;
	instructions: string;
	voice: string;
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
	working: { callId: string; started: string; status: string } | null;
	article: { slug: string; index: number; sentence: number; playing: boolean } | null;
	readerAction: { kind: "open" | "read"; slug: string; index: number; sentence: number; play: boolean } | null;
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
	first: string; lastAt: number | null; last: string; turns: number;
	pinnedAt: number | null;
	test: boolean;
};
export type IndexState = { chats: { [sid: string]: ChatRow }; viewed: { [agent: string]: number }; settings: { [key: string]: Json } };

export const TalkIndex = defineDoc<IndexState>({
	kind: "talk.index",
	version: 1,
	scope: "session",
	initial: () => ({ chats: {}, viewed: {}, settings: {} }),
	checkpointWhen: () => true,
});

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
