// The voice loop: a microphone stream in, a spoken reply out, with the thinking done by any "brain" that turns what
// was heard into a stream of text. It decides when the person has finished talking, has the reply spoken sentence by
// sentence as it is written, and stops at once when the person talks over it (barge-in).

import { BARGE_MS, BARGE_RMS, BARGE_THRESHOLD, bargeGate, ECHO_FRAMES, rms, toFloat } from "./audio.ts";
import { SentenceStream, type Pronunciations } from "./speech.ts";
import type { SttProvider } from "./stt.ts";
import { Speaker, type TtsProvider } from "./tts.ts";
import { FRAME, FRAME_MS, TurnDetector, type DetectorOptions } from "./vad.ts";

/** Words to say while working ("Let me check."): spoken, but not part of the reply's text. */
export type Aside = { aside: string };

/**
 * What does the thinking: given what the person said, the reply as it is written, piece by piece. A brain may also
 * yield an aside to fill a silence while it looks something up. Stop when the signal aborts.
 */
export interface Brain {
	reply(text: string, options: { signal: AbortSignal }): AsyncIterable<string | Aside>;
}

export type Timings = { asr?: number; first_token?: number; first_sentence?: number; first_audio?: number; total?: number };

export type LoopEvent =
	| { type: "state"; state: "listening" | "hearing" | "thinking" | "speaking" }
	| { type: "heard"; text: string }
	| { type: "token"; text: string }
	| { type: "sentence"; text: string }
	| { type: "barge" }
	| { type: "done"; text: string; interrupted: boolean; timings: Timings }
	| { type: "error"; text: string };

export type VoiceLoopOptions = {
	stt: SttProvider;
	tts: TtsProvider;
	brain: Brain;
	detector?: DetectorOptions;
	voice?: string;
	speed?: number;
	gapMs?: number;
	pronunciations?: Pronunciations;
	/** Words likely to be said (names, products), to prime speech recognition. */
	vocabulary?: string;
	/** Corrections to what was heard, before the brain sees it (known mishearings of names). */
	fixHeard?: (text: string) => string;
	/** How loud the person must be to interrupt, 0..1; 1 or more never interrupts. */
	bargeRms?: number;
	onEvent?: (event: LoopEvent) => void | Promise<void>;
	/** The reply's audio, PCM16 mono at the provider's sample rate. */
	onAudio: (pcm: Uint8Array) => void | Promise<void>;
	/** The clock, in milliseconds. Tests drive it from the audio they feed. */
	now?: () => number;
};

const SAMPLE_RATE = 16000;

export class VoiceLoop {
	readonly detector: TurnDetector;
	private buffer: Uint8Array = new Uint8Array(0);
	private echo: number[] = [];
	private strong = 0;
	private playUntil = 0;
	private turn?: { abort: AbortController; speaker?: Speaker; done: Promise<void> };
	private readonly now: () => number;

	constructor(private readonly options: VoiceLoopOptions) {
		this.detector = new TurnDetector(options.detector);
		this.now = options.now ?? (() => performance.now());
	}

	private emit(event: LoopEvent): void | Promise<void> {
		return this.options.onEvent?.(event);
	}

	/** Is a reply being thought of, spoken, or still playing at the listener's end? */
	get busy(): boolean {
		return this.turn !== undefined || this.now() < this.playUntil;
	}

	/** Microphone audio: PCM16 mono at 16 kHz, in chunks of any size. */
	async feed(pcm: Uint8Array): Promise<void> {
		const joined = new Uint8Array(this.buffer.byteLength + pcm.byteLength);
		joined.set(this.buffer);
		joined.set(pcm, this.buffer.byteLength);
		let at = 0;
		for (; joined.byteLength - at >= FRAME * 2; at += FRAME * 2) await this.frame(toFloat(joined.slice(at, at + FRAME * 2)));
		this.buffer = joined.slice(at);
	}

