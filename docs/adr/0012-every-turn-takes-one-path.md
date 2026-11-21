# 12. Every turn takes one path, and screens are drawn from the committed transcript

## Context

A turn can be typed on the page, spoken on a call, started by a test, or come from a long job reporting back. If each had its own path, the screens, the voice loop and the tests would disagree about what happened.

## Decision

- Every chat is a durable conversation, and every mode shares one path in `src/engine.ts`. A turn submits what was said and follows the run through the conversation's watch, so a screen, a voice loop and a test see the same events.
- The engine writes one turn record into the transcript: the turn as the person saw it. Screens are drawn from these records and the entries between them, so a chat reopened later shows exactly what happened.
- `src/views.ts` is pure functions over committed entries. The chat, the Trajectory, an export and a test case are the same facts.
- On the bots page (`src/bots.ts`) rows are derived from the committed transcript. A reload shows what a live turn showed, and a turn started anywhere arrives on the same event stream.
- A voice call talks to the same chat the page shows, so what was said lands in the transcript like a typed turn (`web/src/voice/call.ts`).
- Websocket messages other than audio are handled in the order they arrived. A config must be in place before the text that follows it (`src/server.ts`).

## Consequences

Do not add a second way to run a turn. Do not keep screen state that the transcript cannot rebuild. Do not handle websocket messages concurrently.
