# 3. Talk sends the model back to the tool with one note when it answers after a refusal

## Context

After a dangerous call is refused because its item was not looked up, the model often answers without calling the tool again. It asks "shall I?" in words, or it claims the change is done. Either would be spoken to the person as the reply.

## Decision

`src/ext/gate.ts` has an `onYield` hook. If the run's last change was refused for a missing lookup and the model is about to answer, the hook adds one note and continues the run. The note says nothing has changed and tells the model to call the tool with the exact id, where the gate asks the person properly. It is sent at most once per run.

A note from Talk starts with a fixed marker and is placed as a user message. Screens leave these messages out.

In `src/engine.ts`:

- When a note arrives, the text the model had said so far is dropped. It was not the answer.
- After a change comes back refused, the model's words are held until the step ends, so the note can send it back before anything is spoken.

A second hook in `src/ext/gate.ts` handles a tool name the chat does not have: misspelled, another agent's app, a change while changes are off, an offline app, or made up. The error says which case it is, so the model's next step can be the right one.

## Consequences

The note marker is matched by the engine, the hook and the views. Change it in all three or not at all. Keep the once-per-run limit, or a model that keeps answering loops forever. Removing the hold after a refused change lets a false "done" be spoken.
