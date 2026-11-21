# 10. Old exchanges are summarised only when the window is nearly full, never in the background

## Context

The local context is about 24k tokens. There is one model on one GPU, so a background summarising call competes with the reply the person is waiting for.

## Decision

The harness settings in `src/engine.ts` keep the newest exchanges word for word, fold older ones into a summary only when the window is nearly full, and set background compaction to zero.

## Consequences

Do not turn on background compaction while the model and the reply share one GPU. The reserve and keep-recent sizes are tuned to the 24k context; change them together with the context size.
