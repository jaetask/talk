import type { Json, JsonObject } from "./classify.ts";

const STATUS_WORDS: Record<string, string> = {
  todo: "To do",
  doing: "Doing",
  review: "Review",
  done: "Done",
  canceled: "Cancelled",
};
const DROP_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "version",
  "navOrder",
  "colour",
  "color",
  "icon",
  "iconColour",
  "projectIcon",
  "instructions",
  "guidanceVersion",
  "personaVersion",
  "archivedAt",
  "ticketPrefixes",
]);

type Entity = {
  id: string;
  kind?: string;
  name?: string;
  archived?: boolean;
  ticketPrefix?: string;
  projectId?: string;
  description?: string;
};

export class Catalog {
  readonly entities: Entity[];
  private names = new Map<string, string>();
  constructor(entities: Entity[] = []) {
    this.entities = entities;
    for (const e of entities) this.names.set(e.id, e.name || e.id);
  }
  name(id: unknown): string | undefined {
    return typeof id === "string" && id ? (this.names.get(id) ?? id) : undefined;
  }
  actors(): Entity[] {
    return this.entities.filter((e) => e.kind === "actor" && !e.archived);
  }
  promptBlock(): string {
    if (!this.entities.length) return "";
    const projects = this.entities
      .filter((e) => e.kind === "project" && !e.archived)
      .map((p) => `${p.name} (${p.ticketPrefix || "?"}-…)`);
    const actors = this.actors()
      .map((a) => a.name)
      .filter(Boolean);
    return (
      `How Tasks' project names are spelled, for tool arguments (speech recognition mishears names: use the closest one and say which you mean): ${projects.join(", ")}.` +
      (actors.length ? ` Ticket owners: ${actors.join(", ")}.` : "") +
      " This is not the list of what Jae has: for which projects exist or what one is about, call catalog-read."
    );
  }
}

export function maybeJson(text: string): Json {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const keep = (o: Record<string, unknown>): JsonObject =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) =>
        v !== undefined &&
        v !== null &&
        v !== "" &&
        v !== false &&
        !(Array.isArray(v) && !v.length),
    ),
  ) as JsonObject;

function ticketLine(t: Record<string, any>, cat: Catalog): JsonObject {
  return keep({
    id: t.id,
    title: t.title,
    status: STATUS_WORDS[t.status] ?? t.status,
    priority: t.priority == null || t.priority === "none" ? undefined : t.priority,
    owner: cat.name(t.actorId),
    feature: cat.name(t.featureId),
    where: t.archivedAt ? "archive" : t.placement,
    tags: t.labels?.length ? t.labels : undefined,
    due: t.dueDate,
    blocked_by: t.blockedBy?.length ? t.blockedBy : undefined,
  });
}

export function displayTasks(
  s: Record<string, any> | undefined,
  cat: Catalog,
): JsonObject | undefined {
  if (Array.isArray(s?.tickets))
    return {
      total: s.total ?? s.tickets.length,
      tickets: s.tickets.slice(0, 200).map((t: any) => ticketLine(t, cat)),
    };
  if (s?.ticket && typeof s.ticket === "object") return { ticket: ticketLine(s.ticket, cat) };
  return undefined;
}

