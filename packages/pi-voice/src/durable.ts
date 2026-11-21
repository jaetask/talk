
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import { AssistantEntry, LiveDoc, type Conversation, type Harness } from "@earendil-works/pi-durable";
import { Hold } from "./hold.ts";
import type { Brain } from "./loop.ts";

const textOf = (content: readonly { type: string; text?: string }[] | undefined): string =>
	(content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");

export function durableBrain(harness: Harness, conversation: Conversation, context: Context = BACKGROUND_CONTEXT): Brain {
	return {
		async *reply(text, { signal }) {
			const queue: (string | null)[] = [];
			let wake: () => void = () => {};
			const push = (piece: string | null) => {
				if (piece !== "") queue.push(piece);
				wake();
			};
			const hold = new Hold();
			let streamed = "";
			let attempt = -1;
			const watch = (await harness.watchDoc(LiveDoc, conversation.id, context))!;
			watch.start(async (call) => {
				if (call.kind !== "value") return;
				const generation = call.value?.generation;
				if (!generation) return;
				const message = generation.message as { content?: { type: string; text?: string }[] } | undefined;
				if (generation.attempt !== attempt || !textOf(message?.content).startsWith(streamed)) {
					attempt = generation.attempt;
					streamed = "";
				}
				if (message?.content?.some((c) => c.type === "toolCall")) hold.tool();
				const full = textOf(message?.content);
				if (full.length > streamed.length) {
					push(hold.text(full.slice(streamed.length)));
					streamed = full;
				}
			});
			const abort = () => void conversation.abort(context);
			signal.addEventListener("abort", abort);
			const submission = await conversation.submit({ type: "input", content: text }, context);
			const settled = submission.wait(context).then(async (s) => {
				await watch.stop();
				if (s.status === "done" && s.type === "input") {
					const answer = await conversation.commit((tx) => tx.entry(AssistantEntry, s.answer), context);
					const full = textOf((answer?.model?.[0] as { content?: { type: string; text?: string }[] } | undefined)?.content);
					if (full.startsWith(streamed) && full.length > streamed.length) push(hold.text(full.slice(streamed.length)));
					push(hold.end());
				} else if (!signal.aborted) push(`I couldn't answer that (${(s as { reason?: string }).reason ?? s.status}).`);
				push(null);
			});
			try {
				for (;;) {
					while (!queue.length) await new Promise<void>((resolve) => { wake = resolve; });
					const piece = queue.shift()!;
					if (piece === null) return;
					yield piece;
				}
			} finally {
				signal.removeEventListener("abort", abort);
				await settled.catch(() => {});
			}
		},
	};
}
