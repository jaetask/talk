// Text to speech. A provider turns one sentence into PCM16 mono audio at its own sample rate, as a stream, so
// playback can start before the sentence is fully rendered. The Speaker in front of it sets the pauses: every
// provider pads its audio differently, so the lead-in is trimmed and the gap between sentences is ours.

import { concat, firstLoudSample, lastLoudSample } from "./audio.ts";
import { spoken, type Pronunciations } from "./speech.ts";

export type SpeakOptions = { voice?: string; speed?: number; signal?: AbortSignal };

export interface TtsProvider {
	readonly name: string;
	/** Samples per second of the audio it returns. */
	readonly sampleRate: number;
	/** One sentence as PCM16 mono chunks. */
	synthesize(text: string, options?: SpeakOptions): AsyncIterable<Uint8Array>;
	/** Release anything held open (a websocket). */
	close?(): Promise<void> | void;
}

export const LEADING_SILENCE_MS = 50;

export type SpeakerOptions = {
	voice?: string;
	speed?: number;
	/** Pause between sentences, in milliseconds. */
	gapMs?: number;
	pronunciations?: Pronunciations;
	/** Where the audio goes: a websocket, a file, a sound card. */
	onAudio: (pcm: Uint8Array) => void | Promise<void>;
};

/** Speaks sentences one after another through a provider. */
export class Speaker {
	/** When the first audio of this speaker was sent, by `performance.now()`. */
	firstAudioAt?: number;
	/** Seconds of audio sent so far: with the time it started, when playback will end. */
	seconds = 0;
	private held: Uint8Array = new Uint8Array(0);
	private sentenceStart = true;
	private stopped = false;
	private readonly abort = new AbortController();

	constructor(readonly provider: TtsProvider, private readonly options: SpeakerOptions) {}

	private async send(pcm: Uint8Array): Promise<void> {
		if (!pcm.byteLength || this.stopped) return;
		this.firstAudioAt ??= performance.now();
		this.seconds += pcm.byteLength / 2 / this.provider.sampleRate;
		await this.options.onAudio(pcm);
	}

	/** Forward audio, holding back trailing silence so the gap between sentences is ours to set. */
	private async out(pcm: Uint8Array): Promise<void> {
		pcm = pcm.subarray(0, pcm.byteLength & ~1);
		if (!pcm.byteLength) return;
		const last = lastLoudSample(pcm);
		if (last < 0) {
			this.held = concat(this.held, pcm);
			return;
		}
		const cut = (last + 1) * 2;
		let chunk = concat(this.held, pcm.subarray(0, cut));
		if (this.sentenceStart) {
			const keep = Math.round((LEADING_SILENCE_MS * this.provider.sampleRate) / 1000) * 2;
			chunk = chunk.subarray(Math.max(0, firstLoudSample(chunk) * 2 - keep));
			this.sentenceStart = false;
		}
		await this.send(chunk);
		this.held = pcm.slice(cut);
	}

	/** End a sentence with exactly the gap (less the next sentence's own lead-in). */
	private async gap(): Promise<void> {
		const target = Math.round((Math.max(0, (this.options.gapMs ?? 250) - LEADING_SILENCE_MS) * this.provider.sampleRate) / 1000) * 2;
		const out = new Uint8Array(target);
		out.set(this.held.subarray(0, target));
		this.held = new Uint8Array(0);
		this.sentenceStart = true;
		await this.send(out);
	}

	/** Say one sentence. Text with nothing speakable in it (a bare list marker) is skipped. */
	async say(sentence: string): Promise<void> {
		const text = spoken(sentence, this.options.pronunciations);
		if (!/\w/.test(text) || this.stopped) return;
		let odd: Uint8Array = new Uint8Array(0); // a chunk may end mid-sample
		for await (const chunk of this.provider.synthesize(text, { voice: this.options.voice, speed: this.options.speed, signal: this.abort.signal })) {
			if (this.stopped) return;
			const joined = odd.byteLength ? concat(odd, chunk) : chunk;
			const even = joined.byteLength & ~1;
			odd = joined.slice(even);
			await this.out(joined.subarray(0, even));
		}
		await this.gap();
	}

	/** Stop at once (the person started talking): nothing more is sent, and the provider's request is cancelled. */
	stop(): void {
		this.stopped = true;
		this.abort.abort();
	}
}
