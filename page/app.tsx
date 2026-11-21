import { AppShell, type GroupItem } from "@jaetask/toolkit/suite";
import {
  IconChecklist,
  IconHistory,
  IconLayoutSidebarRight,
  IconMessage,
  IconMessagePlus,
  IconPlus,
  IconSettings,
  IconTimeline,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BotAvatarFor } from "./avatar/BotAvatar";
import { ChatPage } from "./chat/ChatPage";
import { IconButton } from "./icons";
import { api } from "./lib/api";
import { startEvents } from "./lib/events";
import { HistoryDialog } from "./modals/History";
import { SearchDialog } from "./modals/Search";
import { BotEditPage, BotPage } from "./pages/BotSettings";
import { NewBotPage } from "./pages/NewBot";
import { SettingsEditPage, SettingsPage } from "./pages/Settings";
import { TasksPage, useTasks } from "./pages/Tasks";
import { botPath, go, parse, type Route, usePath } from "./router";
import { displayName, primaryBot, useBot, useStore } from "./store";
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

function BotTools({ botId, page }: { botId: string; page: "chat" | "trajectory" }) {
  const detailsOpen = useStore((s) => s.detailsOpen);
  const setDetailsOpen = useStore((s) => s.setDetailsOpen);
  const setModal = useStore((s) => s.setModal);
  return (
    <>
      <IconButton label="Chat" pressed={page === "chat"} onClick={() => go(botPath(botId))}>
        <IconMessage size={18} />
      </IconButton>
      <IconButton
        label="Trajectory"
        pressed={page === "trajectory"}
        onClick={() => go(`${botPath(botId)}/trajectory`)}
      >
        <IconTimeline size={18} />
      </IconButton>
      <IconButton label="Earlier conversations" onClick={() => setModal("history")}>
        <IconHistory size={18} />
      </IconButton>
      <IconButton
        label="New conversation"
        onClick={() => api.fresh(botId).catch((e) => toast.error((e as Error).message))}
      >
        <IconMessagePlus size={18} />
      </IconButton>
      <IconButton label="Bot settings" onClick={() => go(`${botPath(botId)}/settings`)}>
        <IconSettings size={18} />
      </IconButton>
      {page === "chat" && (
        <IconButton
          label={detailsOpen ? "Hide details" : "Show details"}
          pressed={detailsOpen}
          onClick={() => setDetailsOpen(!detailsOpen)}
        >
          <IconLayoutSidebarRight size={18} />
        </IconButton>
      )}
    </>
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

  let title: ReactNode = null;
  let body: ReactNode = null;
  let aside: ReactNode = null;
  switch (route.page) {
    case "chat":
      title = bot ? displayName(bot) : null;
      body = bot ? <ChatPage bot={bot} /> : null;
      aside = bot ? <BotTools botId={bot.id} page="chat" /> : null;
      break;
    case "trajectory":
      title = bot ? `${displayName(bot)} · Trajectory` : null;
      body = bot ? <Trajectory bot={bot} /> : null;
      aside = bot ? <BotTools botId={bot.id} page="trajectory" /> : null;
      break;
    case "bot":
      title = bot ? displayName(bot) : null;
      body = bot ? <BotPage bot={bot} /> : null;
      break;
    case "bot-edit":
      title = bot ? displayName(bot) : null;
      body = bot ? <BotEditPage bot={bot} section={route.section} /> : null;
      break;
    case "new-bot":
      title = "New bot";
      body = <NewBotPage />;
      break;
    case "tasks":
      title = "Tasks";
      body = <TasksPage />;
      break;
    case "settings":
      title = "Settings";
      body = <SettingsPage />;
      break;
    case "settings-edit":
      title = "Settings";
      body = <SettingsEditPage section={route.section} />;
      break;
  }
  if (botId && botsLoaded && !bot) body = <p className="quiet">No such bot.</p>;

  return (
    <div className={route.page === "chat" || route.page === "trajectory" ? "talk is-full" : "talk"}>
      <AppShell
        app={{ name: "Talk", href: "/" }}
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
        settingsHref="/settings"
        onSearch={() => setModal("search")}
        title={title}
        topAside={aside}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
      >
        {body}
      </AppShell>
      <SearchDialog open={modal === "search"} onClose={() => setModal(null)} />
      {bot && <HistoryDialog bot={bot} open={modal === "history"} onClose={() => setModal(null)} />}
    </div>
  );
}
