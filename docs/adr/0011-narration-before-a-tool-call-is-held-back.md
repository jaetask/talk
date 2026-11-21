# 11. What a model says on the way to a tool call is kept out of the reply

## Context

The reply is spoken. Models say things like "I'll look that up" before a tool call, whatever the prompt tells them. Spoken aloud, that is noise, and it delays the answer.

## Decision

`src/hold.ts` and `packages/pi-voice/src/hold.ts` hold text at the start of each model step.

- A tool call while text is held makes it narration, and it is dropped.
- Once the held text runs past the limit it is an answer, and it streams from there.
- At the end of the turn whatever is held is the answer. A turn is never left silent: if all the model said came before a tool call, that is the answer.
- Ending the call comes after the answer, so text held before an end-call tool is kept and said first.
- When the agent chooses to say nothing this turn, what it wrote on the way is not spoken.
- A new model step after a tool call marks the earlier text as narration (`packages/pi-voice/src/durable.ts`).

The limit is 300 characters in the Hold itself. Talk's configured default is 0 (`src/config.ts`): the local model did not narrate in 0 of 104 tool steps measured, so its words are spoken as they come. A limit of 0 is right only for a model that never talks on its way to a tool call.

## Consequences

Raise the limit before using a model that narrates. Holding adds delay to the first spoken word, so do not raise it without need. Do not drop held text at the end of a turn.
