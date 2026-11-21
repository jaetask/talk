import { useCallback, useEffect, useState } from 'react';
import { dividerLabel } from '../../lib/time';
import { useSelectedBot, useStore } from '../../store';
import { Icon } from '../Icon';
import { Modal } from './Modal';

interface Conversation { id: string; first: string; at: number; turns: number; current: boolean }

export function HistoryModal() {
  const bot = useSelectedBot();
  const setModal = useStore((s) => s.setModal);
  const close = useCallback(() => setModal(null), [setModal]);
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bot) return;
    let alive = true;
    fetch(`/api/v2/bots/${bot.id}/conversations`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { conversations: Conversation[] }) => { if (alive) setList(d.conversations); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [bot?.id]);

  if (!bot) return null;
  const open = async (c: Conversation) => {
    if (!c.current) {
      const res = await fetch(`/api/v2/bots/${bot.id}/conversations/${encodeURIComponent(c.id)}`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { setError('Couldn’t open that conversation.'); return; }
    }
    close();
  };

  return (
    <Modal onClose={close} className="search-modal" label={`${bot.name}'s conversations`}>
      <div className="search-modal__field">
        <span className="search-modal__icon"><Icon name="clock" size={18} opacity={0.56} /></span>
        <input value={`${bot.name}'s conversations`} readOnly aria-label="Conversations" />
      </div>
      <div className="search-modal__results" role="listbox">
        {error ? <div className="search-modal__empty">{error}</div> : list === null ? <div className="search-modal__empty">Loading…</div> : list.length === 0 ? <div className="search-modal__empty">No conversations yet.</div> : list.map((c) => (
          <button key={c.id} type="button" role="option" aria-selected={c.current} className={`search-row${c.current ? ' is-active' : ''}`} onClick={() => open(c)}>
            <span className="search-row__text">
              <span className="search-row__name">{c.first || 'Untitled'}</span>
              <span className="search-row__sub">{dividerLabel(c.at)} · {c.turns} {c.turns === 1 ? 'turn' : 'turns'}{c.current ? ' · on screen now' : ''}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
