# 22. Turn detection uses an energy VAD behind a small interface

## Context

The loop has to decide when the person starts and stops talking. A neural detector needs a model and native code. The expected setup is a close microphone.

## Decision

`packages/pi-voice/src/vad.ts` gives each 32 ms frame a speech probability from its energy. It tracks the room's noise floor and calls anything well above it speech. It needs no model and no native code, and it is good enough for a close microphone. A neural VAD plugs in as another `Vad` function without touching the detector.

- The noise floor follows quiet frames quickly and loud ones very slowly, so speech does not raise it.
- An utterance starts when most of the recent window is speech. This tolerates the short gaps between words.

## Consequences

Far-field microphones and noisy rooms are outside what this detector handles well; use another `Vad` there. Do not make the floor follow loud frames faster, or long speech raises the floor and cuts itself off.
