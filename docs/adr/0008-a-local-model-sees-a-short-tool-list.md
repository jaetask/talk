# 8. A local model is shown a short tool list; the rest wait behind tool search

## Context

Talk is built for a local model with a small context. Several connected apps can offer far more tools than fit in the prompt, and full JSON schemas cost many tokens.

## Decision

- Each app's skill lists the tools offered without a search. For a skill with no list, the tools its text names are offered; failing that, the app's plain listings, meaning lookups that need no argument (`src/apps/registry.ts`). Everything else waits behind tool search, so the prompt stays small whichever apps are connected.
- The prompt names the hidden tools by the words a person uses for them, so the model knows they exist. Naming one loads it. That listing never calls anything (`src/ext/apps.ts`).
- The harness offers every tool the chat may call. The model is shown the short list, and a tool it names or finds joins the list from then on (`src/model/ollama.ts`, `src/models.ts`). The list only grows within a chat, so the start of the prompt stays cached.
- The schema shown to the model drops regex patterns, formats, length and range limits and union roots. They cost tokens and only matter to the app, which still validates the real schema (`src/apps/classify.ts`).
- Framework helper tools, and image or export tools, are not offered at all. They make no sense in a spoken answer.
- For read-only turns the skill text leaves out sections and lines that name write tools, so the model is not told about tools it does not have (`src/apps/skills.ts`).
- The names list in the prompt (projects, owners) is a spelling aid for tool arguments, so a misheard name can be put right. What a project holds is always looked up (`src/apps/compact.ts`).
- An app extension only adds tools. It never removes another app's.

## Consequences

Do not shrink the shown list within a chat; that breaks the prompt cache. Do not rely on the trimmed schema for validation. Do not answer from the names list as if it were data.
