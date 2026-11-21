import {
  EmptyLine,
  ListCard,
  ListRow,
  PageControls,
  StatusDot,
  WorkPage,
} from "@jaetask/toolkit/suite";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { useEffect, useMemo, useState } from "react";
import { BotAvatarFor } from "../avatar/BotAvatar";
import { api } from "../lib/api";
import { relativeShort } from "../lib/time";
import { botPath } from "../router";
import { useStore, useVersion } from "../store";
import type { Bot, Task } from "../types";

type Filter = "open" | "done" | "all";

const STATE_LABEL: Record<Task["state"], string> = {
  working: "Working on it",
  needs_input: "Waiting on you",
  done: "Done",
};

const PROGRESS = { working: "in-progress", needs_input: "not-started", done: "done" } as const;

function when(t: Task): string {
  const r = relativeShort(t.updatedAt);
  const ago = r === "now" ? "just now" : r === "Yesterday" ? "yesterday" : `${r} ago`;
  return t.state === "done"
    ? `Completed ${ago}`
    : t.state === "needs_input"
      ? `Asked ${ago}`
      : `Updated ${ago}`;
}

export function useTasks(botId?: string): Task[] | null {
  const v = useVersion(botId ? `tasks:${botId}` : "tasks");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a tasks event bumps the version
  useEffect(() => {
    let alive = true;
    (botId ? api.botTasks(botId) : api.tasks())
      .then((r) => {
        if (alive) setTasks(r.tasks);
      })
      .catch(() => {
        if (alive) setTasks([]);
      });
    return () => {
      alive = false;
    };
  }, [botId, v]);
  return tasks;
}

export function sortTasks(list: Task[]) {
  const rank = { needs_input: 0, working: 1, done: 2 } as const;
  return [...list].sort((a, b) => rank[a.state] - rank[b.state] || b.updatedAt - a.updatedAt);
}

export function TaskRow({ t, bot, showBot }: { t: Task; bot?: Bot; showBot: boolean }) {
  return (
    <ListRow
      {...(bot ? { to: botPath(bot.id) } : {})}
      aside={<StatusDot status={PROGRESS[t.state]} label={STATE_LABEL[t.state]} />}
    >
      <span className="task-text">
        <span className="task-title">{t.title}</span>
        {t.note && <span className="task-note">{t.note}</span>}
        <span className="task-meta">
          {showBot && bot && (
            <>
              <BotAvatarFor bot={bot} size={14} />
              <span>{bot.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span>{when(t)}</span>
        </span>
      </span>
    </ListRow>
  );
}

export function TasksPage() {
  const bots = useStore((s) => s.bots);
  const tasks = useTasks();
  const [filter, setFilter] = useState<Filter>("open");
  const byId = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const open = tasks?.filter((t) => t.state !== "done").length ?? 0;
  const shown = useMemo(
    () =>
      sortTasks(
        (tasks ?? []).filter(
          (t) => filter === "all" || (filter === "done" ? t.state === "done" : t.state !== "done"),
        ),
      ),
    [tasks, filter],
  );
  return (
    <WorkPage
      title="Tasks"
      help="What each bot is working on, and every change waiting for your yes."
    >
      <PageControls>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Which tasks"
        >
          <ToggleGroupItem value="open">In progress{open ? ` ${open}` : ""}</ToggleGroupItem>
          <ToggleGroupItem value="done">Done</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </PageControls>
      {tasks === null ? (
        <EmptyLine>Loading…</EmptyLine>
      ) : shown.length === 0 ? (
        <EmptyLine>
          {filter === "done" ? "Nothing finished yet." : "Nothing in progress."} A bot's long job,
          or a change waiting for your yes, shows here.
        </EmptyLine>
      ) : (
        <ListCard as="ul">
          {shown.map((t) => (
            <TaskRow key={t.id} t={t} bot={byId.get(t.botId)} showBot />
          ))}
        </ListCard>
      )}
    </WorkPage>
  );
}
