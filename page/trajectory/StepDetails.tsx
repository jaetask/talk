import { Button } from "@jaetask/toolkit/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@jaetask/toolkit/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@jaetask/toolkit/ui/tabs";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import type { Bot } from "../types";
import { appOf, type Row, type Session, secs, toolOf } from "./model";

const Pre = ({ children }: { children: unknown }) => (
  <pre className="tj-pre">
    {typeof children === "string" ? children : JSON.stringify(children, null, 1)}
  </pre>
);
const Muted = ({ children }: { children: ReactNode }) => <p className="quiet">{children}</p>;

export function Tag({ r }: { r: Row }) {
  if (r.role === "tool" && r.by) {
    return (
      <span className="tj-tags">
        <span
          className="tj-tag agent"
          style={{ "--agent": r.byColor || "inherit" } as CSSProperties}
        >
          {r.by}
        </span>
        <span className="tj-arrow">→</span>
        <span className={`tj-tag tool ${r.kind || ""}`}>{r.tag}</span>
      </span>
    );
  }
  return (
    <span
      className={`tj-tag ${r.role} ${r.kind || ""}`}
      style={r.color ? ({ "--agent": r.color } as CSSProperties) : undefined}
    >
      {r.tag}
    </span>
  );
}

type CaseResult = { saved?: string | null; next?: string; error?: string };

export function StepDetails({
  bot,
  row,
  session,
  onClose,
  onCleared,
}: {
  bot: Bot;
  row: Row | null;
  session: Session;
  onClose(): void;
  onCleared(): void;
}) {
  const t = row?.t;
  const c = row?.c;
  const tabs = c
    ? ["summary", "payload", "result", "timing"]
    : row?.role === "agent"
      ? ["summary", "result", "timing"]
      : row?.role === "user"
        ? ["summary", "payload", "timing"]
        : ["summary", "timing"];
  const [confirming, setConfirming] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new row starts fresh
  useEffect(() => {
    setConfirming(false);
    setMade(null);
  }, [row?.id]);

  const clear = async () => {
    if (!t?.id) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await api.redactTurn(bot.id, t.id);
      toast(`Turn ${row?.turn} is cleared.`);
      onCleared();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const makeTest = async (kind: "golden" | "regression") => {
    if (!t?.id) return;
    const r = await fetch(`/api/v2/bots/${bot.id}/turns/${t.id}/case`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const j = (await r.json().catch(() => ({}))) as CaseResult;
    if (!r.ok) {
      toast.error(j.error ?? "That turn can't be made into a test.");
      return;
    }
    setMade(
      j.saved ? `Saved ${j.saved}. ${j.next ?? ""}` : "Made, but this Talk has no cases folder.",
    );
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      {row && (
        <DialogContent className="tj-dialog">
          <DialogHeader>
            <DialogTitle className="tj-dialog-title">
              <Tag r={row} />
              <span className="quiet">
                {row.turn != null ? `Turn ${row.turn} · Step ${row.step}` : "Session"}
              </span>
            </DialogTitle>
          </DialogHeader>
          {t?.id ? (
            <div className="tj-dialog-actions">
              <Button
                variant="outline"
                size="sm"
                title="Save this turn as a golden test: it went well"
                onClick={() => void makeTest("golden")}
              >
                Make test ✓
              </Button>
              <Button
                variant="outline"
                size="sm"
                title="Save this turn as a regression test: it went wrong"
                onClick={() => void makeTest("regression")}
              >
                Make test ✗
              </Button>
              <Button
                variant="outline-destructive"
                size="sm"
                title="Hide this turn from the chat, exports and tests"
                onClick={() => void clear()}
                onMouseLeave={() => setConfirming(false)}
              >
                {confirming ? "Clear it?" : "Clear"}
              </Button>
            </div>
          ) : null}
          {made && <p className="quiet">{made}</p>}
          <Tabs defaultValue="summary" key={row.id}>
            <TabsList>
              {tabs.map((x) => (
                <TabsTrigger key={x} value={x}>
                  {x[0]?.toUpperCase() + x.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="summary">
              {row.role === "system" ? (
                <Pre>{session.system_note || row.text}</Pre>
              ) : c ? (
                <>
                  <p>
                    {row.by} called{" "}
                    <b>
                      {appOf(c.name)} · {toolOf(c.name)}
                    </b>{" "}
                    ({c.kind || "?"}) → <b>{c.outcome}</b> in {secs(c.duration_s)}.
                  </p>
                  <Pre>{row.text}</Pre>
                </>
              ) : row.role === "route" ? (
                <>
                  <p>
                    Model: <b>{t?.model || "—"}</b> on <b>{t?.harness || "—"}</b>.
                  </p>
                  <Pre>{row.more}</Pre>
                  <Muted>
                    There is no keyword router here: the model sees its short list of tools and
                    finds the rest with tool search.
                  </Muted>
                </>
              ) : (
                <Pre>{row.text}</Pre>
              )}
            </TabsContent>
            <TabsContent value="payload">
              {c ? (
                <>
                  <Muted>The exact arguments sent (retry key hidden).</Muted>
                  <Pre>{c.args || {}}</Pre>
                </>
              ) : (
                <Pre>{t?.user_text ?? ""}</Pre>
              )}
            </TabsContent>
            <TabsContent value="result">
              {c ? (
                <Pre>{c.result || "(no result saved)"}</Pre>
              ) : (
                <>
                  <h4 className="tj-h">What was shown and spoken</h4>
                  <Pre>{(t?.reply || "").trim()}</Pre>
                </>
              )}
            </TabsContent>
            <TabsContent value="timing">
              {c ? (
                <Pre>
                  {{
                    started_into_turn: secs(c.start_s),
                    took: secs(c.duration_s),
                    outcome: c.outcome,
                    agent: row.by,
                  }}
                </Pre>
              ) : (
                <Pre>
                  {{
                    spans: (t?.spans || []).map((x) => ({
                      kind: x.kind,
                      label: x.label,
                      from: secs(x.start),
                      to: secs(x.end),
                      first_token: x.first != null ? secs(x.first) : undefined,
                    })),
                    total: secs(t?.timings?.total),
                    source: t?.source || "—",
                  }}
                </Pre>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      )}
    </Dialog>
  );
}
