# 2. A call that did not get a yes ends its run, and the person's words become the next turn

## Context

When a dangerous call is parked, the person may answer with something other than yes: a no, a correction, or a new request. The model should read this the way a person would, without being asked to interpret a refusal mid-run.

## Decision

In `src/engine.ts`, an answer that is not a yes aborts the waiting run without calling the model. What the person said is then submitted as an ordinary turn after it. In `src/ext/gate.ts`, an `afterTool` hook rewrites the aborted call's result to say it was asked and not done, and that the person's answer is the next message. The model reads "asked, not done" followed by the person's own words.

Two display rules follow from the same idea, both in `src/engine.ts`:

- A change is shown in the chat only once its outcome is known. A held or refused call must not read as one that ran.
- When a run stops to ask, the text the model wrote on the way to the call is dropped. It is not the question.

## Consequences

The declined result text is what the model learns from. Keep it stating plainly that nothing was changed. Do not show a change as started before its result arrives. Do not feed a non-yes answer back into the parked run as a tool result for the model to interpret.
