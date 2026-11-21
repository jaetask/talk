# pi-voice

A voice loop in front of any [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable) conversation: speech to text, turn detection, text to speech with swappable voices, and barge-in. TypeScript, no native code, no models to download.

> Experimental, like Pi Durable itself. Extracted from Talk, a local voice assistant.

```ts
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { kokoro, VoiceLoop, whisper } from "pi-voice";
import { durableBrain } from "pi-voice/durable";

const loop = new VoiceLoop({
  stt: whisper({ baseUrl: "http://127.0.0.1:3900" }), // any OpenAI-compatible transcription server
  tts: kokoro(), // local and free; or xai(), elevenlabs()
  brain: durableBrain(harness, await harness.root(context)),
  onAudio: (pcm) => speaker.write(pcm), // PCM16 mono at tts.sampleRate
  onEvent: (event) => console.log(event), // hearing, thinking, heard, sentence, barge, done
});

microphone.on("data", (pcm) => loop.feed(pcm)); // PCM16 mono at 16 kHz, any chunk size
```

## What it does

- **Turn detection.** A streaming detector decides when you have started and finished talking (start after 250 ms of speech, end after 700 ms of silence, both adjustable). A short pause inside a sentence is not the end of the turn.
- **Sentence by sentence.** The reply is spoken as it is written: each sentence goes to the voice as soon as it is complete. The pause between sentences is set here, not by the provider, so every voice has the same rhythm.
- **Barge-in.** Talk over the reply and it stops at once. While the assistant is talking the bar for "that was speech" is higher, and it sits a margin above the assistant's own echo in your microphone, so it does not interrupt itself on speakers.
- **Pronunciations.** A `written=spoken` list fixes how names are said. Markdown, list markers and ids are never spoken.
- **Durable.** With `durableBrain` the thinking is a Pi Durable conversation: stopping the reply aborts its run, and what the model says on its way to a tool call is left out of what is spoken.

## Voices

| Provider                                | Call                                              | Needs                                                                                                       |
| --------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Kokoro, local (default)                 | `kokoro()`                                        | A speech server with OpenAI's `/v1/audio/speech` that can return PCM (Kokoro-FastAPI, VoiceStudio, LocalAI) |
| Kokoro, streaming                       | `kokoroStream()`                                  | A speech server with a `/ws/tts` websocket; reaches first audio sooner                                      |
| xAI (the Grok voices: eve, ara, rex, …) | `xai({ voice: "eve" })`                           | `XAI_API_KEY`                                                                                               |
| ElevenLabs                              | `elevenlabs({ voice: "<voice id>" })`             | `ELEVENLABS_API_KEY`                                                                                        |
| Any OpenAI-compatible server            | `openaiSpeech({ baseUrl, model, voice, apiKey })` |                                                                                                             |

A provider is one function: a sentence in, PCM16 mono chunks out. Writing another is about twenty lines (see `src/providers/`).

## Turn detection and Silero

The detector takes any `Vad`: a function from a 32 ms frame to a speech probability. The one included is energy based (it tracks the room's noise floor), which suits a close microphone and needs nothing installed. A neural VAD such as Silero is more robust in a noisy room; it plugs in as another `Vad` without touching the detector, for example through `onnxruntime-node` (about 300 MB installed, which is why it is not a dependency here).

## Tests

```
npx tsx test/run.ts
```

Expect tests with [`@jaetask/snap`](https://www.npmjs.com/package/@jaetask/snap) over recorded audio fixtures (`test/fixtures/*.wav`): each case is an input file with the approved output beside it. The paid providers have contract tests only: the request each one sends is checked against a stand-in server, and no key is needed.

## Licence

MIT
