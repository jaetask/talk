# 13. Bots page rows are numbered by turn, and the newest revision wins

## Context

The page draws a conversation from rows. Rows arrive twice: live while a turn runs, and again from the committed transcript. Fetches and the event stream can overlap, and the stream can drop.

## Decision

In `src/bots.ts`:

- One turn's rows sit in a block of a thousand sequence numbers. The turn's place in the chat sets the block, and the kind of row sets its place inside it. A live turn and the committed turn it becomes number their rows the same way, so the committed rows replace the live ones.
- Each row carries a revision. A later revision always wins on the page, whether the row came from a live turn or a reload.
- Turn notices for a chat are handled in order. The engine waits only for a turn's first rows to be placed, not for later ones.
- When a turn ends, the turn before it is drawn again too. A card that was waiting on an answer shows what was answered once the next turn exists.
- A message sent while an answer is in progress aborts that answer and takes over. A long job carries on.
- If the chat is busy with something that will not be interrupted, the send request answers after ten seconds with a placeholder row, so the page is not kept waiting.

On the page:

- Rows fetched are merged with anything that streamed in during the fetch (`web/src/store.ts`).
- There is one EventSource for the whole app. It retries on its own, but a server restart can leave it closed, so the page also reconnects with backoff and resyncs on reconnect (`web/src/lib/events.ts`).

## Consequences

A turn with more rows than its block holds would collide with the next turn; the block layout assumes a bounded number of calls per turn. Do not replace rows by arrival order; compare revisions. Keep the resync on reconnect, or rows sent during an outage are lost.
