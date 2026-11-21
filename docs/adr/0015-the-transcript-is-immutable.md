# 15. The transcript is immutable; clearing hides, it does not delete

## Context

A person can clear one turn or a whole chat. The durable transcript is append-only, and other records refer to its entries.

## Decision

`src/chat.ts` and `src/store.ts` keep a record of what has been cleared from view: single turns, or everything up to a point.

- Clearing one turn stops it being shown, exported or made into a test. The words stay in the store's file.
- Clear chat hides every message so far. The rows stay as placeholders, so the conversation keeps its shape. The model starts from nothing and no longer sees any of it.

## Consequences

Clearing is not deletion. Anyone who needs the words gone must remove them from the store's file by other means. Every new screen or export must apply the cleared record, or hidden turns reappear.
