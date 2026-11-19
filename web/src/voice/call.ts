// A voice call with a bot. The call is Talk's own hands-free websocket (/ws): the microphone goes up as 16 kHz
// PCM16, the engine's voice loop (pi-voice) hears the turns, and the reply comes back as words and 24 kHz PCM16.
// The call talks to the same chat the page shows, so what was said lands in the transcript like a typed turn.
import { create } from 'zustand';
import { useStore } from '../store';
import { voiceApi } from './api';
import { MicCapture, PcmPlayer, createAudioContext, micErrorMessage, openMic } from './audio';

export interface Caption { id: string; role: 'user' | 'assistant'; text: string; final: boolean }

export type CallStatus = 'idle' | 'connecting' | 'live' | 'ending' | 'error';

interface VoiceState {
  status: CallStatus;
  botId: string | null;
  callId: string | null;
  muted: boolean;
  /** Bot audio is playing. */
  speaking: boolean;
  /** The voice loop hears Jae. */
  listening: boolean;
  /** A reply is being worked out but no audio yet. */
  thinking: boolean;
  /** Lookups and changes the bot is making right now. */
  working: { seq: number; request: string }[];
  captions: Caption[];
  error: string | null;
  startedAt: number | null;
}

export const useVoice = create<VoiceState>(() => ({
  status: 'idle', botId: null, callId: null, muted: false, speaking: false, listening: false, thinking: false,
  working: [], captions: [], error: null, startedAt: null,
}));

const setV = (p: Partial<VoiceState>) => useVoice.setState(p);
const MIC_RATE = 16000;
const OUT_RATE = 24000;

let current: VoiceCall | null = null;

/** Start a call with a bot. Must be called from a user gesture (click) so audio can start. */
export function startCall(botId: string) {
  if (current && !current.ended) {
    if (current.botId === botId) return;
    current.end();
  }
  current = new VoiceCall(botId);
  void current.start();
}

export function endCall() { current?.end(); }
/** Say something to a bot on a call as if it had been spoken (starting the call if there isn't one): the reply is voiced. */
export function sayOnCall(botId: string, text: string) {
  startCall(botId);
  current?.say(text);
}
export function toggleMute() { current?.setMuted(!useVoice.getState().muted); }
export function callLevels(): { out: number; mic: number } {
  return current && !current.ended ? { out: current.player.level(), mic: current.micLevel() } : { out: 0, mic: 0 };
}
export const isCallActive = (s: VoiceState = useVoice.getState()) => s.status === 'connecting' || s.status === 'live';

