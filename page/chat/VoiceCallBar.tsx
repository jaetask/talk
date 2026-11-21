import { Button } from "@jaetask/toolkit/ui/button";
import { IconMicrophone, IconMicrophoneOff, IconPhoneOff, IconX } from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BotAvatarFor } from "../avatar/BotAvatar";
import { IconButton } from "../icons";
import { botVars } from "../lib/colors";
import { useStore } from "../store";
import { callLevels, endCall, toggleMute, useVoice } from "../voice/call";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function VoiceCallBar() {
  const v = useVoice();
  const bot = useStore((s) => s.bots.find((b) => b.id === v.botId));
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const avatarRef = useRef<HTMLSpanElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const active = v.status === "connecting" || v.status === "live";

  useEffect(() => {
    if (v.status !== "live") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [v.status]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let out = 0;
    let mic = 0;
    const tick = () => {
      const l = callLevels();
      out = out * 0.7 + l.out * 0.3;
      mic = mic * 0.7 + Math.min(1, l.mic * 3) * 0.3;
      const el = avatarRef.current;
      if (el) {
        el.style.setProperty("--out", out.toFixed(3));
        el.style.setProperty("--mic", mic.toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: new captions scroll the log
  useLayoutEffect(() => {
    if (expanded && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [expanded, v.captions]);

  if (v.status === "idle" || v.status === "ending" || !bot) return null;
  const working = v.working.length > 0;
  const status =
    v.status === "connecting"
      ? "Connecting…"
      : v.status === "error"
        ? (v.error ?? "Call ended")
        : v.speaking
          ? "Speaking"
          : v.listening
            ? "Listening"
            : working
              ? "Working on it…"
              : v.thinking
                ? "Thinking…"
                : v.muted
                  ? "Muted"
                  : "Listening";
  const lines = v.captions.filter((c) => c.text.trim());
  const last = lines.slice(-2);
  const task = working ? (v.working[v.working.length - 1]?.request ?? "") : "";

  return (
    <section
      className={`vcall is-${v.status}${v.speaking ? " is-speaking" : ""}`}
      style={botVars(bot.avatarColor)}
      aria-label={`Voice call with ${bot.name}`}
    >
      <div className="vcall-main">
        <span className="vcall-avatar" ref={avatarRef}>
          <span className="vcall-halo" aria-hidden />
          <BotAvatarFor bot={bot} size={36} />
        </span>
        <div className="vcall-info">
          <div className="vcall-title">
            <span>{bot.name}</span>
            {v.status === "live" && v.startedAt && (
              <span className="vcall-time">{fmt(now - v.startedAt)}</span>
            )}
          </div>
          <div className={`vcall-status${working ? " shimmer" : ""}`} aria-live="polite">
            {status}
            {working && <span title={task}> · {task}</span>}
          </div>
        </div>
        <div className="vcall-actions">
          {active && (
            <IconButton label={v.muted ? "Unmute" : "Mute"} pressed={v.muted} onClick={toggleMute}>
              {v.muted ? <IconMicrophoneOff size={18} /> : <IconMicrophone size={18} />}
            </IconButton>
          )}
          {active ? (
            <IconButton label="End call" tone="danger" onClick={endCall}>
              <IconPhoneOff size={18} />
            </IconButton>
          ) : (
            <IconButton
              label="Dismiss"
              onClick={() => useVoice.setState({ status: "idle", botId: null, error: null })}
            >
              <IconX size={18} />
            </IconButton>
          )}
        </div>
      </div>
      {v.status === "live" &&
        (expanded ? (
          <div className="vcall-log" ref={logRef}>
            {lines.length ? (
              lines.map((c) => (
                <p key={c.id} className={`vcall-line is-${c.role}`}>
                  <b>{c.role === "user" ? "You" : bot.name}</b> {c.text}
                </p>
              ))
            ) : (
              <p className="quiet">Nothing said yet.</p>
            )}
            <Button variant="link" size="xs" onClick={() => setExpanded(false)}>
              Hide transcript
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="vcall-captions"
            onClick={() => setExpanded(true)}
            title="Show the whole transcript"
          >
            {last.length ? (
              last.map((c) => (
                <span
                  key={c.id}
                  className={`vcall-caption is-${c.role}${c.final ? "" : " is-partial"}`}
                >
                  {c.text}
                </span>
              ))
            ) : (
              <span className="vcall-caption quiet">
                {v.muted ? "You're muted." : `Say hi to ${bot.name}.`}
              </span>
            )}
          </Button>
        ))}
    </section>
  );
}
