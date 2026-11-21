import { useEffect, useState } from "react";
import { BotAvatarFor } from "../avatar/BotAvatar";
import { activityPhrase } from "../lib/phrases";
import { elapsed } from "../lib/time";
import type { Bot, LiveState, Row } from "../types";

export function ActivityLine({ bot, live, rows }: { bot: Bot; live: LiveState; rows: Row[] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const since = live.startedAt ?? live.activity?.since ?? live.awaiting?.since ?? now;
  const tick = Math.floor((now - (live.activity?.since ?? since)) / 6000);
  const phrase = activityPhrase(live, rows, tick);
  const waiting = !live.isRunning && (live.awaiting || live.activity?.kind === "waiting_for_you");
  return (
    <div
      className={`activity-line${waiting ? " is-waiting" : ""}`}
      role="status"
      aria-live="polite"
    >
      <BotAvatarFor bot={bot} size={20} />
      <span className="activity-text shimmer" key={phrase}>
        {phrase}
      </span>
      {!waiting && now - since >= 1000 && (
        <span className="activity-time">· {elapsed(now - since)}</span>
      )}
      {waiting && live.awaiting?.reason && (
        <span className="activity-time">· {live.awaiting.reason}</span>
      )}
    </div>
  );
}
