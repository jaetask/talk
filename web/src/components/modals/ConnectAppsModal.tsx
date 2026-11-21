import { useCallback, useEffect, useState } from 'react';
import type { Toolkit } from '@shared/types';
import { api } from '../../lib/api';
import { useStore } from '../../store';
import { Icon } from '../Icon';
import { ToolkitLogo } from '../ToolkitLogo';
import { Modal } from './Modal';

export function ConnectAppsModal() {
  const setModal = useStore((s) => s.setModal);
  const version = useStore((s) => s.connectionsVersion);
  const close = useCallback(() => setModal(null), [setModal]);
  const [apps, setApps] = useState<Toolkit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    api.apps().then((d) => { if (alive) setApps(d.apps); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [version]);

  const q = search.trim().toLowerCase();
  const shown = (apps ?? []).filter((a) => !q || `${a.name} ${a.description ?? ''}`.toLowerCase().includes(q));
  const online = (apps ?? []).filter((a) => a.connected).length;

  return (
    <Modal onClose={close} className="apps-modal" label="Apps">
      <button type="button" className="modal__close apps-modal__close" onClick={close} aria-label="Close"><Icon name="close" size={16} opacity={0.68} /></button>
      <div className="apps-modal__head">
        <div className="apps-modal__titlerow">
          <span className="apps-modal__title">Apps</span>
          <span className="apps-modal__connected is-static"><span>{online} online</span></span>
        </div>
        <div className="apps-modal__controls">
          <div className="apps-modal__searchrow">
            <label className="pill-input">
              <Icon name="search" size={14} opacity={0.56} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search apps" aria-label="Search apps" />
            </label>
          </div>
        </div>
      </div>
      <div className="apps-modal__body">
        {error ? <div className="apps-empty">Couldn’t load apps. {error}</div> : apps === null ? <div className="apps-empty">Loading apps…</div> : shown.length === 0 ? <div className="apps-empty">No apps match “{search}”.</div> : (
          <section className="apps-section">
            <div className="apps-grid">
              {shown.map((app) => (
                <div key={app.slug} className="app-row" title={app.description}>
                  <ToolkitLogo name={app.name} logo={app.logo} />
                  <span className="app-row__text">
                    <span className="app-row__name">{app.name}</span>
                    {app.description && <span className="app-row__desc">{app.description}</span>}
                  </span>
                  <span className="app-row__connected is-static">
                    {app.connected ? <><Icon name="check" size={12} opacity={0.56} />Online</> : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