export function compactTasks(
  tool: string,
  s: Record<string, any> | undefined,
  text: string,
  cat: Catalog,
): string {
  s = s ?? {};
  try {
    if (["list-tasks", "get-board", "board-read"].includes(tool) && Array.isArray(s.tickets)) {
      let items = s.tickets.slice(0, 40).map((t: any) => ticketLine(t, cat));
      const out: JsonObject = { total: s.total ?? items.length };
      const names: string[] = s.tickets.map((t: any) => cat.name(t.projectId) ?? "no project");
      if (new Set(names).size > 1) {
        const by: Record<string, number> = {};
        for (const n of [...names].sort()) by[n] = (by[n] ?? 0) + 1;
        out.by_project = by;
        items = items.map((line: JsonObject, i: number) => ({ ...line, project: names[i] }));
      }
      return JSON.stringify({ ...out, tickets: items });
    }
    if (["get-catalog", "catalog-read"].includes(tool) && Array.isArray(s.entities)) {
      const live: Entity[] = s.entities.filter((e: Entity) => !e.archived);
      const projects = new Map<string, any>();
      for (const e of live)
        if (e.kind === "project")
          projects.set(e.id, keep({ project: e.name, id: e.id, tickets: e.ticketPrefix }));
      const loose: any[] = [];
      for (const e of live) {
        if (e.kind !== "feature") continue;
        const row = keep({ feature: e.name, id: e.id });
        const home = e.projectId ? projects.get(e.projectId) : undefined;
        if (home) {
          home.features ??= [];
          home.features.push(row);
        } else loose.push(row);
      }
      const out: any = {
        projects: [...projects.values()],
        ...(loose.length ? { other_features: loose } : {}),
      };
      const size = () => JSON.stringify(out).length;
      for (const p of [...out.projects].sort(
        (a, b) => (b.features?.length ?? 0) - (a.features?.length ?? 0),
      ))
        while (size() > 7000 && p.features?.length) p.features.pop();
      const descs = new Map(
        live.map((e) => [e.id, (e.description ?? "").split(/\s+/).filter(Boolean).join(" ")]),
      );
      const rows = [...out.projects, ...out.projects.flatMap((p: any) => p.features ?? [])];
      for (const row of rows) {
        const d = (descs.get(row.id) ?? "").slice(0, "project" in row ? 300 : 120);
        if (d && size() + d.length + 20 <= 7000) row.description = d;
      }
      return JSON.stringify(out);
    }
    if (["get-task", "ticket-read"].includes(tool) && s.ticket) {
      const t = s.ticket;
      const out: any = ticketLine(t, cat);
      out.project = cat.name(t.projectId);
      if (t.version != null) out.version = t.version;
      out.description = String(t.body ?? "").slice(0, 900);
      const comments: any[] = (s.comments ?? []).filter((c: any) => !c.deleted);
      out.comment_count = comments.length;
      out.latest_comments = comments.slice(-3).map((c) => ({
        n: comments.indexOf(c) + 1,
        by: cat.name(c.actorId),
        when: String(c.createdAt ?? "").slice(0, 10),
        text: String(c.body ?? "").slice(0, 300),
      }));
      if (s.steps?.length)
        out.steps = s.steps
          .slice(0, 30)
          .map((st: any, i: number) => ({ n: i + 1, step: st.title, done: Boolean(st.completed) }));
      return JSON.stringify(out);
    }
  } catch {}
  return compactGeneric(Object.keys(s).length ? (s as Json) : maybeJson(text));
}

function trim(o: Json, depth = 0): Json {
  if (depth > 6) return "…";
  if (Array.isArray(o)) {
    const items = o.slice(0, 20).map((v) => trim(v, depth + 1));
    return o.length > 20 ? [...items, `…and ${o.length - 20} more`] : items;
  }
  if (o && typeof o === "object") {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(o)) {
      if (
        DROP_KEYS.has(k) ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && !v.length) ||
        (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)
      )
        continue;
      out[k] = trim(v, depth + 1);
    }
    return out;
  }
  if (typeof o === "string" && o.length > 300) return `${o.slice(0, 300)}…`;
  return o;
}

export const compactGeneric = (o: Json): string => JSON.stringify(trim(o)).slice(0, 4000);
export const displayGeneric = (o: Json): string => JSON.stringify(trim(o));

export const maskNumbers = (text: string): string =>
  text.replace(
    /(?<!\d)(?!\d{4}-\d\d-\d\d(?!\d))\d(?:[ -]?\d){7,}(?!\d)/g,
    (m) => `••••${m.replace(/\D/g, "").slice(-4)}`,
  );
