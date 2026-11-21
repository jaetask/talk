# 6. A change is never sent twice; a lookup is retried once

## Context

An app's MCP session can expire, or the app can restart, in the middle of a call. Retrying a lookup is harmless. Retrying a change can do it twice. Durable execution can also replay a tool call after a crash.

## Decision

- In `src/apps/registry.ts`, a lookup that fails is tried once more on a fresh connection. A change that breaks mid-call throws, and the caller reports that the outcome is unknown.
- In `src/ext/apps.ts`, a change is signed with the speaking agent and carries a retry key. The key is memoised with the call, so a replay of the same call sends the same key and the app can recognise it.
- The signing and retry arguments are filled in by Talk. The model never sees or sets them (`src/apps/classify.ts`).
- The ticket app gives actors generated ids, so the speaking agent is matched to its actor by name (`src/ext/apps.ts`).

## Consequences

Do not add a retry around change calls. Do not generate the retry key outside the memo, or a replay sends a new key. Do not expose the filled-in arguments in the schema shown to the model.
