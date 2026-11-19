// Expect tests for pi-voice, run with @jaetask/snap: an input file per case, the approved output beside it as
// name.expect.md. Nothing here needs a GPU, a speech server or a key: audio comes from recorded fixtures, and the
// speech services are stand-ins in this process.
//
//   bun test/run.ts            compare with the approved expect files
//   bun test/run.ts --update   approve new output (read the diff first)
import { readFileSync } from "node:fs";
import { snap, table } from "@jaetask/snap";
import {
	elevenlabs, energyVad, FRAME, FRAME_MS, kokoro, lastLoudSample, openaiSpeech, parsePronunciations, readWav, SentenceStream, Speaker, splitForTts, splitSentences, spoken,
	toFloat, TurnDetector, VoiceLoop, whisper, withPhrases, xai, type Brain, type LoopEvent, type SttProvider, type TtsProvider,
} from "../src/index.ts";

const here = new URL("./", import.meta.url).pathname;
const code = (v: unknown) => "```json\n" + JSON.stringify(v, null, 2) + "\n```";
const fixture = (name: string) => readWav(new Uint8Array(readFileSync(`${here}fixtures/${name}.wav`)));

/** PCM16 at `rate`: a 220 Hz tone for speech, zeros for silence. */
function pcm(parts: { tone?: number; silence?: number }[], rate: number): Uint8Array {
	const samples = parts.flatMap((p) => Array.from({ length: Math.round((((p.tone ?? p.silence) as number) * rate) / 1000) }, (_, i) => (p.tone ? Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / rate)) : 0)));
	return new Uint8Array(new Int16Array(samples).buffer);
}

/** Audio as a person would describe it: stretches of sound and silence, in milliseconds. */
function layout(audio: Uint8Array, rate: number): string {
	const s = new Int16Array(audio.buffer, audio.byteOffset, audio.byteLength >> 1);
	const win = Math.round(rate / 100); // 10 ms
	const out: string[] = [];
	let kind = "";
	let ms = 0;
	for (let i = 0; i < s.length; i += win) {
		let loud = false;
		for (let j = i; j < Math.min(i + win, s.length); j++) if (Math.abs(s[j]) > 330) loud = true;
		const k = loud ? "sound" : "silence";
		if (k !== kind && ms) {
			out.push(`${kind} ${ms} ms`);
			ms = 0;
		}
		kind = k;
		ms += 10;
	}
	if (ms) out.push(`${kind} ${ms} ms`);
	return out.join(", ");
}

function speech(input: string, name: string): string {
	const c = JSON.parse(input);
	const says = parsePronunciations(c.pronunciations ?? "");
	const out = [`# ${name}`, ""];
	if (c.stream) {
		const stream = new SentenceStream();
		const rows = (c.stream as string[]).map((piece) => [JSON.stringify(piece), stream.push(piece).map((s) => JSON.stringify(s)).join(" ") || "(nothing yet)"]);
		rows.push(["(the reply ends)", stream.flush().map((s) => JSON.stringify(s)).join(" ") || "(nothing left)"]);
		return [...out, table(["piece arrives", "sentences ready to speak"], rows), ""].join("\n");
	}
	out.push("## Sentences", "", ...splitSentences(c.text).map((s) => `- ${JSON.stringify(s)}`), "", "## Said aloud", "", ...splitSentences(c.text).map((s) => `- ${JSON.stringify(spoken(s, says))}`), "");
	if (c.long) out.push("## Chunks for a long read", "", table(["chunk", "ends a sentence"], splitForTts(c.text).map((x) => [x.text, x.endsSentence ? "yes" : "no"])), "");
	return out.join("\n");
}

function vad(input: string, name: string): string {
	const c = JSON.parse(input);
	const { pcm: audio, rate } = fixture(c.fixture);
	const frames = toFloat(audio);
	const detector = new TurnDetector({ ...c.detector, vad: energyVad() });
	const rows: string[][] = [];
	for (let i = 0; i + FRAME <= frames.length; i += FRAME) {
		const event = detector.feed(frames.subarray(i, i + FRAME), c.feed ?? {});
		if (event) rows.push([`${Math.round(((i + FRAME) / rate) * 1000)} ms`, event, event === "end" ? `${Math.round((detector.utterance().length / rate) * 1000)} ms of audio kept` : ""]);
	}
	return [`# ${name}`, "", `${c.about} Fixture ${c.fixture}.wav: ${Math.round((frames.length / rate) * 1000)} ms, ${layout(audio, rate)}.`, "", rows.length ? table(["at", "event", ""], rows) : "No events.", ""].join("\n");
}

async function speaker(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const rate = c.rate ?? 24000;
	const asked: string[] = [];
	const plain: TtsProvider = {
		name: "fake",
		sampleRate: rate,
		async *synthesize(text) {
			asked.push(text);
			for (const chunk of c.sentences[text] ?? []) yield pcm(chunk, rate).slice(0, c.oddBytes ? pcm(chunk, rate).byteLength - 1 : undefined);
		},
	};
	const provider = c.phrases ? withPhrases(plain, c.phrases) : plain;
	if (c.phrases) await new Promise((resolve) => setTimeout(resolve, 20)); // let the phrases render
	const sent: Uint8Array[] = [];
	const sp = new Speaker(provider, { gapMs: c.gapMs, pronunciations: parsePronunciations(c.pronunciations ?? ""), onAudio: (a) => void sent.push(a) });
	for (const s of c.say) {
		await sp.say(s);
		if (c.stopAfter === s) sp.stop();
	}
	const all = new Uint8Array(sent.reduce((n, a) => n + a.byteLength, 0));
	sent.reduce((at, a) => (all.set(a, at), at + a.byteLength), 0);
	return [`# ${name}`, "", c.about, "", `Sent to the listener: ${layout(all, rate) || "nothing"}.`, "", `Seconds of audio counted: ${sp.seconds.toFixed(2)}.`, "", ...(c.phrases ? [`The provider was asked for: ${asked.map((a) => JSON.stringify(a)).join(", ")}.`, ""] : [])].join("\n");
}

