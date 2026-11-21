import type { VoiceOption } from '@shared/types';

export interface VoiceSession { callId: string; sessionId: string; voice: string; speed: number }

export interface VoiceOptions { voices: VoiceOption[]; languages: { code: string; name: string }[]; speeds: number[] }

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/v2/voice${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch {  }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

let optionsPromise: Promise<VoiceOptions> | null = null;

export const voiceApi = {
  options: () => (optionsPromise ??= fetch('/api/v2/voice/options', { credentials: 'include' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<VoiceOptions>;
  }).catch((e) => { optionsPromise = null; throw e; })),
  session: (botId: string) => post<VoiceSession>('/session', { botId }),
  async preview(p: { botId: string; voice?: string; speed?: number; language?: string; text?: string }): Promise<Int16Array> {
    const res = await fetch('/api/v2/voice/preview', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, codec: 'pcm' }) });
    if (!res.ok) throw new Error('Preview unavailable');
    const buf = await res.arrayBuffer();
    return new Int16Array(buf, 0, buf.byteLength >> 1);
  },
  async transcribe(pcm: Int16Array, rate: number): Promise<string> {
    const res = await fetch(`/api/v2/voice/stt?rate=${rate}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer });
    if (!res.ok) {
      let msg = 'Transcription failed';
      try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch {  }
      throw new Error(msg);
    }
    return ((await res.json()) as { text: string }).text;
  },
};
