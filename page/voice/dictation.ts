import { useCallback, useEffect, useRef, useState } from "react";
import { voiceApi } from "./api";
import { MicCapture, createAudioContext, micErrorMessage, openMic } from "./audio";

export type DictationState = "idle" | "recording" | "transcribing";

const HOLD_MS = 350;
const MAX_MS = 120_000;
const RATE = 16000;

interface Recording {
  ctx: AudioContext;
  mic: MicCapture;
  chunks: Int16Array[];
  downAt: number;
  timer: ReturnType<typeof setTimeout>;
}

export function useDictation(
  onText: (text: string) => void,
  onError: (msg: string) => void,
  _language?: string,
) {
  const [state, setState] = useState<DictationState>("idle");
  const rec = useRef<Recording | null>(null);
  const starting = useRef(false);
  const toggleMode = useRef(false);
  const cb = useRef({ onText, onError });
  cb.current = { onText, onError };

  const finish = useCallback((cancel = false) => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    toggleMode.current = false;
    clearTimeout(r.timer);
    r.mic.stop();
    void r.ctx.close().catch(() => {});
    if (cancel || !r.chunks.length || Date.now() - r.downAt < 250) {
      setState("idle");
      return;
    }
    const pcm = new Int16Array(r.chunks.reduce((n, c) => n + c.length, 0));
    let at = 0;
    for (const c of r.chunks) {
      pcm.set(c, at);
      at += c.length;
    }
    setState("transcribing");
    voiceApi
      .transcribe(pcm, RATE)
      .then((text) => {
        if (text) cb.current.onText(text);
      })
      .catch((e) => cb.current.onError((e as Error).message || "Transcription failed"))
      .finally(() => setState("idle"));
  }, []);

  const begin = useCallback(async () => {
    if (rec.current || starting.current) return;
    starting.current = true;
    const downAt = Date.now();
    const ctx = createAudioContext();
    try {
      const stream = await openMic();
      const chunks: Int16Array[] = [];
      const mic = new MicCapture(
        ctx,
        stream,
        (pcm) => {
          chunks.push(pcm);
        },
        RATE,
      );
      await mic.start();
      rec.current = { ctx, mic, chunks, downAt, timer: setTimeout(() => finish(), MAX_MS) };
      setState("recording");
    } catch (e) {
      void ctx.close().catch(() => {});
      cb.current.onError(micErrorMessage(e));
      setState("idle");
    } finally {
      starting.current = false;
    }
  }, [finish]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {}
      if (rec.current && toggleMode.current) {
        finish();
        return;
      }
      void begin();
    },
    [begin, finish],
  );

  const onPointerUp = useCallback(() => {
    const r = rec.current;
    if (!r) {
      if (starting.current) toggleMode.current = true;
      return;
    }
    if (toggleMode.current) return;
    if (Date.now() - r.downAt < HOLD_MS) toggleMode.current = true;
    else finish();
  }, [finish]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (rec.current) finish();
      else {
        toggleMode.current = true;
        void begin();
      }
    },
    [begin, finish],
  );

  useEffect(() => {
    if (state !== "recording") return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(true);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [state, finish]);
  useEffect(() => () => finish(true), [finish]);

  return { state, onPointerDown, onPointerUp, onKeyDown, cancel: () => finish(true) };
}