	private async frame(frame: Float32Array): Promise<void> {
		const busy = this.busy;
		let gate = 0;
		if (busy) {
			// Learn what the assistant's own voice sounds like in the microphone, only while the person isn't talking.
			if (!this.detector.active) this.echo = [...this.echo, rms(frame)].slice(-ECHO_FRAMES);
			gate = bargeGate(this.echo, this.options.bargeRms ?? BARGE_RMS);
		}
		// The gate applies while the assistant talks even mid-utterance, so its own echo can't hold the detector open.
		const event = this.detector.feed(frame, busy ? { threshold: BARGE_THRESHOLD, startFrames: Math.round(BARGE_MS / FRAME_MS), minRms: gate } : {});
		if (busy && this.detector.active && event === undefined) {
			// The person started talking just before the assistant did: barge once their speech stays above the gate.
			this.strong = this.detector.lastSpeech ? this.strong + 1 : 0;
			if (this.strong >= Math.round(BARGE_MS / FRAME_MS)) {
				this.strong = 0;
				await this.barge();
			}
		} else this.strong = 0;
		if (event === "start") {
			if (busy) await this.barge();
			await this.emit({ type: "state", state: "hearing" });
		} else if (event === "end") {
			const audio = this.detector.utterance();
			const pcm = new Uint8Array(audio.length * 2);
			const view = new DataView(pcm.buffer);
			for (let i = 0; i < audio.length; i++) view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32767))), true);
			await this.emit({ type: "state", state: "thinking" });
			this.start(pcm, undefined);
		} else if (event === "blip") await this.emit({ type: "state", state: "listening" });
	}

	/** A typed message: the same turn without speech recognition. */
	say(text: string): Promise<void> {
		void this.interrupt();
		return this.start(undefined, text);
	}

	/** Stop the reply at once, as when the person talks over it. */
	async interrupt(): Promise<void> {
		const turn = this.turn;
		this.playUntil = 0;
		if (!turn) return;
		turn.abort.abort();
		turn.speaker?.stop();
		await turn.done.catch(() => {});
	}

	private async barge(): Promise<void> {
		void this.interrupt();
		await this.emit({ type: "barge" });
	}

	/**
	 * Tell the loop that other audio is playing at the listener's end for this long (a file being read aloud), so that
	 * talking over it counts as barging in.
	 */
	playing(ms: number): void {
		this.playUntil = Math.max(this.playUntil, this.now() + Math.max(0, ms));
	}

	/** Resolves when the reply in progress (if any) has been fully handed over. */
	async idle(): Promise<void> {
		await this.turn?.done.catch(() => {});
	}

	async close(): Promise<void> {
		await this.interrupt();
		await this.options.tts.close?.();
	}

	private start(audio: Uint8Array | undefined, typed: string | undefined): Promise<void> {
		const abort = new AbortController();
		const turn: NonNullable<VoiceLoop["turn"]> = { abort, done: Promise.resolve() };
		turn.done = this.run(turn, audio, typed).finally(() => {
			if (this.turn === turn) this.turn = undefined;
		});
		this.turn = turn;
		return turn.done;
	}

	private async run(turn: NonNullable<VoiceLoop["turn"]>, audio: Uint8Array | undefined, typed: string | undefined): Promise<void> {
		const t0 = this.now();
		const since = () => (this.now() - t0) / 1000;
		const timings: Timings = {};
		const signal = turn.abort.signal;
		let reply = "";
		let nothing = false; // nothing was heard: no turn happened, so nothing is reported as done
		try {
			let heard = typed ?? "";
			if (audio) {
				heard = await this.options.stt.transcribe(audio, SAMPLE_RATE, { prompt: this.options.vocabulary, signal });
				timings.asr = since();
				heard = this.options.fixHeard ? this.options.fixHeard(heard) : heard;
			}
			if (signal.aborted) return;
			if (!heard.trim()) {
				nothing = true;
				return;
			}
			await this.emit({ type: "heard", text: heard });

			const speaker = new Speaker(this.options.tts, {
				voice: this.options.voice,
				speed: this.options.speed,
				gapMs: this.options.gapMs,
				pronunciations: this.options.pronunciations,
				onAudio: async (pcm) => {
					if (signal.aborted) return;
					if (timings.first_audio === undefined) {
						timings.first_audio = since();
						await this.emit({ type: "state", state: "speaking" });
					}
					// When the listener's end will finish playing what has been sent so far.
					this.playUntil = Math.max(this.playUntil, this.now()) + (pcm.byteLength / 2 / this.options.tts.sampleRate) * 1000;
					await this.options.onAudio(pcm);
				},
			});
			turn.speaker = speaker;

			// Sentences are spoken in order while the reply is still being written.
			const sentences: string[] = [];
			let wake: () => void = () => {};
			let written = false;
			const speaking = (async () => {
				for (;;) {
					while (!sentences.length && !written) await new Promise<void>((resolve) => { wake = resolve; });
					const next = sentences.shift();
					if (next === undefined) return;
					if (signal.aborted) return;
					await speaker.say(next);
				}
			})();
			const stream = new SentenceStream();
			const take = async (list: string[]) => {
				for (const sentence of list) {
					timings.first_sentence ??= since();
					sentences.push(sentence);
					wake();
					await this.emit({ type: "sentence", text: sentence });
				}
			};
			try {
				for await (const piece of this.options.brain.reply(heard, { signal })) {
					if (signal.aborted) break;
					if (typeof piece !== "string") {
						// an aside is spoken at once, ahead of the answer, and is not part of it
						sentences.push(piece.aside);
						wake();
						continue;
					}
					timings.first_token ??= since();
					reply += piece;
					await this.emit({ type: "token", text: piece });
					await take(stream.push(piece));
				}
				if (!signal.aborted) await take(stream.flush());
			} finally {
				written = true;
				wake();
			}
			await speaking;
		} catch (error) {
			if (!signal.aborted) await this.emit({ type: "error", text: String((error as Error)?.message ?? error).slice(0, 300) });
		} finally {
			timings.total = since();
			if (!nothing) await this.emit({ type: "done", text: reply.trim(), interrupted: signal.aborted, timings });
			if (!signal.aborted) await this.emit({ type: "state", state: "listening" });
		}
	}
}
