# 23. The Speaker sets the pauses between sentences

## Context

A reply is spoken one sentence at a time, each rendered separately. Every provider pads its audio with a different amount of silence, so pauses would vary by provider and by sentence.

## Decision

`packages/pi-voice/src/tts.ts` puts a Speaker in front of every provider. The provider streams one sentence as PCM, so playback can start before the sentence is fully rendered. The Speaker trims each sentence's lead-in to a fixed short amount and holds back trailing silence. It then ends the sentence with exactly the configured gap, less the next sentence's own lead-in.

## Consequences

Do not pass provider audio straight through; the gaps become uneven. The gap setting is the whole pause the listener hears, so a provider needs no pause tuning of its own.
