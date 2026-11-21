import { Button } from "@jaetask/toolkit/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@jaetask/toolkit/ui/dialog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Conversation } from "../lib/api";
import { dividerLabel } from "../lib/time";
import type { Bot } from "../types";

export function HistoryDialog({
  bot,
  open,
  onClose,
}: {
  bot: Bot;
  open: boolean;
  onClose: () => void;
}) {
  const [list, setList] = useState<Conversation[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setList(null);
    api
      .conversations(bot.id)
      .then((d) => {
        if (alive) setList(d.conversations);
      })
      .catch((e) => {
        if (alive) toast.error((e as Error).message);
      });
    return () => {
      alive = false;
    };
  }, [bot.id, open]);
  const pick = async (c: Conversation) => {
    if (!c.current) {
      try {
        await api.openConversation(bot.id, c.id);
      } catch {
        toast.error("That conversation did not open.");
        return;
      }
    }
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="history-dialog">
        <DialogHeader>
          <DialogTitle>{bot.name}'s conversations</DialogTitle>
        </DialogHeader>
        {list === null ? (
          <p className="quiet">Loading…</p>
        ) : list.length === 0 ? (
          <p className="quiet">No conversations yet.</p>
        ) : (
          <ul className="history-list">
            {list.map((c) => (
              <li key={c.id}>
                <Button
                  variant="ghost"
                  className={`history-row${c.current ? " is-current" : ""}`}
                  onClick={() => void pick(c)}
                >
                  <span className="task-text">
                    <span className="task-title">{c.first || "Untitled"}</span>
                    <span className="task-note">
                      {dividerLabel(c.at)} · {c.turns} {c.turns === 1 ? "turn" : "turns"}
                      {c.current ? " · on screen now" : ""}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
