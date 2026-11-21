import { IconAction, ListCard, ListRow, PageLink } from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@jaetask/toolkit/ui/tabs";
import {
  IconPhoneOff,
  IconPlayerPlay,
  IconSettings,
  IconWaveSine,
  IconX,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BotAvatarFor } from "../avatar/BotAvatar";
import { IconButton } from "../icons";
import { api } from "../lib/api";
import { TaskRow, sortTasks, useTasks } from "../pages/Tasks";
import { botPath } from "../router";
import { useStore } from "../store";
import type { Bot, Toolkit } from "../types";
import { voiceApi, type VoiceOptions } from "../voice/api";
import { endCall, isCallActive, previewVoice, startCall, useVoice } from "../voice/call";

export const speedLabel = (s: number) => `${Number(s.toFixed(2))}x`;

export function useVoiceOptions(): VoiceOptions | null {
  const [opts, setOpts] = useState<VoiceOptions | null>(null);
  useEffect(() => {
    voiceApi
      .options()
      .then(setOpts)
      .catch(() => setOpts(null));
  }, []);
  return opts;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="details-section">
      <div className="details-section-head">
        <h3 className="tk-kicker">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Apps() {
  const version = useStore((s) => s.connectionsVersion);
  const [apps, setApps] = useState<Toolkit[] | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a connections event bumps the version
  useEffect(() => {
    api
      .apps()
      .then((r) => setApps(r.apps))
      .catch(() => setApps([]));
  }, [version]);
  if (apps === null) return <p className="quiet">Checking…</p>;
  if (!apps.length) return <p className="quiet">No apps are set up. Add them to apps.json.</p>;
  return (
    <ListCard as="ul">
      {apps.map((a) => (
        <ListRow
          key={a.slug}
          aside={<span className="quiet">{a.connected ? "Online" : "Offline"}</span>}
        >
          <span title={a.description}>{a.name}</span>
        </ListRow>
      ))}
    </ListCard>
  );
}

function Voice({ bot }: { bot: Bot }) {
  const opts = useVoiceOptions();
  const [previewing, setPreviewing] = useState(false);
  const inCall = useVoice((s) => isCallActive(s) && s.botId === bot.id);
  const voiceName = opts?.voices.find((v) => v.id === bot.voice)?.name ?? bot.voice;
  const language =
    opts?.languages.find((l) => l.code === bot.voiceLanguage)?.name ?? bot.voiceLanguage;
  const preview = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      await previewVoice({
        botId: bot.id,
        voice: bot.voice,
        speed: bot.voiceSpeed,
        language: bot.voiceLanguage,
      });
    } catch (e) {
      toast.error((e as Error).message || "The preview is not available.");
    } finally {
      setPreviewing(false);
    }
  };
  return (
    <div className="details-card">
      <dl className="details-facts">
        <div>
          <dt>Voice</dt>
          <dd>
            {voiceName}
            <IconButton label={`Hear ${bot.name}'s voice`} disabled={previewing} onClick={preview}>
              <IconPlayerPlay size={16} />
            </IconButton>
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{speedLabel(bot.voiceSpeed)}</dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{language}</dd>
        </div>
      </dl>
      <Button
        variant={inCall ? "destructive" : "outline"}
        size="sm"
        className="details-call"
        onClick={() => (inCall ? endCall() : startCall(bot.id))}
      >
        {inCall ? <IconPhoneOff size={16} /> : <IconWaveSine size={16} />}
        {inCall ? "End voice chat" : "Start voice chat"}
      </Button>
    </div>
  );
}

function BotTasks({ bot }: { bot: Bot }) {
  const tasks = useTasks(bot.id);
  const sorted = useMemo(() => sortTasks(tasks ?? []), [tasks]);
  if (tasks === null) return <p className="quiet">Loading…</p>;
  if (!sorted.length)
    return (
      <p className="quiet">No tasks. A long job, or a change waiting for your yes, shows here.</p>
    );
  return (
    <ListCard as="ul">
      {sorted.map((t) => (
        <TaskRow key={t.id} t={t} bot={bot} showBot={false} />
      ))}
    </ListCard>
  );
}

export function DetailsPanel({ bot }: { bot: Bot }) {
  const setDetailsOpen = useStore((s) => s.setDetailsOpen);
  return (
    <aside className="details" aria-label="Bot details">
      <div className="details-top">
        <IconButton label="Hide details" onClick={() => setDetailsOpen(false)}>
          <IconX size={18} />
        </IconButton>
      </div>
      <div className="details-identity">
        <BotAvatarFor bot={bot} size={64} star={bot.isPrimary} />
        <div className="details-name">{bot.name}</div>
        {bot.label && <div className="quiet">{bot.label}</div>}
      </div>
      <Tabs defaultValue="activity" className="details-tabs">
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>
        <TabsContent value="activity">
          <Section title="Apps">
            <Apps />
          </Section>
          <Section
            title="Voice chat"
            action={
              <IconAction
                label="Change the voice"
                icon={<IconSettings />}
                href={`${botPath(bot.id)}/settings`}
              />
            }
          >
            <Voice bot={bot} />
          </Section>
        </TabsContent>
        <TabsContent value="tasks">
          <Section title="Tasks" action={<PageLink to="/tasks">See all</PageLink>}>
            <BotTasks bot={bot} />
          </Section>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
