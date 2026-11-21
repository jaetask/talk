import { create } from "zustand";
import { api } from "./lib/api";
import type { Bot, LiveState, Row, ServerEvent } from "./types";

type Transcript = { generation: number; bySeq: Record<number, Row>; loaded: boolean };

type State = {
  bots: Bot[];
  botsLoaded: boolean;
  live: Record<string, LiveState>;
  selectedBotId: string | null;
  transcripts: Record<string, Transcript>;
  connectionsVersion: number;
  versions: Record<string, number>;
  detailsOpen: boolean;
  modal: "search" | "history" | null;
  loadBots(): Promise<void>;
  selectBot(id: string): void;
  loadRows(id: string): Promise<void>;
  upsertRows(botId: string, generation: number, rows: Row[], replace?: [number, number]): void;
  handleEvent(ev: ServerEvent): void;
  bump(key: string): void;
  setDetailsOpen(open: boolean): void;
  setModal(m: State["modal"]): void;
};

const DETAILS = "talk.detailsOpen";
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export const useStore = create<State>((set, get) => ({
  bots: [],
  botsLoaded: false,
  live: {},
  selectedBotId: null,
  transcripts: {},
  connectionsVersion: 0,
  versions: {},
  detailsOpen: lsGet(DETAILS) !== "0",
  modal: null,

  async loadBots() {
    const { bots, live } = await api.bots();
    const liveMap: Record<string, LiveState> = {};
    for (const l of live) liveMap[l.botId] = l;
    set({ bots, live: liveMap, botsLoaded: true });
  },

  selectBot(id) {
    if (get().selectedBotId === id && get().transcripts[id]?.loaded) return;
    set({ selectedBotId: id });
    if (!get().transcripts[id]?.loaded) get().loadRows(id).catch(console.error);
    const bot = get().bots.find((b) => b.id === id);
    if (bot?.unread) api.markRead(id).catch(() => {});
  },

  async loadRows(id) {
    const { generation, rows } = await api.rows(id);
    const bySeq: Record<number, Row> = {};
    for (const r of rows) bySeq[r.seq] = r;
    const prev = get().transcripts[id];
    if (prev && prev.generation === generation) {
      for (const r of Object.values(prev.bySeq)) {
        const mine = bySeq[r.seq];
        if (!mine || mine.updatedSeq < r.updatedSeq) bySeq[r.seq] = r;
      }
    }
    set((s) => ({ transcripts: { ...s.transcripts, [id]: { generation, bySeq, loaded: true } } }));
  },

  upsertRows(botId, generation, rows, replace) {
    set((s) => {
      const prev = s.transcripts[botId];
      if (prev && generation < prev.generation) return {};
      const base: Transcript =
        !prev || generation > prev.generation
          ? { generation, bySeq: {}, loaded: prev?.loaded ?? false }
          : prev;
      const bySeq = { ...base.bySeq };
      if (replace)
        for (const k of Object.keys(bySeq))
          if (Number(k) >= replace[0] && Number(k) <= replace[1]) delete bySeq[Number(k)];
      for (const r of rows) {
        const cur = bySeq[r.seq];
        if (!cur || r.updatedSeq >= cur.updatedSeq) bySeq[r.seq] = r;
      }
      return { transcripts: { ...s.transcripts, [botId]: { ...base, generation, bySeq } } };
    });
  },

  handleEvent(ev) {
    const s = get();
    switch (ev.type) {
      case "rows":
        s.upsertRows(ev.botId, ev.generation, ev.rows, ev.replace);
        return;
      case "cleared":
        set((st) => ({
          transcripts: {
            ...st.transcripts,
            [ev.botId]: { generation: ev.generation, bySeq: {}, loaded: true },
          },
        }));
        return;
      case "live":
        set((st) => ({ live: { ...st.live, [ev.state.botId]: ev.state } }));
        return;
      case "roster":
        s.loadBots().catch(console.error);
        return;
      case "bot": {
        const exists = s.bots.some((b) => b.id === ev.bot.id);
        if (
          ev.bot.id === s.selectedBotId &&
          ev.bot.unread > 0 &&
          document.visibilityState === "visible"
        )
          api.markRead(ev.bot.id).catch(() => {});
        set((st) => ({
          bots: exists
            ? st.bots.map((b) => (b.id === ev.bot.id ? ev.bot : b))
            : [...st.bots, ev.bot],
        }));
        return;
      }
      case "tasks":
        s.bump("tasks");
        s.bump(`tasks:${ev.botId}`);
        return;
      case "connections":
        set((st) => ({ connectionsVersion: st.connectionsVersion + 1 }));
        return;
      default:
        return;
    }
  },

  bump(key) {
    set((s) => ({ versions: { ...s.versions, [key]: (s.versions[key] ?? 0) + 1 } }));
  },

  setDetailsOpen(open) {
    lsSet(DETAILS, open ? "1" : "0");
    set({ detailsOpen: open });
  },

  setModal(modal) {
    set({ modal });
  },
}));

export function sortedRows(t: Transcript | undefined): Row[] {
  if (!t) return [];
  return Object.values(t.bySeq).sort((a, b) => a.seq - b.seq);
}

export const displayName = (b: Pick<Bot, "name" | "label">) =>
  b.label ? `${b.name} · ${b.label}` : b.name;

export const useVersion = (key: string) => useStore((s) => s.versions[key] ?? 0);

export const useBot = (id: string | null | undefined) =>
  useStore((s) => s.bots.find((b) => b.id === id));

export const primaryBot = (bots: Bot[]) => bots.find((b) => b.isPrimary) ?? bots[0];