async function providers(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	const seen: object[] = [];
	const fake = (async (url: string, init: RequestInit) => {
		const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), /key|authorization/i.test(k) ? v.replace(/(Bearer )?.+/, "$1<key>") : v]));
		const body = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `<${(v as File).type}, ${(v as File).size} bytes>`])) : JSON.parse(String(init.body));
		seen.push({ method: init.method, url: String(url), headers, body });
		if (c.status && c.status !== 200) return new Response(c.errorBody ?? "no", { status: c.status });
		return c.provider === "whisper" ? Response.json({ text: "  what's on the board today?  " }) : new Response(pcm([{ tone: 100 }], 24000) as never);
	}) as never;
	delete process.env.XAI_API_KEY;
	delete process.env.ELEVENLABS_API_KEY;
	const out = [`# ${name}`, "", c.about, ""];
	try {
		if (c.provider === "whisper") {
			const text = await whisper({ ...c.options, fetch: fake }).transcribe(pcm([{ tone: 200 }], 16000), 16000, c.transcribe ?? {});
			out.push(`Heard: ${JSON.stringify(text)}`, "");
		} else {
			const make = { kokoro, openai: openaiSpeech, xai, elevenlabs }[c.provider as "kokoro"] as (o: object) => TtsProvider;
			const p = make({ ...c.options, fetch: fake });
			let bytes = 0;
			for await (const chunk of p.synthesize(c.text ?? "Hello there.", c.speak ?? {})) bytes += chunk.byteLength;
			out.push(`Provider ${p.name} at ${p.sampleRate} Hz returned ${bytes} bytes of PCM.`, "");
		}
	} catch (e) {
		out.push(`Error: ${(e as Error).message}`, "");
	}
	out.push("## Request", "", seen.length ? code(seen[0]) : "Nothing was sent.", "");
	return out.join("\n");
}

async function loop(input: string, name: string): Promise<string> {
	const c = JSON.parse(input);
	let clock = 0; // milliseconds of microphone audio fed so far: the loop's only clock
	const heard = [...(c.heard as string[])];
	const stt: SttProvider = { name: "fake", transcribe: async () => heard.shift() ?? "" };
	const tts: TtsProvider = {
		name: "fake",
		sampleRate: 24000,
		async *synthesize(text) {
			yield pcm([{ silence: 80 }, { tone: text.length * (c.msPerChar ?? 40) }, { silence: 120 }], 24000);
		},
	};
	const replies = [...(c.replies as string[][])];
	const brain: Brain = {
		async *reply() {
			for (const piece of replies.shift() ?? []) yield piece;
		},
	};
	const lines: string[] = [];
	let audioMs = 0;
	const note = (e: LoopEvent) => {
		if (e.type === "token") return;
		const at = `${String(Math.round(clock)).padStart(5)} ms`;
		if (e.type === "state") lines.push(`${at}  state: ${e.state}`);
		else if (e.type === "heard") lines.push(`${at}  heard: ${e.text}`);
		else if (e.type === "sentence") lines.push(`${at}  sentence ready: ${e.text}`);
		else if (e.type === "barge") lines.push(`${at}  BARGE: the reply is stopped`);
		else if (e.type === "error") lines.push(`${at}  error: ${e.text}`);
		else if (e.type === "done") lines.push(`${at}  done${e.interrupted ? " (interrupted)" : ""}: ${JSON.stringify(e.text)}; ${audioMs} ms of audio sent so far`);
	};
	const voice = new VoiceLoop({ stt, tts, brain, onEvent: note, onAudio: (a) => void (audioMs += Math.round(a.byteLength / 48)), now: () => clock, fixHeard: (t) => t.replace(/\bTAS\b/g, "Tasks"), ...c.options });
	for (const step of c.steps as { fixture?: string; type?: string; wait?: boolean; silenceMs?: number }[]) {
		if (step.type) {
			lines.push(`         typed: ${step.type}`);
			await voice.say(step.type);
			continue;
		}
		if (step.wait) {
			await voice.idle();
			continue;
		}
		const audio = step.fixture ? fixture(step.fixture).pcm : pcm([{ silence: step.silenceMs! }], 16000);
		lines.push(`         microphone: ${step.fixture ? `${step.fixture}.wav` : `${step.silenceMs} ms of silence`}`);
		for (let at = 0; at + FRAME * 2 <= audio.byteLength; at += FRAME * 2) {
			clock += FRAME_MS;
			await voice.feed(audio.subarray(at, at + FRAME * 2));
		}
	}
	await voice.idle();
	await voice.close();
	return [`# ${name}`, "", c.about, "", "```", ...lines, "```", ""].join("\n");
}

void lastLoudSample;
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const groups: [string, (input: string, name: string) => string | Promise<string>][] = [["speech", speech], ["vad", vad], ["speaker", speaker], ["providers", providers], ["loop", loop]];
const failed = await snap(groups.filter(([g]) => !only || g === only).map(([g, render]) => ({ dir: `${here}cases/${g}`, render })));
process.exit(failed === 0 ? 0 : 1);