class VoiceCall {
  ended = false;
  readonly ctx: AudioContext;
  readonly player: PcmPlayer;
  private mic: MicCapture | null = null;
  private ws: WebSocket | null = null;
  private ready = false;
  private n = 0;
  private queued: string[] = [];
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly botId: string) {
    // Created synchronously inside the click so autoplay policy lets it run.
    this.ctx = createAudioContext();
    this.player = new PcmPlayer(this.ctx);
    this.player.onStart = () => setV({ speaking: true, thinking: false });
    this.player.onIdle = () => setV({ speaking: false });
  }

  micLevel() { return useVoice.getState().muted ? 0 : this.mic?.level ?? 0; }

  async start() {
    setV({ status: 'connecting', botId: this.botId, callId: null, muted: false, speaking: false, listening: false, thinking: false, working: [], captions: [], error: null, startedAt: null });
    let stream: MediaStream;
    try {
      stream = await openMic();
    } catch (e) {
      this.end(micErrorMessage(e));
      return;
    }
    if (this.ended) { stream.getTracks().forEach((t) => t.stop()); return; }
    try {
      this.mic = new MicCapture(this.ctx, stream, (pcm) => this.sendAudio(pcm), MIC_RATE);
      await this.mic.start();
      const sess = await voiceApi.session(this.botId);
      if (this.ended) return;
      setV({ callId: sess.callId });
      this.connect(sess);
    } catch (e) {
      this.end((e as Error).message || 'Could not start the call');
    }
  }

  private connect(sess: { callId: string; sessionId: string; voice: string; speed: number }) {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.connectTimer = setTimeout(() => { if (!this.ready) this.end('Couldn’t connect the call'); }, 15000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'config', agent: this.botId, session_id: sess.sessionId, duplex: true, voice: sess.voice, speed: sess.speed }));
      this.ready = true;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      setV({ status: 'live', startedAt: Date.now(), listening: false });
      for (const t of this.queued.splice(0)) this.say(t);
    };
    ws.onmessage = (m) => {
      if (typeof m.data !== 'string') {
        const buf = m.data as ArrayBuffer;
        this.player.push(new Int16Array(buf, 0, buf.byteLength >> 1), OUT_RATE);
        return;
      }
      try { this.handle(JSON.parse(m.data)); } catch (e) { console.warn('[voice] bad event', e); }
    };
    ws.onclose = () => { if (!this.ended) this.end(this.ready ? 'Call dropped' : 'Couldn’t connect the call'); };
  }

  private sendAudio(pcm: Int16Array) {
    if (!this.ready || this.ended || useVoice.getState().muted || this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
  }

  private caption(role: 'user' | 'assistant', text: string, final: boolean) {
    const captions = [...useVoice.getState().captions];
    const last = captions[captions.length - 1];
    if (last && last.role === role && !last.final) captions[captions.length - 1] = { ...last, text: role === 'assistant' ? last.text + text : text, final };
    else captions.push({ id: `c${++this.n}`, role, text, final });
    setV({ captions: captions.slice(-200) });
  }

  private handle(m: { type: string; [k: string]: any }) {
    switch (m.type) {
      case 'state':
        setV({ listening: m.state === 'hearing', thinking: m.state === 'thinking', ...(m.state === 'listening' ? { working: [] } : {}) });
        return;
      case 'user':
        this.caption('user', String(m.text ?? ''), true);
        return;
      case 'token':
        this.caption('assistant', String(m.text ?? ''), false);
        return;
      case 'tool':
        setV({ working: [...useVoice.getState().working, { seq: ++this.n, request: String(m.text ?? '').replace(/^🔧\s*/, '') }].slice(-3) });
        return;
      case 'barge':
        this.player.clear();
        return;
      case 'done': {
        const captions = useVoice.getState().captions.map((c) => (c.final ? c : { ...c, final: true }));
        setV({ captions, working: [], thinking: false });
        if (m.call_end) void this.player.whenIdle().then(() => this.end());
        return;
      }
      case 'error':
        this.caption('assistant', String(m.text ?? 'Something went wrong.'), true);
        return;
    }
  }

  say(text: string) {
    if (this.ended) return;
    if (!this.ready || this.ws?.readyState !== WebSocket.OPEN) { this.queued.push(text); return; }
    this.caption('user', text, true);
    this.ws.send(JSON.stringify({ type: 'text', text }));
  }

  setMuted(muted: boolean) {
    if (this.mic) this.mic.muted = muted;
    setV({ muted });
  }

  end(error?: string) {
    if (this.ended) return;
    this.ended = true;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    try { this.ws?.close(); } catch { /* already closed */ }
    this.mic?.stop();
    this.player.dispose();
    void this.ctx.close().catch(() => {});
    if (current === this) current = null;
    setV(error ? { status: 'error', error, speaking: false, listening: false, thinking: false, working: [] } : { status: 'idle', botId: null, callId: null, speaking: false, listening: false, thinking: false, working: [], captions: [] });
    // The chat on screen has the call's turns; make sure it is current.
    useStore.getState().loadRows(this.botId).catch(() => {});
  }
}

/** Play a short sample of a voice (the details panel's Preview). */
export async function previewVoice(p: { botId: string; voice?: string; speed?: number; language?: string }) {
  const pcm = await voiceApi.preview(p);
  const ctx = createAudioContext();
  const player = new PcmPlayer(ctx);
  player.push(pcm, OUT_RATE);
  await player.whenIdle();
  player.dispose();
  void ctx.close().catch(() => {});
}
