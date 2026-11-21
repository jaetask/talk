import { Button } from "@jaetask/toolkit/ui/button";
import { IconCheck, IconX } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { api } from "../lib/api";
import type { CardBody, Row, ToolCard } from "../types";

type ApprovalBody = Extract<CardBody, { card: "approval" }>;

const prettyTool = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

const humanize = (slug: string) =>
  slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const OUTCOME: Record<string, string> = {
  allowed: "Allowed once",
  always: "Always allowed",
  denied: "Not allowed",
  expired: "Expired",
};

function AppMark({ name }: { name: string }) {
  return (
    <span className="app-mark" aria-hidden>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function ApprovalCard({ body }: { body: ApprovalBody }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = body.status === "pending";
  const name = body.toolkit ? humanize(body.toolkit) : prettyTool(body.tool);
  const decide = async (d: "allow" | "deny") => {
    setBusy(true);
    setError(null);
    try {
      await api.approve(body.approvalId, d);
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`chat-card approval-card${pending ? "" : " is-resolved"}`}>
      <div className="chat-card-head">
        <AppMark name={name} />
        <div>
          <div className="chat-card-title">{body.title}</div>
          <div className="chat-card-line">{name}</div>
        </div>
      </div>
      {body.detail && <p className="chat-card-body">{body.detail}</p>}
      {pending ? (
        <div className="chat-card-actions">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => decide("deny")}>
            Don't allow
          </Button>
          <Button size="sm" disabled={busy} onClick={() => decide("allow")}>
            Allow
          </Button>
        </div>
      ) : (
        <div className={`chat-card-outcome is-${body.status}`}>
          {body.status === "denied" || body.status === "expired" ? (
            <IconX size={14} />
          ) : (
            <IconCheck size={14} />
          )}
          {OUTCOME[body.status] ?? body.status}
        </div>
      )}
      {error && <p className="problem">{error}</p>}
    </div>
  );
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" && /^[[{]/.test(v)) {
    try {
      return cellText(JSON.parse(v));
    } catch {
      return v;
    }
  }
  if (Array.isArray(v)) return v.map(cellText).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.formatted === "string") return o.formatted;
    if (typeof o.amount === "number" || typeof o.amount === "string") {
      const n = Number(o.amount);
      const figure = Number.isFinite(n)
        ? n.toLocaleString("en-GB", { maximumFractionDigits: 2 })
        : String(o.amount);
      return typeof o.currency === "string" ? `${figure} ${o.currency}` : figure;
    }
    if (typeof o.name === "string") return o.name;
    if (typeof o.title === "string") return o.title;
    return JSON.stringify(v);
  }
  return String(v);
}

const DESCRIBING = ["description", "purpose", "summary", "about", "bio", "tagline"];
const NAMING = ["name", "title", "handle", "label", "slug"];
const LONG = 60;
const TICKET_COLS = ["id", "title", "status", "owner", "priority", "feature", "due"];
const ROWS_SHOWN = 8;
const NAMES_SHOWN = 12;

type Record_ = Record<string, unknown>;

const longest = (rows: Record_[], col: string): number =>
  Math.max(0, ...rows.map((r) => cellText(r[col]).length));

const worthShowing = (rows: Record_[], col: string): boolean => {
  const values = rows.map((r) => r[col]).filter((x) => x !== null && x !== undefined && x !== "");
  return (
    values.length > 0 &&
    !values.every((x) => typeof x === "string" && (UUIDISH.test(x) || x.startsWith("data:")))
  );
};

function listColumns(rows: Record_[], columns: string[]): string[] {
  const kept = columns.filter((c) => worthShowing(rows, c));
  if (rows.length < 2) return kept;
  const naming = kept
    .filter((c) => NAMING.includes(c.toLowerCase()))
    .sort((p, q) => NAMING.indexOf(p.toLowerCase()) - NAMING.indexOf(q.toLowerCase()));
  const rest = kept.filter((c) => !naming.includes(c));
  const short = rest.filter((c) => longest(rows, c) <= LONG);
  const long = rest.filter((c) => longest(rows, c) > LONG);
  return [...naming, ...short, ...long.slice(0, 1)].slice(0, 7);
}

const headText = (c: string): string =>
  c
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();

function Toggle({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="link" size="xs" className="tool-card-more" onClick={onClick}>
      {children}
    </Button>
  );
}

