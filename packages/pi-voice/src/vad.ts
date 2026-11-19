// Turn detection: when the person starts and stops talking, from a stream of 16 kHz frames.
//
// A `Vad` gives each 32 ms frame a speech probability. The one shipped here is energy based (it tracks the room's
// noise floor and calls anything well above it speech): no model, no native code, good enough for a close
// microphone. A neural VAD such as Silero plugs in as another `Vad` without touching the detector.

import { rms } from "./audio.ts";

export const FRAME = 512; // samples at 16 kHz: 32 ms
export const FRAME_MS = 32;

export type Vad = (frame: Float32Array) => number;

/** An energy VAD: probability rises with how far the frame is above the tracked noise floor. */
export function energyVad(options: { floor?: number; ratio?: number } = {}): Vad {
	let noise = options.floor ?? 0.003;
	const ratio = options.ratio ?? 3.5; // speech is at least this many times the noise floor
	return (frame) => {
		const level = rms(frame);
		// The floor follows quiet frames quickly and loud ones very slowly, so speech does not raise it.
		noise = level < noise ? noise * 0.9 + level * 0.1 : noise * 0.999 + level * 0.001;
		const floor = Math.max(noise, 0.0015);
		const over = level / (floor * ratio);
		return Math.max(0, Math.min(1, over / 2)); // 0.5 at the speech threshold, 1 at twice it
	};
}

export type TurnEvent = "start" | "end" | "blip" | undefined;

export type DetectorOptions = { startMs?: number; endMs?: number; minSpeechMs?: number; threshold?: number; prerollMs?: number; vad?: Vad };

/** Turns per-frame speech probabilities into utterance start and end events. */
export class TurnDetector {
	private readonly vad: Vad;
	private startFrames: number;
	endFrames: number;
	private minFrames: number;
	private preroll: number;
	private threshold: number;
	private ring: Float32Array[] = [];
	private window: boolean[] = [];
	private silent = 0;
	private speechFrames = 0;
	private frames: Float32Array[] = [];
	private finished: Float32Array[] = [];
	active = false;
	/** Was the newest frame speech? A caller watches this to barge in on an utterance that began before the assistant spoke. */
	lastSpeech = false;

	constructor(options: DetectorOptions = {}) {
		this.vad = options.vad ?? energyVad();
		this.startFrames = Math.max(1, Math.round((options.startMs ?? 250) / FRAME_MS));
		this.endFrames = Math.max(1, Math.round((options.endMs ?? 700) / FRAME_MS));
		this.minFrames = Math.max(1, Math.round((options.minSpeechMs ?? 300) / FRAME_MS));
		this.preroll = Math.max(1, Math.round((options.prerollMs ?? 300) / FRAME_MS));
		this.threshold = options.threshold ?? 0.5;
	}

	reset(): void {
		this.ring = [];
		this.window = [];
		this.active = false;
		this.silent = 0;
		this.speechFrames = 0;
		this.frames = [];
	}

	/**
	 * Feed one frame. Returns "start" when an utterance begins, "end" when it is over (then `utterance()` holds its
	 * audio) and "blip" when what started was too short to be speech. `minRms` gates out quiet speech, such as the
	 * assistant's own voice leaking from the speakers.
	 */
	feed(frame: Float32Array, options: { threshold?: number; startFrames?: number; minRms?: number } = {}): TurnEvent {
		const p = this.vad(frame);
		const need = options.startFrames ?? this.startFrames;
		const speech = p >= (options.threshold ?? this.threshold) && (!options.minRms || rms(frame) >= options.minRms);
		this.lastSpeech = speech;
		if (!this.active) {
			this.ring = [...this.ring, frame].slice(-this.preroll);
			// Start when most of the recent window is speech: tolerant of the short gaps between words.
			this.window = [...this.window, speech].slice(-need);
			const voiced = this.window.filter(Boolean).length;
			if (speech && this.window.length === need && voiced >= Math.max(1, Math.floor(need * 0.75 + 0.5))) {
				this.active = true;
				this.silent = 0;
				this.speechFrames = voiced;
				this.window = [];
				this.frames = [...this.ring];
				return "start";
			}
			return undefined;
		}
		this.frames.push(frame);
		if (speech) {
			this.silent = 0;
			this.speechFrames++;
			return undefined;
		}
		this.silent++;
		if (this.silent < this.endFrames) return undefined;
		const enough = this.speechFrames >= this.minFrames;
		this.finished = this.frames;
		this.reset();
		return enough ? "end" : "blip";
	}

	/** The audio of the utterance that just ended, as floats in -1..1. */
	utterance(): Float32Array {
		const out = new Float32Array(this.finished.reduce((n, f) => n + f.length, 0));
		let at = 0;
		for (const f of this.finished) {
			out.set(f, at);
			at += f.length;
		}
		return out;
	}
}
