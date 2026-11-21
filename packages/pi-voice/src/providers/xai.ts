import { failure, streamBody } from "./openai-speech.ts";
import type { SpeakOptions, TtsProvider } from "../tts.ts";

export type XaiOptions = {
  apiKey?: string;
  voice?: string;
  language?: string;
  baseUrl?: string;
  sampleRate?: number;
  fetch?: typeof fetch;
};

export function xai(options: XaiOptions = {}): TtsProvider {
  const sampleRate = options.sampleRate ?? 24000;
  return {
    name: "xai",
    sampleRate,
    async *synthesize(text: string, speak: SpeakOptions = {}) {
      const key = options.apiKey ?? process.env.XAI_API_KEY;
      if (!key) throw new Error("xai: no API key. Set XAI_API_KEY.");
      const res = await (options.fetch ?? fetch)(
        `${(options.baseUrl ?? "https://api.x.ai").replace(/\/$/, "")}/v1/tts`,
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            text,
            voice_id: speak.voice ?? options.voice ?? "eve",
            language: options.language ?? "en",
            output_format: { codec: "pcm", sample_rate: sampleRate },
            ...(speak.speed && speak.speed !== 1 ? { speed: speak.speed } : {}),
          }),
          signal: speak.signal,
        },
      );
      if (!res.ok) throw await failure("xai", res);
      yield* streamBody(res);
    },
  };
}
