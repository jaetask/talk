import { concat, firstLoudSample, lastLoudSample } from "./audio.ts";
import { spoken, type Pronunciations } from "./speech.ts";

export type SpeakOptions = { voice?: string; speed?: number; signal?: AbortSignal };

export interface TtsProvider {
  readonly name: string;
  readonly sampleRate: number;
  synthesize(text: string, options?: SpeakOptions): AsyncIterable<Uint8Array>;
  close?(): Promise<void> | void;
}

export const LEADING_SILENCE_MS = 50;

export type SpeakerOptions = {
  voice?: string;
  speed?: number;
  gapMs?: number;
  pronunciations?: Pronunciations;
  onAudio: (pcm: Uint8Array) => void | Promise<void>;
};

export class Speaker {
  firstAudioAt?: number;
  seconds = 0;
  private held: Uint8Array = new Uint8Array(0);
  private sentenceStart = true;
  private stopped = false;
  private readonly abort = new AbortController();

  constructor(
    readonly provider: TtsProvider,
    private readonly options: SpeakerOptions,
  ) {}

  private async send(pcm: Uint8Array): Promise<void> {
    if (!pcm.byteLength || this.stopped) return;
    this.firstAudioAt ??= performance.now();
    this.seconds += pcm.byteLength / 2 / this.provider.sampleRate;
    await this.options.onAudio(pcm);
  }

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

  private async gap(): Promise<void> {
    const target =
      Math.round(
        (Math.max(0, (this.options.gapMs ?? 250) - LEADING_SILENCE_MS) * this.provider.sampleRate) /
          1000,
      ) * 2;
    const out = new Uint8Array(target);
    out.set(this.held.subarray(0, target));
    this.held = new Uint8Array(0);
    this.sentenceStart = true;
    await this.send(out);
  }

  async say(sentence: string): Promise<void> {
    const text = spoken(sentence, this.options.pronunciations);
    if (!/\w/.test(text) || this.stopped) return;
    let odd: Uint8Array = new Uint8Array(0);
    for await (const chunk of this.provider.synthesize(text, {
      voice: this.options.voice,
      speed: this.options.speed,
      signal: this.abort.signal,
    })) {
      if (this.stopped) return;
      const joined = odd.byteLength ? concat(odd, chunk) : chunk;
      const even = joined.byteLength & ~1;
      odd = joined.slice(even);
      await this.out(joined.subarray(0, even));
    }
    await this.gap();
  }

  stop(): void {
    this.stopped = true;
    this.abort.abort();
  }
}
