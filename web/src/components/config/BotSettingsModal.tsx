import { useCallback, useEffect, useState } from 'react';
import type { AvatarColor, AvatarShape, Bot, Skill } from '@shared/types';
import { BotAvatar, BotAvatarFor, PICKER_SHAPES } from '../../avatar/BotAvatar';
import { COLOR_ORDER, botVars, palette } from '../../lib/colors';
import { configApi, type BotSettingsBundle } from '../../lib/configApi';
import { useConfigUI, useVersion, type BotSettingsTab } from '../../configStore';
import { useStore } from '../../store';
import { Icon } from '../Icon';
import { Modal } from '../modals/Modal';
import { Glyph } from './glyphs';
import { ConfirmButton, Field, Segmented } from './ui';

export function BotSettingsModal() {
  const target = useConfigUI((s) => s.botSettings);
  const close = useConfigUI((s) => s.closeBotSettings);
  const setTab = (tab: BotSettingsTab) => target && useConfigUI.setState({ botSettings: { ...target, tab } });
  const bot = useStore((s) => s.bots.find((b) => b.id === target?.botId));
  const memVersion = useVersion(`memories:${target?.botId ?? ''}`);
  const [data, setData] = useState<BotSettingsBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const onClose = useCallback(() => close(), [close]);

  const reload = useCallback(() => {
    if (!target) return;
    configApi.settings(target.botId).then((d) => { setData(d); setLoadError(null); }).catch((e) => setLoadError(e.message));
  }, [target?.botId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload, memVersion]);
  useEffect(() => { if (target) useStore.getState().loadRoutines(target.botId).catch(() => {}); }, [target?.botId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (target && !bot && useStore.getState().bots.length) close(); }, [bot, target, close]);
  if (!target || !bot) return null;

  const tabs: { id: BotSettingsTab; label: string; count?: number }[] = [
    { id: 'general', label: 'General' },
    { id: 'skills', label: 'Skills', count: data?.skills.length },
  ];

  return (
    <Modal onClose={onClose} className="bot-settings" label={`${bot.name} settings`}>
      <div className="modal__header">
        <div className="bot-settings__title">
          <BotAvatarFor bot={bot} size={24} />
          <span className="modal__title">{bot.name}</span>
        </div>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close"><Icon name="close" size={14} opacity={0.68} /></button>
      </div>
      <div className="bot-settings__body" style={botVars(bot.avatarColor)}>
        <nav className="cfg-nav" aria-label="Bot settings sections">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={`cfg-nav__item${target.tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)} aria-current={target.tab === t.id || undefined}>
              <span>{t.label}</span>
              {t.count ? <span className="cfg-nav__count">{t.count}</span> : null}
            </button>
          ))}
        </nav>
        <div className="cfg-content">
          {loadError && <div className="cfg-error">Couldn’t load settings: {loadError}</div>}
          {target.tab === 'general' && <GeneralTab bot={bot} onClose={onClose} />}
          {target.tab === 'skills' && <SkillsTab bot={bot} skills={data?.skills} />}
        </div>
      </div>
    </Modal>
  );
}


type Draft = Pick<Bot, 'name' | 'label' | 'description' | 'instructions' | 'avatarShape' | 'avatarColor' | 'effort' | 'mode'>;
const draftOf = (b: Bot): Draft => ({ name: b.name, label: b.label, description: b.description, instructions: b.instructions, avatarShape: b.avatarShape, avatarColor: b.avatarColor, effort: b.effort, mode: b.mode });

function GeneralTab({ bot, onClose }: { bot: Bot; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(bot));
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  useEffect(() => { setDraft(draftOf(bot)); }, [bot.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const base = draftOf(bot);
  const changed = (Object.keys(draft) as (keyof Draft)[]).filter((k) => draft[k] !== base[k]);
  const dirty = changed.length > 0;
  const nameOk = draft.name.trim().length > 0;
  const put = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const flash = (text: string, tone: 'ok' | 'error' = 'ok') => { setNote({ text, tone }); setTimeout(() => setNote(null), 2400); };

  const save = async () => {
    if (!dirty || !nameOk) return;
    setSaving(true);
    try {
      const patch: Partial<Draft> = {};
      for (const k of changed) (patch as Record<string, unknown>)[k] = k === 'name' ? draft.name.trim() : draft[k];
      const { bot: next } = await configApi.updateBot(bot.id, patch);
      useStore.setState((s) => ({ bots: s.bots.map((b) => (b.id === next.id ? next : b)) }));
      flash('Saved');
    } catch (e) {
      flash((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cfg-page">
      <section className="cfg-section">
        <div className="cfg-look">
          <BotAvatar shape={draft.avatarShape} color={draft.avatarColor} size={72} />
          <div className="cfg-look__text">
            <div className="cfg-look__name">{draft.name || 'New Bot'}</div>
            <button type="button" className="cfg-btn cfg-btn--secondary" onClick={() => setPicker(!picker)} aria-expanded={picker}>
              {picker ? 'Done' : 'Change look'}
            </button>
          </div>
        </div>
        {picker && <LookPicker shape={draft.avatarShape} color={draft.avatarColor} onShape={(s) => put('avatarShape', s)} onColor={(c) => put('avatarColor', c)} />}
      </section>

      <section className="cfg-section cfg-grid">
        <Field label="Name" htmlFor="cfg-name">
          <input id="cfg-name" className="text-input" value={draft.name} maxLength={60} onChange={(e) => put('name', e.target.value)} aria-invalid={!nameOk} />
        </Field>
        <Field label="Label" htmlFor="cfg-label" hint="Shown next to the name, like “Research” or “Inbox”.">
          <input id="cfg-label" className="text-input" value={draft.label} maxLength={60} placeholder="Add a label" onChange={(e) => put('label', e.target.value)} />
        </Field>
      </section>

      <section className="cfg-section">
        <Field label="About" htmlFor="cfg-about">
          <textarea id="cfg-about" className="text-input cfg-textarea" rows={2} value={draft.description} maxLength={500} placeholder="What is this Bot for?" onChange={(e) => put('description', e.target.value)} />
        </Field>
        <Field label="Instructions" htmlFor="cfg-instructions" hint={`Standing guidance ${draft.name || 'this Bot'} always follows, like tone, priorities or things to avoid.`}>
          <textarea id="cfg-instructions" className="text-input cfg-textarea cfg-textarea--tall" rows={7} value={draft.instructions} maxLength={8000} placeholder="e.g. Keep updates to three bullets. Never email anyone outside the team without asking." onChange={(e) => put('instructions', e.target.value)} />
        </Field>
        <Field label="Used as">
          <Segmented label="Bot type" value={draft.mode} options={[{ value: 'personal', label: 'Personal assistant' }, { value: 'teammate', label: 'Teammate' }]} onChange={(v) => put('mode', v)} />
        </Field>
      </section>

      <div className={`cfg-savebar${dirty ? ' is-dirty' : ''}`}>
        <span className={`cfg-savebar__note${note?.tone === 'error' ? ' is-error' : ''}`} role="status">{note?.text ?? (dirty ? 'Unsaved changes' : '')}</span>
        <button type="button" className="cfg-btn cfg-btn--secondary" disabled={!dirty || saving} onClick={() => setDraft(draftOf(bot))}>Discard</button>
        <button type="button" className="cfg-btn cfg-btn--primary" disabled={!dirty || saving || !nameOk} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>

      <section className="cfg-section">
        <div className="cfg-section__label">Conversation</div>
        <div className="cfg-card">
          <div className="cfg-row">
            <div className="cfg-row__text">
              <div className="cfg-row__title">New conversation</div>
              <div className="cfg-row__sub">Clears the chat. Memories, skills and routines stay.</div>
            </div>
            <ConfirmButton className="cfg-btn cfg-btn--secondary" confirmLabel="Start fresh" onConfirm={async () => { await configApi.fresh(bot.id); flash('Started a new conversation'); }}>
              Start new
            </ConfirmButton>
          </div>
          {!bot.isPrimary && (
            <div className="cfg-row">
              <div className="cfg-row__text">
                <div className="cfg-row__title">Make primary</div>
                <div className="cfg-row__sub">Your go-to Bot. It reaches out first and keeps the others on track.</div>
              </div>
              <button type="button" className="cfg-btn cfg-btn--secondary" onClick={() => configApi.makePrimary(bot.id).then(() => flash(`${bot.name} is now your primary Bot`)).catch((e) => flash(e.message, 'error'))}>Make primary</button>
            </div>
          )}
        </div>
      </section>

      <section className="cfg-section">
        <div className="cfg-section__label">Danger zone</div>
        <div className="cfg-card">
          <div className="cfg-row">
            <div className="cfg-row__text">
              <div className="cfg-row__title">Delete {bot.name}</div>
              <div className="cfg-row__sub">{bot.isPrimary ? 'Make another Bot primary first.' : 'Removes its chat, memories, skills and routines for good.'}</div>
            </div>
            <ConfirmButton
              disabled={bot.isPrimary}
              confirmLabel={`Delete ${bot.name}`}
              onConfirm={async () => {
                try {
                  await configApi.deleteBot(bot.id);
                  onClose();
                  const st = useStore.getState();
                  st.set({ bots: st.bots.filter((b) => b.id !== bot.id) });
                  st.loadBots().catch(() => {});
                } catch (e) { flash((e as Error).message, 'error'); }
              }}
            >
              Delete…
            </ConfirmButton>
          </div>
        </div>
      </section>
    </div>
  );
}

const SHAPE_ROWS = [PICKER_SHAPES.slice(0, 7), PICKER_SHAPES.slice(7)];

function LookPicker({ shape, color, onShape, onColor }: { shape: AvatarShape; color: AvatarColor; onShape: (s: AvatarShape) => void; onColor: (c: AvatarColor) => void }) {
  return (
    <div className="cfg-picker">
      <div className="shape-grid" role="radiogroup" aria-label="Character shape">
        {SHAPE_ROWS.map((row, i) => (
          <div key={i} className="shape-grid__row">
            {row.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={shape === s} aria-label={s} className="shape-cell" onClick={() => onShape(s)}>
                <BotAvatar shape={s} color={color} size={34} ring={shape === s} />
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="swatches" role="radiogroup" aria-label="Character color">
        <div className="swatches__row">
          {COLOR_ORDER.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className="swatch-cell" onClick={() => onColor(c)}>
              <span className={`swatch${color === c ? ' is-selected' : ''}`} style={{ background: palette(c).fill }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


function SkillsTab({ bot, skills }: { bot: Bot; skills: Skill[] | undefined }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="cfg-page">
      <div className="cfg-page__head">
        <div>
          <div className="cfg-page__title">Skills</div>
          <div className="cfg-page__sub">How-tos {bot.name} reads when a job calls for one. They are files in the Talk repo (.agents/skills), so they are edited there.</div>
        </div>
      </div>
      {!skills ? <div className="cfg-empty">Loading…</div> : skills.length === 0 ? <div className="cfg-empty">No skills yet.</div> : (
        <div className="cfg-list">
          {skills.map((s) => (
            <div key={s.id}>
              <button type="button" className="cfg-item" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span className="cfg-item__icon"><Glyph name="spark" size={14} /></span>
                <div className="cfg-item__text">
                  <div className="cfg-item__title">{s.name}</div>
                  <div className="cfg-item__sub">{s.description || s.body.split('\n')[0]}</div>
                </div>
              </button>
              {open === s.id && <pre className="cfg-skill-body">{s.body}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
