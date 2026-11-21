import { Textarea } from "@jaetask/toolkit/ui/textarea";
import {
  IconArrowUp,
  IconMicrophone,
  IconPhoneOff,
  IconPlayerStopFilled,
  IconWaveSine,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../icons";
import { api } from "../lib/api";
import { displayName } from "../store";
import type { Bot } from "../types";
import { endCall, isCallActive, startCall, useVoice } from "../voice/call";
import { useDictation } from "../voice/dictation";

const MAX_H = 200;
const drafts = new Map<string, string>();

export function Composer({ bot, running }: { bot: Bot; running: boolean }) {
  const [text, setText] = useState(() => drafts.get(bot.id) ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(drafts.get(bot.id) ?? "");
    setError(null);
    ref.current?.focus();
  }, [bot.id]);
  useEffect(() => {
    drafts.set(bot.id, text);
  }, [bot.id, text]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_H)}px`;
    el.style.overflowY = el.scrollHeight > MAX_H ? "auto" : "hidden";
  }, [text]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.send(bot.id, t);
      setText("");
      drafts.delete(bot.id);
    } catch (e) {
      setError((e as Error).message || "The message was not sent.");
    } finally {
      setSending(false);
      ref.current?.focus();
    }
  };

  const insertText = (t: string) => {
    const el = ref.current;
    setText((cur) => {
      const focused = el && document.activeElement === el;
      const start = focused ? el.selectionStart : cur.length;
      const end = focused ? el.selectionEnd : cur.length;
      const before = cur.slice(0, start);
      const after = cur.slice(end);
      const pre = before && !/\s$/.test(before) ? " " : "";
      const post = after && !/^\s/.test(after) ? " " : "";
      requestAnimationFrame(() => {
        if (!el) return;
        const pos = before.length + pre.length + t.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
      return before + pre + t + post + after;
    });
  };
  const dictation = useDictation(insertText, setError, bot.voiceLanguage);
  const inCall = useVoice((s) => isCallActive(s) && s.botId === bot.id);
  const hasText = text.trim().length > 0;
  const recording = dictation.state === "recording";

  return (
    <div className="composer-area">
      {error && (
        <p className="problem" role="alert">
          {error}
        </p>
      )}
      <div className="composer-box">
        <Textarea
          ref={ref}
          className="composer-input"
          rows={1}
          value={text}
          placeholder={`Message ${displayName(bot)}`}
          aria-label={`Message ${bot.name}`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-tools">
          <span className={`dictate${recording ? " is-recording" : ""}`}>
            <IconButton
              label={
                recording
                  ? "Release or click to stop · Esc cancels"
                  : dictation.state === "transcribing"
                    ? "Transcribing"
                    : "Hold to dictate, or click to start"
              }
              pressed={recording}
              disabled={dictation.state === "transcribing"}
              onClick={() => {}}
              onPointerDown={dictation.onPointerDown}
              onPointerUp={dictation.onPointerUp}
              onKeyDown={dictation.onKeyDown}
              onContextMenu={(e) => e.preventDefault()}
            >
              <IconMicrophone size={18} />
            </IconButton>
          </span>
          {inCall && !hasText ? (
            <IconButton label="End voice call" tone="danger" onClick={endCall}>
              <IconPhoneOff size={18} />
            </IconButton>
          ) : running && !hasText ? (
            <IconButton
              label="Stop"
              tone="action"
              onClick={() => api.interrupt(bot.id).catch((e) => setError((e as Error).message))}
            >
              <IconPlayerStopFilled size={16} />
            </IconButton>
          ) : (
            <IconButton
              label={hasText ? "Send" : `Start a voice call with ${bot.name}`}
              tone="action"
              disabled={hasText && sending}
              onClick={hasText ? () => void send() : () => startCall(bot.id)}
            >
              {hasText ? <IconArrowUp size={18} /> : <IconWaveSine size={18} />}
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
