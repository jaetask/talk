# 24. A reply is spoken sentence by sentence while it is still being written

## Context

Waiting for the whole reply before speaking adds seconds of silence. Text arrives in pieces, and a piece can end in the middle of a number or an id.

## Decision

In `packages/pi-voice/src/speech.ts`:

- A sentence that ends the text so far may still be growing ("3." of "3.5"). Only a following space settles it.
- UUIDs and long hex strings are never spoken. They stay in the on-screen text.
- Long text is cut into speakable chunks: sentences, and long sentences at commas. Each chunk says whether it ends a sentence, so a comma cut gets a shorter pause. Short chunks are merged so rendering stays ahead of playback.

In `packages/pi-voice/src/durable.ts`, the last streamed partial may trail the committed answer, so the rest is said when the answer is committed.

In `packages/pi-voice/src/loop.ts`, when nothing was heard no turn happened, and nothing is reported as done.

## Consequences

Do not split on a full stop without the following space; numbers and abbreviations break. Do not report a finished turn for silence, or listeners count turns that never happened.
