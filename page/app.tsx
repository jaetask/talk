import { AppShell, EmptyLine, type GroupItem, WorkPage } from "@jaetask/toolkit/suite";
import { IconArrowLeft, IconChecklist, IconPlus } from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BotAvatarFor } from "./avatar/BotAvatar";
import { BotHeader } from "./chat/BotHeader";
import { ChatPage } from "./chat/ChatPage";
import { startEvents } from "./lib/events";
import { HistoryDialog } from "./modals/History";
import { SearchDialog } from "./modals/Search";
import { BotPage } from "./pages/BotSettings";
import { NewBotDialog } from "./pages/NewBot";
import { SETTINGS, SettingsPage } from "./pages/Settings";
import { TasksPage, useTasks } from "./pages/Tasks";
import { botPath, go, parse, type Route, usePath } from "./router";
import { displayName, primaryBot, useBot, useStore } from "./store";
import type { Bot } from "./types";
import { Trajectory } from "./trajectory/Trajectory";

const COLLAPSED = "tk-sidebar-collapsed";

function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED) === "true";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED, String(next));
    } catch {}
  };
  return [collapsed, set] as const;
}

function routeBot(route: Route): string | null {
  return "botId" in route ? route.botId : null;
}

function BotFrame({
  bot,
  page,
  children,
}: {
  bot: Bot;
  page: "chat" | "trajectory";
  children: ReactNode;
}) {
  return (
    <WorkPage
      wide
      title={displayName(bot)}
      icon={<BotAvatarFor bot={bot} size={22} star={bot.isPrimary} />}
      help={bot.description || undefined}
      action={<BotHeader bot={bot} page={page} />}
    >
      {children}
    </WorkPage>
  );
}

export function App() {
  const path = usePath();
  const route = useMemo(() => parse(path), [path]);
  const bots = useStore((s) => s.bots);
  const botsLoaded = useStore((s) => s.botsLoaded);
  const live = useStore((s) => s.live);
  const modal = useStore((s) => s.modal);
  const setModal = useStore((s) => s.setModal);
  const [collapsed, setCollapsed] = useCollapsed();
  const tasks = useTasks();
  const waiting = tasks?.filter((t) => t.state === "needs_input").length ?? 0;
  const botId = routeBot(route);
  const bot = useBot(botId);

  useEffect(() => {
    useStore.getState().loadBots().catch(console.error);
    return startEvents();
  }, []);

  useEffect(() => {
    if (route.page !== "chat" || route.botId || !botsLoaded) return;
    const first = primaryBot(bots);
    if (first) go(botPath(first.id));
  }, [route, bots, botsLoaded]);

  useEffect(() => {
    if (botId && bots.some((b) => b.id === botId)) useStore.getState().selectBot(botId);
  }, [botId, bots]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const st = useStore.getState();
      if (key === "k") {
        e.preventDefault();
        st.setModal(st.modal === "search" ? null : "search");
      } else if (key === "b") {
        e.preventDefault();
        setCollapsed(!collapsed);
      } else if (e.shiftKey && (key === "," || key === "<")) {
        e.preventDefault();
        st.setDetailsOpen(!st.detailsOpen);
      } else if (key === ",") {
        e.preventDefault();
        go("/settings");
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [collapsed, setCollapsed]);

  const ordered = useMemo(() => {
    const primary = bots.find((b) => b.isPrimary);
    const others = bots
      .filter((b) => !b.isPrimary)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    return primary ? [primary, ...others] : others;
  }, [bots]);

  const items: GroupItem[] = ordered.map((b) => {
    const l = live[b.id];
    const attention = !!l?.awaiting;
    return {
      id: b.id,
      href: botPath(b.id),
      label: b.name,
      avatar: (
        <span className="side-avatar">
          <BotAvatarFor bot={b} size={18} star={b.isPrimary} />
          {(attention || b.unread > 0) && (
            <span
              className={`side-badge${attention ? " is-attention" : ""}`}
              role="img"
              aria-label={attention ? "Waiting for you" : "Unread"}
            />
          )}
        </span>
      ),
      ...(l?.isRunning ? { status: "in-progress" as const } : {}),
      current: b.id === botId,
    };
  });

  let body: ReactNode = null;
  const last = useLastBot(route, bots);
  switch (route.page) {
    case "chat":
      body = bot ? (
        <BotFrame bot={bot} page="chat">
          <ChatPage bot={bot} />
        </BotFrame>
      ) : null;
      break;
    case "trajectory":
      body = bot ? (
        <BotFrame bot={bot} page="trajectory">
          <Trajectory bot={bot} />
        </BotFrame>
      ) : null;
      break;
    case "bot":
      body = bot ? <BotPage bot={bot} /> : null;
      break;
    case "new-bot":
      body = last ? (
        <BotFrame bot={last} page="chat">
          <ChatPage bot={last} />
        </BotFrame>
      ) : null;
      break;
    case "tasks":
      body = <TasksPage />;
      break;
    case "settings":
      body = <SettingsPage section={route.section} />;
      break;
  }
  if (botId && botsLoaded && !bot) body = <EmptyLine>No such bot.</EmptyLine>;

  if (route.page === "settings")
    return (
      <AppShell
        app={{ name: "Talk", href: "/" }}
        bar={false}
        nav={[
          { href: "/", label: "Back to Talk", icon: <IconArrowLeft size={16} aria-hidden /> },
          ...SETTINGS.map(([id, label, icon]) => ({
            href: `/settings/${id}`,
            label,
            icon,
            current: route.section === id,
          })),
        ]}
      >
        {body}
      </AppShell>
    );

  return (
    <div
      className={
        route.page === "chat" || route.page === "trajectory" || route.page === "new-bot"
          ? "talk is-full"
          : "talk"
      }
    >
      <AppShell
        app={{ name: "Talk", href: "/" }}
        bar={false}
        nav={[
          {
            href: "/tasks",
            label: "Tasks",
            icon: <IconChecklist size={16} />,
            current: route.page === "tasks",
            count: waiting,
          },
        ]}
        groups={[
          {
            label: "Bots",
            items,
            empty: "Make a bot with New bot below.",
          },
        ]}
        bottom={[
          {
            href: "/bots/new",
            label: "New bot",
            icon: <IconPlus size={16} />,
            current: route.page === "new-bot",
          },
        ]}
        settingsHref="/settings/general"
        onSearch={() => setModal("search")}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      >
        {body}
      </AppShell>
      <NewBotDialog open={route.page === "new-bot"} />
      <SearchDialog open={modal === "search"} onClose={() => setModal(null)} />
      {bot && <HistoryDialog bot={bot} open={modal === "history"} onClose={() => setModal(null)} />}
    </div>
  );
}

function useLastBot(route: Route, bots: Bot[]): Bot | null {
  const [lastId, setLastId] = useState<string | null>(null);
  const id = "botId" in route ? route.botId : null;
  useEffect(() => {
    if (id) setLastId(id);
  }, [id]);
  return bots.find((b) => b.id === lastId) ?? primaryBot(bots) ?? null;
}
