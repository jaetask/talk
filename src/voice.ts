// Talk's own voice settings in front of pi-voice: which speech services it uses, the words speech recognition should
// expect, the mishearings to put right, and the pronunciations file. pi-voice itself knows nothing about Talk.
import { readFileSync } from "node:fs";
import { elevenlabs, kokoro, kokoroStream, parsePronunciations, whisper, xai, type Pronunciations, type SttProvider, type TtsProvider } from "../packages/pi-voice/src/index.ts";
import { PRONUNCIATIONS, VOICESTUDIO } from "./config.ts";

/** Whisper reads the prompt as the words just before the clip, so a sentence spelling the names biases it more than a list. */
export const ASR_VOCAB = process.env.TALK_ASR_VOCAB ?? "Jae is talking to Cooper. Jae, Cooper, Maddy, Heart, the Tasks app, Tasks, MCP, Kokoro, Ollama";

// Whisper hears Jae's "Tasks" as "TAS" and similar. This corrects the transcript, as a spelling fix; it triggers nothing.
const ASR_FIXES: [RegExp, string][] = [
	[/\bT[\s.-]*A[\s.-]*S[\s.-]*K[\s.-]*S\b/g, "Tasks"],
	[/\bTAS\b/g, "Tasks"],
	[/\b(tass?|tax|tusks?|task'?s|tasks')(?=\s+(mcp|app|server|board)\b)/gi, "Tasks"],
];
export const fixHeard = (text: string): string => ASR_FIXES.reduce((t, [rx, to]) => t.replace(rx, to), text);

/** pronunciations.txt, read fresh, so an edit applies from the next reply. */
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

/** The voice provider by name: kokoro (local, the default), kokoro-http, xai or elevenlabs. Keys come from the environment. */
export function ttsProvider(name: string | undefined): TtsProvider {
	switch (name ?? process.env.TALK_NEXT_TTS ?? "kokoro") {
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

/** A provider's voice for an agent's voice name: Kokoro names pass through; a paid provider uses its own default unless the name is one of its own. */
export function voiceFor(provider: string, voice: string | undefined): string | undefined {
	const kokoroName = /^[ab][fm]_/.test(voice ?? "");
	if (provider === "xai") return kokoroName ? undefined : voice;
	if (provider === "elevenlabs") return kokoroName ? undefined : voice;
	return voice;
}

/** What is said while the first lookup runs, so a spoken question isn't met with silence. Python Talk's own four. */
export const FILLERS = ["Let me check.", "One sec, I'll have a look.", "Let me look that up.", "Checking now."];
