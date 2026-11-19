// ElevenLabs text to speech (POST /v1/text-to-speech/{voice}/stream), as raw PCM. Paid; the key comes from the
// environment (ELEVENLABS_API_KEY) unless given. A voice is one of your account's voice ids.

import { failure, streamBody } from "./openai-speech.ts";
import type { SpeakOptions, TtsProvider } from "../tts.ts";

export type ElevenLabsOptions = { apiKey?: string; voice?: string; model?: string; baseUrl?: string; sampleRate?: 16000 | 22050 | 24000 | 44100; fetch?: typeof fetch };

export function elevenlabs(options: ElevenLabsOptions = {}): TtsProvider {
	const sampleRate = options.sampleRate ?? 24000;
	return {
		name: "elevenlabs",
		sampleRate,
		async *synthesize(text: string, speak: SpeakOptions = {}) {
			const key = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
			if (!key) throw new Error("elevenlabs: no API key. Set ELEVENLABS_API_KEY.");
			const voice = speak.voice ?? options.voice;
			if (!voice) throw new Error("elevenlabs: no voice. Give one of your account's voice ids.");
			const res = await (options.fetch ?? fetch)(
				`${(options.baseUrl ?? "https://api.elevenlabs.io").replace(/\/$/, "")}/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=pcm_${sampleRate}`,
				{
					method: "POST",
					headers: { "content-type": "application/json", "xi-api-key": key },
					body: JSON.stringify({ text, model_id: options.model ?? "eleven_multilingual_v2", ...(speak.speed && speak.speed !== 1 ? { voice_settings: { speed: speak.speed } } : {}) }),
					signal: speak.signal,
				},
			);
			if (!res.ok) throw await failure("elevenlabs", res);
			yield* streamBody(res);
		},
	};
}
