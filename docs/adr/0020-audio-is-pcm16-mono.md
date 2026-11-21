# 20. Audio is 16-bit little-endian mono PCM: 16 kHz up, the provider's rate down

## Context

Microphone audio, speech recognition, voice providers and the browser all need to agree on a format. Providers render at different sample rates.

## Decision

`packages/pi-voice/src/audio.ts` uses 16-bit little-endian mono PCM throughout. The microphone sends 16 kHz. Audio to the speaker is at the provider's own rate, 24 kHz for Kokoro. The page's call code sends the microphone as 16 kHz PCM16 and plays the reply as 24 kHz PCM16 (`page/voice/call.ts`). A provider's chunk may end in the middle of a sample, so the speaker carries the odd byte over to the next chunk (`packages/pi-voice/src/tts.ts`).

## Consequences

The turn detector's frame size assumes 16 kHz. A provider with another output rate must report it, and the page must play at that rate. Do not drop the odd-byte handling; samples are two bytes and every later sample would be misaligned.
