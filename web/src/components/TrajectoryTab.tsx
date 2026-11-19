import { useEffect, useState } from 'react';
import type { Bot } from '@shared/types';
import { clock } from '../lib/time';
import { useStore } from '../store';

interface Stage { kind: 'hearing' | 'model' | 'lookup' | 'change' | 'speaking'; label: string; start: number; seconds: number; outcome: string }
interface TurnTrace {
  id: number; at: string; said: string; source: string; stop: string; error: string | null; model: string | null; total: number; firstToken: number | null;
  tokensIn: number; tokensOut: number; cost: number | null; stages: Stage[];
}

const secs = (n: number) => (n >= 10 ? `${n.toFixed(0)}s` : `${n.toFixed(n < 1 ? 2 : 1)}s`);
const STOP: Record<string, string> = { asked: 'waiting on you', working: 'handed to a long job', failed: 'failed', aborted: 'interrupted' };

/** The Trajectory: each turn as the stages the engine went through, with how long each took. Drawn from the durable transcript. */
export function TrajectoryTab({ bot }: { bot: Bot }) {
  const [turns, setTurns] = useState<TurnTrace[] | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  // Refetch when the bot's conversation moves on (a turn ends, or a new conversation starts).
  const stamp = useStore((s) => { const b = s.bots.find((x) => x.id === bot.id); return `${b?.generation}:${b?.lastActivityAt}`; });
  useEffect(() => {
    let alive = true;
    fetch(`/api/v2/bots/${bot.id}/trajectory`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { turns: TurnTrace[] }) => { if (alive) setTurns(d.turns); })
      .catch(() => { if (alive) setTurns([]); });
    return () => { alive = false; };
  }, [bot.id, stamp]);

  const act = async (t: TurnTrace, what: 'case' | 'redact') => {
    if (what === 'redact' && confirming !== t.id) { setConfirming(t.id); return; }
    setConfirming(null);
    try {
      const res = await fetch(`/api/v2/bots/${bot.id}/turns/${t.id}/${what}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(what === 'case' ? { kind: t.stop === 'failed' || t.error ? 'regression' : 'golden' } : {}) });
      const d = (await res.json()) as { saved?: string | null; error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setNote({ id: t.id, text: what === 'case' ? `Saved as ${d.saved ?? 'a draft'}. Run the Dojo with --update, then commit.` : 'Cleared from view.' });
      if (what === 'redact') setTurns((cur) => cur?.filter((x) => x.id !== t.id) ?? cur);
    } catch (e) { setNote({ id: t.id, text: (e as Error).message }); }
  };

  if (turns === null) return <div className="panel-empty">Loading…</div>;
  if (!turns.length) return <div className="details__sections"><div className="panel-card"><div className="panel-empty">Nothing yet. Each turn shows up here as the steps the engine took: model steps, lookups, changes, and how long each one ran.</div></div></div>;
  return (
    <div className="details__sections trajectory">
      {[...turns].reverse().map((t) => {
        const span = Math.max(t.total, ...t.stages.map((s) => s.start + s.seconds), 0.01);
        return (
          <section key={t.id} className="panel-card trajectory__turn">
            <div className="trajectory__head">
              <span className="trajectory__said" title={t.said}>{t.said || 'Reported back'}</span>
              <span className="trajectory__when">{clock(Date.parse(t.at))}</span>
            </div>
            <div className="trajectory__strip" aria-hidden>
              {t.stages.map((s, i) => (
                <span key={i} className={`trajectory__bar is-${s.kind}`} style={{ left: `${(s.start / span) * 100}%`, width: `${Math.max(1.5, (s.seconds / span) * 100)}%` }} />
              ))}
            </div>
            <ul className="trajectory__stages">
              {t.stages.map((s, i) => (
                <li key={i} className={`trajectory__stage is-${s.kind}`}>
                  <span className="trajectory__dot" />
                  <span className="trajectory__label" title={s.label}>{s.kind === 'model' ? 'Model step' : s.kind === 'hearing' ? 'Hearing' : s.kind === 'speaking' ? 'Speaking' : s.label}</span>
                  {s.outcome && <span className="trajectory__outcome">{s.outcome}</span>}
                  <span className="trajectory__secs">{secs(s.seconds)}</span>
                </li>
              ))}
            </ul>
            <div className="trajectory__foot">
              {secs(t.total)} in all{t.firstToken !== null ? ` · first word ${secs(t.firstToken)}` : ''}{t.tokensIn || t.tokensOut ? ` · ${t.tokensIn.toLocaleString()} in, ${t.tokensOut.toLocaleString()} out` : ''}
              {t.model ? ` · ${t.model}` : ''}{STOP[t.stop] ? ` · ${STOP[t.stop]}` : ''}
            </div>
            <div className="trajectory__actions">
              <button type="button" className="link-btn link-btn--small" onClick={() => act(t, 'case')} title="Save this turn, and the conversation up to it, as a Dojo case">Make test</button>
              <button type="button" className="link-btn link-btn--small" onClick={() => act(t, 'redact')} onMouseLeave={() => confirming === t.id && setConfirming(null)} title="Hide this turn from the chat, exports and tests">{confirming === t.id ? 'Clear it?' : 'Clear'}</button>
              {note?.id === t.id && <span className="trajectory__note">{note.text}</span>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
