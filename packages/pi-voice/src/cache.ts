
import { spoken, type Pronunciations } from "./speech.ts";
import type { SpeakOptions, TtsProvider } from "./tts.ts";

export type PhraseCacheOptions = { voice?: string; speed?: number; pronunciations?: Pronunciations };

export function withPhrases(provider: TtsProvider, phrases: readonly string[], options: PhraseCacheOptions = {}): TtsProvider {
	const key = (text: string, speak: SpeakOptions) => JSON.stringify([text, speak.voice ?? options.voice ?? "", speak.speed ?? options.speed ?? 1]);
	const ready = new Map<string, Uint8Array[]>();
	void (async () => {
		for (const phrase of phrases) {
			const text = spoken(phrase, options.pronunciations);
			try {
				const chunks: Uint8Array[] = [];
				for await (const chunk of provider.synthesize(text, { voice: options.voice, speed: options.speed })) chunks.push(chunk.slice());
				ready.set(key(text, {}), chunks);
			} catch {
			}
		}
	})();
	return {
		name: provider.name,
		sampleRate: provider.sampleRate,
		async *synthesize(text, speak = {}) {
			const hit = ready.get(key(text, speak));
			if (hit) yield* hit;
			else yield* provider.synthesize(text, speak);
		},
		close: () => provider.close?.(),
	};
}
