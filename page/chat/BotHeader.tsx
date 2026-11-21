import { IconAction } from "@jaetask/toolkit/suite";
import {
  IconHistory,
  IconLayoutSidebarRight,
  IconMessage,
  IconMessagePlus,
  IconSettings,
  IconTimeline,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { botPath } from "../router";
import { useStore } from "../store";
import type { Bot } from "../types";

export function BotHeader({ bot, page }: { bot: Bot; page: "chat" | "trajectory" | "settings" }) {
  const detailsOpen = useStore((s) => s.detailsOpen);
  const setDetailsOpen = useStore((s) => s.setDetailsOpen);
  const setModal = useStore((s) => s.setModal);
  const base = botPath(bot.id);
  return (
    <>
      <IconAction label="Chat" primary={page === "chat"} icon={<IconMessage />} href={base} />
      <IconAction
        label="Trajectory"
        primary={page === "trajectory"}
        icon={<IconTimeline />}
        href={`${base}/trajectory`}
      />
      <IconAction
        label="Earlier conversations"
        icon={<IconHistory />}
        onClick={() => setModal("history")}
      />
      <IconAction
        label="New conversation"
        icon={<IconMessagePlus />}
        onClick={() => api.fresh(bot.id).catch((e) => toast.error((e as Error).message))}
      />
      <IconAction
        label="Bot settings"
        primary={page === "settings"}
        icon={<IconSettings />}
        href={`${base}/settings`}
      />
      {page === "chat" && (
        <IconAction
          label={detailsOpen ? "Hide details" : "Show details"}
          icon={<IconLayoutSidebarRight />}
          onClick={() => setDetailsOpen(!detailsOpen)}
        />
      )}
    </>
  );
}
