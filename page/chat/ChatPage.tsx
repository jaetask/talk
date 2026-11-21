import { useMemo } from "react";
import { botVars } from "../lib/colors";
import { sortedRows, useStore } from "../store";
import type { Bot } from "../types";
import { Composer } from "./Composer";
import { DetailsPanel } from "./Details";
import { Transcript } from "./Transcript";
import { VoiceCallBar } from "./VoiceCallBar";

export function ChatPage({ bot }: { bot: Bot }) {
  const transcript = useStore((s) => s.transcripts[bot.id]);
  const live = useStore((s) => s.live[bot.id]);
  const detailsOpen = useStore((s) => s.detailsOpen);
  const rows = useMemo(() => sortedRows(transcript), [transcript]);
  return (
    <div
      className={`chat-page${detailsOpen ? " has-details" : ""}`}
      style={botVars(bot.avatarColor)}
    >
      <div className="chat-column">
        <Transcript bot={bot} rows={rows} live={live} loaded={!!transcript?.loaded} />
        <VoiceCallBar />
        <Composer bot={bot} running={!!live?.isRunning} />
      </div>
      {detailsOpen && <DetailsPanel bot={bot} />}
    </div>
  );
}
