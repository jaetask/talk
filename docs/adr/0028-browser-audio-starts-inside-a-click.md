# 28. Browser audio is created inside the click that starts it

## Context

Browsers block audio that does not start from a user gesture. Audio worklets and microphone permission prompts have behaviours that shape the page's audio code.

## Decision

In `web/src/voice/audio.ts`, `web/src/voice/call.ts` and `web/src/voice/dictation.ts`:

- The AudioContext is created and resumed synchronously inside the click handler, so autoplay rules allow it. Starting a call or dictation must come from a user gesture.
- An audio worklet only runs while it is connected to the destination. The capture worklet is routed through a gain node set to zero.
- The player adds a small lead-in when starting from idle, to absorb network jitter.
- In dictation, if the pointer is released while the microphone permission prompt is still open, the press is treated as a tap, and recording stays on until the next tap.

## Consequences

Do not move AudioContext creation behind an await. Do not disconnect the muted gain; capture stops silently. The lead-in is there for network jitter; do not remove it to save latency without testing on a slow link.
