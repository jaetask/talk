import { readFileSync } from "node:fs";
import { firstLoudSample, lastLoudSample, readWav } from "../packages/pi-voice/src/index.ts";

const url = process.argv[2] ?? "ws://127.0.0.1:3930/ws";
const runs = Number(process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : 3);
const barge = process.argv.includes("--barge");
const extra = process.argv.includes("--config")
  ? JSON.parse(process.argv[process.argv.indexOf("--config") + 1])
  : {};
const fixtures = new URL("../packages/pi-voice/test/fixtures/", import.meta.url).pathname;
const wav = (name: string) => readWav(new Uint8Array(readFileSync(`${fixtures}${name}.wav`))).pcm;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CHUNK = 1024;

async function play(ws: WebSocket, pcm: Uint8Array, mark: number): Promise<number> {
  const start = performance.now();
  let markedAt = 0;
  for (let at = 0; at < pcm.byteLength; at += CHUNK) {
    const due = start + (at / 2 / 16000) * 1000;
    if (performance.now() < due) await sleep(due - performance.now());
    ws.send(pcm.subarray(at, Math.min(at + CHUNK, pcm.byteLength)));
    if (!markedAt && at / 2 + CHUNK / 2 >= mark) markedAt = performance.now();
  }
  return markedAt || performance.now();
}

async function once(): Promise<{
  firstAudio?: number;
  bargeMs?: number;
  heard: string;
  reply: string;
}> {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`cannot reach ${url}`));
  });
  let firstAudioAt = 0,
    bargeAt = 0,
    doneAt = 0,
    heard = "",
    reply = "",
    audioBytes = 0;
  ws.onmessage = (e) => {
    if (typeof e.data !== "string") {
      audioBytes += (e.data as ArrayBuffer).byteLength;
      if (!firstAudioAt) firstAudioAt = performance.now();
      return;
    }
    const m = JSON.parse(e.data);
    if (m.type === "user") heard = m.text;
    else if (m.type === "token") reply += m.text;
    else if (m.type === "barge" && !bargeAt) bargeAt = performance.now();
    else if (m.type === "done") doneAt = performance.now();
  };
  ws.send(
    JSON.stringify({
      type: "config",
      agent: "cooper",
      duplex: true,
      writes: false,
      pretend_writes: true,
      new_session: true,
      speak: true,
      ...extra,
    }),
  );
  await sleep(300);
  const question = wav(barge ? "long-question" : "question");
  const lastWordAt = await play(ws, question, lastLoudSample(question));
  const until = performance.now() + 60_000;
  while (!firstAudioAt && performance.now() < until) await sleep(5);
  const out: { firstAudio?: number; bargeMs?: number; heard: string; reply: string } = {
    firstAudio: firstAudioAt ? firstAudioAt - lastWordAt : undefined,
    heard,
    reply,
  };
  if (barge && firstAudioAt) {
    await sleep(700);
    const stop = wav("stop");
    const stopAt = await play(ws, stop, firstLoudSample(stop));
    const wait = performance.now() + 5000;
    while (!bargeAt && performance.now() < wait) await sleep(5);
    out.bargeMs = bargeAt ? bargeAt - stopAt : undefined;
  } else {
    while (!doneAt && performance.now() < until) await sleep(20);
  }
  out.reply = reply;
  out.heard = heard;
  ws.close();
  void audioBytes;
  return out;
}

const firsts: number[] = [],
  barges: number[] = [];
for (let i = 0; i < runs; i++) {
  const r = await once();
  if (r.firstAudio !== undefined) firsts.push(r.firstAudio);
  if (r.bargeMs !== undefined) barges.push(r.bargeMs);
  console.log(
    `run ${i + 1}: heard ${JSON.stringify(r.heard)}; last word to first audio ${r.firstAudio === undefined ? "none" : `${Math.round(r.firstAudio)} ms`}${barge ? `; barge-in ${r.bargeMs === undefined ? "none" : `${Math.round(r.bargeMs)} ms`}` : ""}; reply ${JSON.stringify(r.reply.slice(0, 80))}`,
  );
  await sleep(1500);
}
const median = (xs: number[]) =>
  xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]) : null;
console.log(
  JSON.stringify({
    url,
    runs,
    first_audio_ms_median: median(firsts),
    barge_ms_median: median(barges),
    first_audio_ms: firsts.map(Math.round),
    barge_ms: barges.map(Math.round),
  }),
);
