import type { Context } from "@earendil-works/chord/context";
import {
  AssistantEntry,
  configure,
  type AgentChange,
  type ConversationId,
  type EntryRecord,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import { initialChat, TalkChat, type ChatState } from "../chat.ts";

export type ChildResult = {
  conversation: ConversationId;
  status: "done" | "unanswered";
  reason?: string;
  text: string;
  entries: EntryRecord[];
};

export async function runChild(
  api: ToolExecutionApi<any>,
  context: Context,
  options: { agent: AgentChange; chat?: Partial<ChatState>; task: string; timeoutMs?: number },
): Promise<ChildResult> {
  const child = await api.commit(async (tx) => {
    const existing = (await tx.scanConversations({ ownerTaskId: api.taskId } as never, 1)).items[0];
    if (existing !== undefined) return existing.id;
    const created = await tx.createConversation({
      ownership: { kind: "task", taskId: api.taskId },
    });
    await configure(tx, created.id, options.agent);
    Object.assign(await tx.doc(TalkChat, created.id), initialChat(), options.chat ?? {});
    return created.id;
  }, context);
  await api.details({ conversationId: child as unknown as number } as never, context);
  const handle = (await api.conversation(child, context))!;
  const submission = await handle.submit(
    { type: "input", content: options.task, requestId: `child:${api.taskId}` },
    context,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = options.timeoutMs
    ? new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), options.timeoutMs);
      })
    : undefined;
  const settled = await Promise.race([submission.wait(context), ...(timedOut ? [timedOut] : [])]);
  clearTimeout(timer);
  if (settled === "timeout") await handle.abort(context);
  const entries: EntryRecord[] = [];
  for (let cursor: unknown; ; ) {
    const page = await api.commit(
      (tx) =>
        tx.scanEntries(
          { conversationId: child, order: "ascending" } as never,
          200,
          cursor as never,
        ),
      context,
    );
    entries.push(...page.items);
    cursor = (page as { next?: unknown }).next;
    if (!cursor || !page.items.length) break;
  }
  if (settled === "timeout")
    return { conversation: child, status: "unanswered", reason: "timeout", text: "", entries };
  if (settled.status !== "done" || settled.type !== "input")
    return {
      conversation: child,
      status: "unanswered",
      reason: (settled as { reason?: string }).reason ?? settled.status,
      text: "",
      entries,
    };
  const answer = await api.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
  const message = answer?.model?.[0] as { content: { type: string; text?: string }[] } | undefined;
  return {
    conversation: child,
    status: "done",
    text: (message?.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join(""),
    entries,
  };
}
