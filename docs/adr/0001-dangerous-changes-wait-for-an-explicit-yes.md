# 1. A dangerous change waits for an explicit yes on an item a lookup returned

## Context

App tools are classified as lookups, changes or dangerous changes. A dangerous change is a delete, an archive, a payment, a send or a publish. A model can name the wrong item, invent an id, or treat agreement in conversation as permission.

## Decision

The gate is a `beforeTool` hook in `src/ext/gate.ts`; its rules are pure functions in `src/apps/gate.ts`.

- A dangerous call must point at exactly one item that a lookup returned. Items seen in lookups are kept in the chat document for the current turn and the one before. A call that cannot be tied to one seen item is refused, and the refusal tells the model to look the item up.
- When the item is known, the call is parked and the person is asked one short question. The server writes the question from the item's human name. The model never writes it.
- Only an explicit yes to that one question approves the call. Agreeing earlier in the conversation is not approval.
- While something is waiting, whatever the person says next is taken as the answer to it (`src/engine.ts`).
- A feature that needs a yes of its own, such as a step of a coding session, asks through the same function, so the question is again the server's words.

## Consequences

Do not let the model word the confirmation or decide that the person has agreed. Do not widen the yes pattern to loose agreement. Do not let a dangerous call run on an id that no lookup returned. A chat that has no way to ask refuses the call instead of running it.
