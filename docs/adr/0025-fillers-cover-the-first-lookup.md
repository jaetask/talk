# 25. A filler phrase is spoken while the first lookup of a spoken turn runs

## Context

A spoken question that needs a lookup is met with silence while the tool runs. Rendering a filler at that moment would take about as long as the silence it is meant to fill.

## Decision

- In `src/server.ts`, when the first tool call of a spoken turn is a lookup and nothing has been said yet, a filler such as "Let me check." is queued. The trigger is the model's decision to look something up. Nothing guesses that from the person's words.
- In `packages/pi-voice/src/loop.ts`, a filler is an aside: it is spoken at once, ahead of the answer, and is not part of the reply's text.
- In `packages/pi-voice/src/cache.ts`, the filler phrases are rendered ahead of time and answered from memory, so they start at once. They are the same words every time.

## Consequences

Do not add fillers to the reply text or the transcript. Do not trigger a filler from keywords in what was heard. A new filler phrase must be added to the pre-rendered set, or it arrives late.
