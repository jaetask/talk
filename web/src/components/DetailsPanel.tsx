import { useEffect, useState } from 'react';
import type { Toolkit } from '@shared/types';
import { BotAvatarFor } from '../avatar/BotAvatar';
import { api } from '../lib/api';
import { botVars } from '../lib/colors';
import { displayName, useSelectedBot, useStore } from '../store';
import { Icon } from './Icon';
import { ToolkitLogo } from './ToolkitLogo';
import { VoiceSettings } from './VoiceSettings';
import { MembersCard } from './MembersCard';
import { TrajectoryTab } from './TrajectoryTab';
import { useConfigUI } from '../configStore';
import { Glyph } from './config/glyphs';
import { LibraryTab } from './config/LibraryTab';
import { BotTasks } from './config/TasksView';

function AppsCard() {
  const version = useStore((s) => s.connectionsVersion);
  const setModal = useStore((s) => s.setModal);
  const [apps, setApps] = useState<Toolkit[] | null>(null);
  useEffect(() => { api.apps().then((r) => setApps(r.apps)).catch(() => setApps([])); }, [version]);
  return (
    <div className="panel-card">
      {apps === null ? <div className="panel-empty">Checking…</div> : apps.length === 0 ? <div className="panel-empty">No apps are set up.</div> : apps.map((a) => (
        <button key={a.slug} type="button" className="panel-row panel-row--link" onClick={() => setModal('apps')} title={a.description}>
          <span className="panel-row__glyph"><ToolkitLogo name={a.name} size={16} radius={4} /></span>
          <span className="panel-row__title" style={{ flex: 1 }}>{a.name}</span>
          <span className="panel-row__meta">{a.connected ? 'Online' : 'Offline'}</span>
        </button>
      ))}
    </div>
  );
}

export function DetailsPanel() {
  const bot = useSelectedBot();
  const set = useStore((s) => s.set);
  const [tab, setTab] = useState<'activity' | 'trajectory' | 'tasks' | 'library'>('activity');
  if (!bot) return null;

  return (
    <aside className="details" style={botVars(bot.avatarColor)} aria-label="Conversation details">
      <div className="details__top">
        <button type="button" className="icon-btn icon-btn--bordered details__gear" onClick={() => useConfigUI.getState().openBotSettings(bot.id)} aria-label="Bot settings" title="Bot settings">
          <Glyph name="gear" size={16} opacity={0.7} />
        </button>
        <button type="button" className="icon-btn icon-btn--bordered" onClick={() => set({ detailsOpen: false })} aria-label="Close details">
          <Icon name="close" opacity={0.92} />
        </button>
      </div>
      <div className="details__scroll">
        <div className="details__identity">
          <BotAvatarFor bot={bot} size={64} />
          <div className="details__name" title={displayName(bot)}>{displayName(bot)}</div>
        </div>
        <div className="details__tabs">
          <div className="segmented">
            <button type="button" className={tab === 'activity' ? 'is-active' : ''} onClick={() => setTab('activity')}>Activity</button>
            <button type="button" className={tab === 'trajectory' ? 'is-active' : ''} onClick={() => setTab('trajectory')}>Trajectory</button>
            <button type="button" className={tab === 'tasks' ? 'is-active' : ''} onClick={() => setTab('tasks')}>Tasks</button>
            <button type="button" className={tab === 'library' ? 'is-active' : ''} onClick={() => setTab('library')}>Library</button>
          </div>
        </div>
        {tab === 'activity' ? (
          <div className="details__sections">
            {bot.kind === 'room' && (
              <section>
                <div className="section-label">Members</div>
                <MembersCard room={bot} />
              </section>
            )}
            {bot.kind !== 'room' && (
              <>
                <section>
                  <div className="section-label">Apps</div>
                  <AppsCard />
                </section>
                <section>
                  <div className="section-label">Voice chat</div>
                  <VoiceSettings bot={bot} />
                </section>
              </>
            )}
          </div>
        ) : tab === 'trajectory' ? <TrajectoryTab bot={bot} /> : tab === 'tasks' ? <BotTasks bot={bot} /> : <LibraryTab bot={bot} />}
      </div>
    </aside>
  );
}
