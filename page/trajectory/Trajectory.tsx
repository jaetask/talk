import { Button } from "@jaetask/toolkit/ui/button";
import { Input } from "@jaetask/toolkit/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { IconDownload } from "@tabler/icons-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type { Bot } from "../types";
import { StepDetails, Tag } from "./StepDetails";
import {
  type Bar,
  bars,
  LANES,
  type Mode,
  placement,
  rows,
  searchText,
  secs,
  type Timeline,
  usageLine,
} from "./model";

const MODE_KEY = "talk.trajectory.mode";
const LANE_H = 10;
const LANE_GAP = 8;
const TOP = 8;

function Strip({
  data,
  mode,
  onPick,
}: {
  data: Timeline;
  mode: Mode;
  onPick(rowId: string): void;
}) {
  const { out, total } = bars(data.turns, data.agents);
  const real = out.filter((b): b is Bar => !("boundary" in b));
  const n = data.turns.length || 1;
  return (
    <figure className="tj-strip" aria-label="Timeline">
      <div className="tj-lanes">
        {LANES.map(([name], k) => (
          <div key={name} className="tj-lane" style={{ top: TOP + k * (LANE_H + LANE_GAP) - 2 }}>
            {name}
          </div>
        ))}
      </div>
      <div className="tj-plot" style={{ height: TOP + LANES.length * (LANE_H + LANE_GAP) }}>
        {out.map((b, i) => {
          if ("boundary" in b) {
            const left =
              mode === "turns"
                ? b.ti / n
                : mode === "calls"
                  ? Math.max(
                      real.findIndex((r) => r.ti === b.ti),
                      0,
                    ) / Math.max(real.length, 1)
                  : b.gs / total;
            return (
              <div
                key={`b${b.turn}`}
                className="tj-turn"
                style={{ left: `${(left * 100).toFixed(3)}%` }}
              >
                <span>{b.turn}</span>
              </div>
            );
          }
          const [l, r] = placement(b, mode, real, n, total);
          const style: CSSProperties & Record<string, string | number> = {
            left: `${(l * 100).toFixed(3)}%`,
            width: `max(2px, ${((r - l) * 100).toFixed(3)}%)`,
            top: TOP + b.lane * (LANE_H + LANE_GAP),
          };
          if (b.kind === "llm" && b.first != null && b.first > b.start && b.first < b.end)
            style["--first"] = `${Math.round(((b.first - b.start) / (b.end - b.start)) * 100)}%`;
          if (b.color) style["--agent"] = b.color;
          const tip =
            `Turn ${b.turn} · ${b.label || b.kind}\n${secs(b.end - b.start)}` +
            (b.first != null ? ` (first token after ${secs(b.first - b.start)})` : "") +
            (b.bad ? "\nfailed" : "");
          return (
            <Button
              key={`${b.row}-${i}`}
              variant="ghost"
              className={`tj-bar ${b.kind} ${b.tkind || ""} ${b.bad ? "bad" : ""}`}
              style={style}
              title={tip}
              aria-label={tip.replace("\n", ", ")}
              onClick={() => onPick(b.row)}
            />
          );
        })}
      </div>
    </figure>
  );
}

export function Trajectory({ bot }: { bot: Bot }) {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return (localStorage.getItem(MODE_KEY) as Mode) || "duration";
    } catch {
      return "duration";
    }
  });
  const [words, setWords] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [data, setData] = useState<Timeline | null | undefined>(undefined);
  const stamp = useStore((s) => {
    const b = s.bots.find((x) => x.id === bot.id);
    return `${b?.generation}:${b?.lastActivityAt}:${b?.lastPreview}:${b?.avatarColor}:${b?.name}`;
  });
  const [bump, setBump] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the stamp and bump say the conversation moved on
  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/bots/${bot.id}/timeline`, { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Timeline | null) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, [bot.id, stamp, bump]);

  const all = useMemo(() => (data ? rows(data.session, data.turns, data.agents) : []), [data]);
  const q = words.trim().toLowerCase();
  const shown = q ? all.filter((r) => searchText(r).includes(q)) : all;
  const pick = (id: string) => {
    setPicked(id);
    document.getElementById(`tj-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };

  if (data === undefined) return <p className="quiet">Loading…</p>;
  if (!data || !data.turns.length) return <p className="quiet">No turns yet.</p>;
  const usage = usageLine(data.session.usage);
  return (
    <section
      className="tj"
      aria-label="Trajectory"
      style={
        data.session.agent_color
          ? ({ ["--agent" as string]: data.session.agent_color } as CSSProperties)
          : undefined
      }
    >
      <div className="tj-controls">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && pickMode(v as Mode)}
          aria-label="Timeline scale"
        >
          <ToggleGroupItem value="duration">Duration</ToggleGroupItem>
          <ToggleGroupItem value="turns">Turns</ToggleGroupItem>
          <ToggleGroupItem value="calls">Calls</ToggleGroupItem>
        </ToggleGroup>
        {usage && (
          <span className="quiet" title="What this chat has used so far">
            {usage}
          </span>
        )}
        <Input
          type="search"
          className="tj-search"
          placeholder="Search"
          aria-label="Search the log"
          value={words}
          onChange={(e) => setWords(e.target.value)}
        />
        <Button variant="ghost" size="icon-sm" asChild>
          <a
            href={`/api/v2/bots/${bot.id}/export`}
            download={`${bot.id}.jsonl`}
            aria-label="Download this conversation as a session log"
            title="Download this conversation as a session log, tool calls included"
          >
            <IconDownload size={18} />
          </a>
        </Button>
      </div>
      <div className="tj-strip-wrap">
        <Strip data={data} mode={mode} onPick={pick} />
      </div>
      <ol className="tj-rows" aria-label="Every step">
        {shown.map((r, i) => {
          const firstOfTurn = r.turn != null && (i === 0 || shown[i - 1]?.turn !== r.turn);
          return (
            <li key={r.id} id={`tj-${r.id}`}>
              <Button
                variant="ghost"
                onClick={() => setPicked(r.id)}
                className={`tj-row${picked === r.id ? " is-picked" : ""}${r.hid ? " is-hidden" : ""}`}
              >
                <span className="tj-row-turn">{firstOfTurn && <span>Turn {r.turn}</span>}</span>
                <span className="tj-row-tag">
                  <Tag r={r} />
                </span>
                <span className={`tj-row-text${r.mono ? " is-mono" : ""}${r.bad ? " is-bad" : ""}`}>
                  {r.text}
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
      <StepDetails
        bot={bot}
        row={all.find((r) => r.id === picked) ?? null}
        session={data.session}
        onClose={() => setPicked(null)}
        onCleared={() => {
          setPicked(null);
          setBump((n) => n + 1);
        }}
      />
    </section>
  );
}
