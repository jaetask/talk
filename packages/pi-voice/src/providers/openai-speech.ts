// Any server with OpenAI's speech endpoint (POST /v1/audio/speech) that can return raw PCM: Kokoro behind
// Kokoro-FastAPI or VoiceStudio, LocalAI, OpenAI itself. Kokoro on this machine is the default voice.

import type { SpeakOptions, TtsProvider } from "../tts.ts";

export type OpenAiSpeechOptions = {
	baseUrl: string;
	model: string;
	voice?: string;
	apiKey?: string;
	sampleRate?: number;
	name?: string;
	fetch?: typeof fetch;
};

export async function* streamBody(res: Response): AsyncIterable<Uint8Array> {
	if (!res.body) return;
	for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) yield chunk;
}

export async function failure(provider: string, res: Response): Promise<Error> {
	return new Error(`${provider} answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

export function openaiSpeech(options: OpenAiSpeechOptions): TtsProvider {
	const name = options.name ?? "openai-speech";
	return {
		name,
		sampleRate: options.sampleRate ?? 24000,
		async *synthesize(text: string, speak: SpeakOptions = {}) {
			const res = await (options.fetch ?? fetch)(`${options.baseUrl.replace(/\/$/, "")}/v1/audio/speech`, {
				method: "POST",
				headers: { "content-type": "application/json", ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}) },
				body: JSON.stringify({ model: options.model, voice: speak.voice ?? options.voice ?? "af_heart", input: text, response_format: "pcm", speed: speak.speed ?? 1 }),
				signal: speak.signal,
			});
			if (!res.ok) throw await failure(name, res);
			yield* streamBody(res);
		},
	};
}

/** Kokoro, local and free: by default the speech server already running on this machine. */
export function kokoro(options: Partial<OpenAiSpeechOptions> = {}): TtsProvider {
	return openaiSpeech({ baseUrl: "http://127.0.0.1:3900", model: "mlx-audio", voice: "af_heart", name: "kokoro", ...options });
}