export function ToolResultCard({ card }: { card: ToolCard }) {
  const [all, setAll] = useState(false);
  const [details, setDetails] = useState(false);
  let listed = false;
  const rows: Record_[] = Array.isArray(card.data.rows) ? card.data.rows : [];
  const total = typeof card.data.total === "number" ? card.data.total : rows.length;
  let body: ReactNode = null;
  if (card.view === "change") {
    const changes: { field?: string; from?: unknown; to?: unknown }[] = Array.isArray(
      card.data.changes,
    )
      ? card.data.changes
      : [];
    body = (
      <div className="tool-card-change">
        {card.data.target && (
          <div className="tool-card-target">
            {cellText(card.data.target.title ?? card.data.target.id ?? card.data.target)}
          </div>
        )}
        {changes.map((c, i) => (
          <div key={`${c.field}-${i}`} className="tool-card-kv">
            <span>{c.field}</span>
            <span>
              {c.from !== undefined && c.from !== null && c.from !== ""
                ? `${cellText(c.from)} → `
                : ""}
              {cellText(c.to)}
            </span>
          </div>
        ))}
        {card.data.pretend && <p className="quiet">Test mode: nothing was changed.</p>}
      </div>
    );
  } else if (card.view === "sources") {
    body = (
      <div className="tool-card-sources">
        {(all ? rows : rows.slice(0, 4)).map((r, i) => (
          <div key={`${cellText(r.link)}-${i}`} className="tool-card-source">
            <div className="tool-card-source-title">
              {cellText(r.title)}
              {r.link ? (
                <>
                  {" · "}
                  <a href={cellText(r.link)} target="_blank" rel="noreferrer noopener">
                    {cellText(r.source) || "source"}
                  </a>
                </>
              ) : r.source ? (
                ` · ${cellText(r.source)}`
              ) : (
                ""
              )}
            </div>
            {!!r.quote && <div className="tool-card-quote">{cellText(r.quote)}</div>}
          </div>
        ))}
      </div>
    );
  } else {
    const allCols: string[] = Array.isArray(card.data.columns) ? card.data.columns : [];
    const cols: string[] =
      card.view === "tickets"
        ? TICKET_COLS.filter((c) =>
            rows.some((r) => r[c] !== undefined && r[c] !== null && r[c] !== ""),
          )
        : listColumns(rows, allCols);
    body = cols.length ? (
      <div className="tool-card-scroll">
        <table className="tool-card-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{headText(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(all ? rows : rows.slice(0, ROWS_SHOWN)).map((r, i) => (
              <tr key={`${cellText(r[cols[0] ?? ""])}-${i}`}>
                {cols.map((c) => {
                  const text = cellText(r[c]);
                  return (
                    <td key={c} title={text}>
                      {text.length > LONG ? <span className="clamp">{text}</span> : text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null;
    const nameCol =
      card.view === "table" && rows.length >= 2
        ? cols.find((c) => NAMING.includes(c.toLowerCase()))
        : undefined;
    const describing = nameCol
      ? (DESCRIBING.map((d) => allCols.find((c) => c.toLowerCase() === d)).find(Boolean) ??
        allCols.find((c) => c !== nameCol && worthShowing(rows, c) && longest(rows, c) > LONG))
      : undefined;
    if (nameCol && !details) {
      body = (
        <ul className="tool-card-items">
          {(all ? rows : rows.slice(0, NAMES_SHOWN)).map((r, i) => {
            const about = describing ? cellText(r[describing]) : "";
            return (
              <li key={`${cellText(r[nameCol])}-${i}`}>
                <span className="tool-card-item-name">{cellText(r[nameCol])}</span>
                {about && (
                  <span className="tool-card-item-about clamp" title={about}>
                    {about}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
      listed = true;
    } else if (nameCol) listed = true;
  }
  const limit = card.view === "sources" ? 4 : listed && !details ? NAMES_SHOWN : ROWS_SHOWN;
  const more = card.view !== "change" && rows.length > limit;
  return (
    <div className="chat-card tool-card">
      <div className="tool-card-head">
        <span className="tool-card-app">{card.app_label}</span>
        <span className="tool-card-tool">{card.tool}</span>
        {card.view !== "change" && (
          <span className="tool-card-count">
            {total} {total === 1 ? "row" : "rows"}
          </span>
        )}
        {card.outcome && card.outcome !== "ok" && (
          <span className={`tool-card-outcome is-${card.outcome}`}>{card.outcome}</span>
        )}
      </div>
      {body}
      {(listed || more) && (
        <div className="tool-card-foot">
          {listed && (
            <Toggle onClick={() => setDetails(!details)}>
              {details ? "Hide details" : "Show details"}
            </Toggle>
          )}
          {more && (
            <Toggle onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </Toggle>
          )}
        </div>
      )}
    </div>
  );
}

export function CardRow({ row }: { row: Row }) {
  const b = row.body;
  if (b.type !== "card") return null;
  if (b.card === "approval") return <ApprovalCard body={b} />;
  if (b.card === "tool") return <ToolResultCard card={b.data} />;
  return null;
}
