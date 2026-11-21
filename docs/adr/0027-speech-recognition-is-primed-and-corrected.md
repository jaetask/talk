# 27. Speech recognition is primed with a sentence, and known mishearings are corrected as spelling

## Context

Whisper mishears names and product words. It accepts a prompt, which it reads as the words said just before the clip.

## Decision

- `packages/pi-voice/src/stt.ts` passes a vocabulary prompt with each clip.
- Because Whisper reads the prompt as preceding speech, `src/voice.ts` writes it as a sentence that spells the names. A sentence biases it more than a list of words.
- `src/voice.ts` also corrects known mishearings in the transcript, for example an app name heard as a shorter word. This is a spelling fix applied before the model sees the text. It triggers nothing.

## Consequences

Do not turn the corrections into commands or intent matching. Keep the prompt as natural sentences. Corrections are specific to one voice and one set of names; review them when either changes.
