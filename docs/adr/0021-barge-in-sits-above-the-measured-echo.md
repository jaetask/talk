# 21. The barge-in level sits a margin above the echo measured at the microphone

## Context

The person can talk over the assistant to stop it. On speakers the assistant's own voice reaches the microphone. Echo cancellation also turns the person's voice down while the assistant talks, so a fixed loudness level fails.

## Decision

In `packages/pi-voice/src/audio.ts` and `packages/pi-voice/src/loop.ts`:

- While the assistant talks, detection is stricter (a speech threshold of 0.7) to resist its own voice in the microphone.
- A barge needs about 256 ms of strong speech. A one-word "stop" is about 250 ms.
- The default level is 0.045 RMS, about -30 dBFS: close-microphone speech, not speaker leakage.
- The loop keeps about two seconds of microphone level measured while the assistant talks, and only while the person is not talking. The gate sits a margin above that echo and never above the person's own setting. A setting of 1 or more never barges.
- The gate applies while the assistant talks even in the middle of an utterance, so the assistant's own echo cannot hold the detector open.
- If the person started talking just before the assistant did, the loop barges once their speech stays above the gate.
- Other audio playing at the listener's end, such as a file being read aloud, is reported to the loop with its length, so talking over it counts as barging in.

## Consequences

These numbers depend on each other. After changing one, test barge-in on speakers and on a headset. Do not learn the echo level while the person is talking, or their voice raises the gate.
