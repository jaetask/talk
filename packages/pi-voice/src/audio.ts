const LOUD = 330;

export const samplesOf = (pcm: Uint8Array): Int16Array =>
  new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1);

export function toFloat(pcm: Uint8Array): Float32Array {
  const s = samplesOf(pcm.byteOffset % 2 ? pcm.slice() : pcm);
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s[i] / 32768;
  return out;
}

export function rms(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}

export function firstLoudSample(pcm: Uint8Array, threshold = LOUD): number {
  const s = samplesOf(pcm.byteOffset % 2 ? pcm.slice() : pcm);
  for (let i = 0; i < s.length; i++) if (Math.abs(s[i]) > threshold) return i;
  return 0;
}

export function lastLoudSample(pcm: Uint8Array, threshold = LOUD): number {
  const s = samplesOf(pcm.byteOffset % 2 ? pcm.slice() : pcm);
  for (let i = s.length - 1; i >= 0; i--) if (Math.abs(s[i]) > threshold) return i;
  return -1;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

export function wavBytes(pcm: Uint8Array, rate = 16000): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(out.buffer);
  const ascii = (at: number, s: string) => {
    for (const [i, c] of [...s].entries()) v.setUint8(at + i, c.charCodeAt(0));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}

export function readWav(file: Uint8Array): { pcm: Uint8Array; rate: number } {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let at = 12;
  let rate = 16000;
  while (at + 8 <= file.byteLength) {
    const id = String.fromCharCode(...file.subarray(at, at + 4));
    const size = v.getUint32(at + 4, true);
    if (id === "fmt ") rate = v.getUint32(at + 12, true);
    if (id === "data") return { pcm: file.slice(at + 8, at + 8 + size), rate };
    at += 8 + size + (size % 2);
  }
  throw new Error("not a WAV file with a data chunk");
}

export const BARGE_THRESHOLD = 0.7;
export const BARGE_MS = 256;
export const BARGE_RMS = 0.045;
export const ECHO_FRAMES = 62;
const ECHO_MIN = 0.01;

export function bargeGate(echoLevels: number[], setting: number): number {
  if (setting >= 1) return Number.POSITIVE_INFINITY;
  if (echoLevels.length < 30) return setting;
  const margin = setting <= 0.035 ? 1.5 : setting <= 0.05 ? 1.8 : 2.5;
  const loud = [...echoLevels].sort((a, b) => a - b)[Math.floor(echoLevels.length * 0.9)];
  return Math.min(setting, Math.max(loud * margin, ECHO_MIN));
}
