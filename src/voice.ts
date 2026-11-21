import { readFileSync } from "node:fs";
import {
  elevenlabs,
  kokoro,
  kokoroStream,
  parsePronunciations,
  whisper,
  xai,
  type Pronunciations,
  type SttProvider,
  type TtsProvider,
} from "../packages/pi-voice/src/index.ts";
import { PRONUNCIATIONS, VOICESTUDIO } from "./config.ts";

export const ASR_VOCAB =
  process.env.TALK_ASR_VOCAB ??
  "Jae is talking to Cooper. Jae, Cooper, Maddy, Heart, the Tasks app, Tasks, MCP, Kokoro, Ollama";

const ASR_FIXES: [RegExp, string][] = [
  [/\bT[\s.-]*A[\s.-]*S[\s.-]*K[\s.-]*S\b/g, "Tasks"],
  [/\bTAS\b/g, "Tasks"],
  [/\b(tass?|tax|tusks?|task'?s|tasks')(?=\s+(mcp|app|server|board)\b)/gi, "Tasks"],
];
export const fixHeard = (text: string): string =>
  ASR_FIXES.reduce((t, [rx, to]) => t.replace(rx, to), text);

export function pronunciations(): Pronunciations {
  try {
    return parsePronunciations(readFileSync(PRONUNCIATIONS, "utf8"));
  } catch {
    return [];
  }
}

export const DEFAULT_SPEED = 0.94;
export const DEFAULT_GAP_MS = 250;

export type VoiceChoice = { provider: string; voice: string };

export function ttsProvider(name: string | undefined): TtsProvider {
  switch (name ?? process.env.TALK_TTS ?? "kokoro") {
    case "xai":
      return xai();
    case "elevenlabs":
      return elevenlabs({ voice: process.env.ELEVENLABS_VOICE });
    case "kokoro-http":
      return kokoro({ baseUrl: VOICESTUDIO });
    default:
      return kokoroStream({ url: `${VOICESTUDIO.replace(/^http/, "ws")}/ws/tts` });
  }
}

export const sttProvider = (): SttProvider => whisper({ baseUrl: VOICESTUDIO });

export function voiceFor(provider: string, voice: string | undefined): string | undefined {
  const kokoroName = /^[ab][fm]_/.test(voice ?? "");
  if (provider === "xai") return kokoroName ? undefined : voice;
  if (provider === "elevenlabs") return kokoroName ? undefined : voice;
  return voice;
}

export const FILLERS = [
  "Let me check.",
  "One sec, I'll have a look.",
  "Let me look that up.",
  "Checking now.",
];
