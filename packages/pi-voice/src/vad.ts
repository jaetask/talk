import { rms } from "./audio.ts";

export const FRAME = 512;
export const FRAME_MS = 32;

export type Vad = (frame: Float32Array) => number;

export function energyVad(options: { floor?: number; ratio?: number } = {}): Vad {
  let noise = options.floor ?? 0.003;
  const ratio = options.ratio ?? 3.5;
  return (frame) => {
    const level = rms(frame);
    noise = level < noise ? noise * 0.9 + level * 0.1 : noise * 0.999 + level * 0.001;
    const floor = Math.max(noise, 0.0015);
    const over = level / (floor * ratio);
    return Math.max(0, Math.min(1, over / 2));
  };
}

export type TurnEvent = "start" | "end" | "blip" | undefined;

export type DetectorOptions = {
  startMs?: number;
  endMs?: number;
  minSpeechMs?: number;
  threshold?: number;
  prerollMs?: number;
  vad?: Vad;
};

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

  feed(
    frame: Float32Array,
    options: { threshold?: number; startFrames?: number; minRms?: number } = {},
  ): TurnEvent {
    const p = this.vad(frame);
    const need = options.startFrames ?? this.startFrames;
    const speech =
      p >= (options.threshold ?? this.threshold) &&
      (!options.minRms || rms(frame) >= options.minRms);
    this.lastSpeech = speech;
    if (!this.active) {
      this.ring = [...this.ring, frame].slice(-this.preroll);
      this.window = [...this.window, speech].slice(-need);
      const voiced = this.window.filter(Boolean).length;
      if (
        speech &&
        this.window.length === need &&
        voiced >= Math.max(1, Math.floor(need * 0.75 + 0.5))
      ) {
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
