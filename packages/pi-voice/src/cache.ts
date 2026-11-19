// A few phrases rendered ahead of time, so they start at once: the words said while a lookup runs ("Let me check.")
// are the same every time, and the silence they fill is exactly the time a render would take.

import { spoken, type Pronunciations } from "./speech.ts";
import type { SpeakOptions, TtsProvider } from "./tts.ts";

export type PhraseCacheOptions = { voice?: string; speed?: number; pronunciations?: Pronunciations };

/**
 * A provider that answers the given phrases from memory. Rendering starts in the background when this is called;
 * a phrase asked for before it is ready, and any other text, goes to the provider as usual.
 */
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
				// not cached: it will be rendered when asked for
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
