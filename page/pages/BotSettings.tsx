import {
  ColourSwatches,
  EmptyLine,
  Field,
  FormDialog,
  InlineText,
  ListCard,
  PageSection,
  RowMenu,
  WorkPage,
} from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import { Input } from "@jaetask/toolkit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@jaetask/toolkit/ui/select";
import { Textarea } from "@jaetask/toolkit/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@jaetask/toolkit/ui/toggle-group";
import { IconPlayerPlay } from "@tabler/icons-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { BotHeader } from "../chat/BotHeader";
import { BotAvatar, PICKER_SHAPES } from "../avatar/BotAvatar";
import { speedLabel, useVoiceOptions } from "../chat/Details";
import { IconButton } from "../icons";
import { api, type BotPatch } from "../lib/api";
import { colorOfFill, palette, SWATCHES } from "../lib/colors";
import { botPath, go } from "../router";
import { useStore } from "../store";
import type { AvatarColor, AvatarShape, Bot, Skill } from "../types";
import { previewVoice } from "../voice/call";

const MODES = { personal: "Personal assistant", teammate: "Teammate" } as const;

async function save(bot: Bot, patch: BotPatch): Promise<boolean> {
  try {
    const { bot: next } = await api.updateBot(bot.id, patch);
    useStore.setState((s) => ({ bots: s.bots.map((b) => (b.id === next.id ? next : b)) }));
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}

function useSkills(botId: string): Skill[] | null {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  useEffect(() => {
    api
      .skills(botId)
      .then((r) => setSkills(r.skills))
      .catch(() => setSkills([]));
  }, [botId]);
  return skills;
}

export function ShapePicker({
  shape,
  color,
  onShape,
}: {
  shape: AvatarShape;
  color: AvatarColor;
  onShape: (s: AvatarShape) => void;
}) {
  return (
    <div className="shape-grid" role="radiogroup" aria-label="Shape">
      {PICKER_SHAPES.map((s) => (
        <Button
          key={s}
          variant="ghost"
          size="icon-lg"
          role="radio"
          aria-checked={shape === s}
          aria-label={s}
          className="shape-cell"
          onClick={() => onShape(s)}
        >
          <BotAvatar shape={s} color={color} size={30} ring={shape === s} />
        </Button>
      ))}
    </div>
  );
}

function SettingRow({
  label,
  children,
  menu,
}: {
  label: string;
  children: ReactNode;
  menu?: ReactNode;
}) {
  return (
    <li className="tk-list-row setting-row">
      <span className="setting-label">{label}</span>
      <span className="setting-value">{children}</span>
      {menu}
    </li>
  );
}

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => {
        const o = options.find((x) => String(x.value) === v);
        if (o) onChange(o.value);
      }}
    >
      <SelectTrigger aria-label={label} className="setting-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LookDialog({
  bot,
  open,
  onOpenChange,
}: {
  bot: Bot;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [shape, setShape] = useState(bot.avatarShape);
  const [color, setColor] = useState(bot.avatarColor);
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening starts from the bot as it is
  useEffect(() => {
    if (open) {
      setShape(bot.avatarShape);
      setColor(bot.avatarColor);
    }
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Look"
      onSave={() => save(bot, { avatarShape: shape, avatarColor: color })}
    >
      <div className="look-preview">
        <BotAvatar shape={shape} color={color} size={72} />
      </div>
      <Field label="Shape">
        <ShapePicker shape={shape} color={color} onShape={setShape} />
      </Field>
      <Field label="Colour" hint="Also the colour of your messages to it.">
        <ColourSwatches
          label="Colour"
          colours={SWATCHES}
          custom={false}
          value={palette(color).fill}
          onChange={(v) => setColor(colorOfFill(v))}
        />
      </Field>
    </FormDialog>
  );
}

function TextDialog({
  title,
  label,
  value,
  rows,
  maxLength,
  open,
  onOpenChange,
  onSave,
}: {
  title: string;
  label: string;
  value: string;
  rows: number;
  maxLength: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (v: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening starts from the saved text
  useEffect(() => {
    if (open) setText(value);
  }, [open]);
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      wide
      onSave={() => onSave(text)}
    >
      <Field label={label} htmlFor="bot-text">
        <Textarea
          id="bot-text"
          rows={rows}
          value={text}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

function DeleteDialog({
  bot,
  open,
  onOpenChange,
}: {
  bot: Bot;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const remove = async () => {
    if (typed.trim() !== bot.name) return false;
    try {
      await api.deleteBot(bot.id);
      toast(`${bot.name} is deleted.`);
      const st = useStore.getState();
      useStore.setState({ bots: st.bots.filter((b) => b.id !== bot.id) });
      st.loadBots().catch(() => {});
      go("/");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${bot.name}`}
      line="The bot and its chats go for good."
      saveLabel="Delete"
      onSave={remove}
    >
      <Field label="Type its name to delete it" htmlFor="delete-name">
        <Input id="delete-name" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function BotPage({ bot }: { bot: Bot }) {
  const opts = useVoiceOptions();
  const skills = useSkills(bot.id);
  const [dialog, setDialog] = useState<"look" | "about" | "instructions" | "delete" | null>(null);
  const openDialog = (d: typeof dialog) => () => setDialog(d);
  const close = (o: boolean) => !o && setDialog(null);
  const voices = opts?.voices ?? [];
  const voiceOptions = (
    voices.some((v) => v.id === bot.voice)
      ? voices
      : [{ id: bot.voice, name: bot.voice }, ...voices]
  ).map((v) => ({ value: v.id, label: v.name }));
  const speeds = opts?.speeds ?? [];
  const speedOptions = (
    speeds.includes(bot.voiceSpeed) ? speeds : [...speeds, bot.voiceSpeed].sort((a, b) => a - b)
  ).map((s) => ({ value: s, label: speedLabel(s) }));
  const languages = opts?.languages ?? [{ code: bot.voiceLanguage, name: bot.voiceLanguage }];
  return (
    <WorkPage
      title={bot.name}
      icon={
        <Button
          variant="ghost"
          aria-label={`Look of ${bot.name}`}
          className="look-button"
          onClick={openDialog("look")}
        >
          <BotAvatar
            shape={bot.avatarShape}
            color={bot.avatarColor}
            size={22}
            star={bot.isPrimary}
          />
        </Button>
      }
      help="A bot is a role, a voice and the apps it may use. Instructions apply from its next turn."
      action={
        <>
          <BotHeader bot={bot} page="settings" />
          <RowMenu
            label={`More for ${bot.name}`}
            items={[
              { label: "Change look", onSelect: openDialog("look") },
              {
                label: "New conversation",
                onSelect: () =>
                  api
                    .fresh(bot.id)
                    .then(() => go(botPath(bot.id)))
                    .catch((e) => toast.error((e as Error).message)),
              },
              {
                label: `Make ${bot.name} the main bot`,
                disabled: bot.isPrimary,
                onSelect: () =>
                  api
                    .makePrimary(bot.id)
                    .then(() => useStore.getState().loadBots())
                    .catch((e) => toast.error((e as Error).message)),
              },
              "line",
              {
                label: bot.isPrimary ? "Delete: make another bot the main one first" : "Delete…",
                disabled: bot.isPrimary,
                onSelect: openDialog("delete"),
              },
            ]}
          />
        </>
      }
    >
      <PageSection title="About">
        <ListCard>
          <SettingRow label="Name">
            <InlineText value={bot.name} label="Name" onSave={(name) => void save(bot, { name })} />
          </SettingRow>
          <SettingRow label="Label">
            <InlineText
              value={bot.label || "None"}
              label="Label"
              onSave={(label) => void save(bot, { label: label === "None" ? "" : label })}
            />
          </SettingRow>
          <SettingRow
            label="About"
            menu={
              <RowMenu
                label="About"
                quiet
                items={[{ label: "Edit", onSelect: openDialog("about") }]}
              />
            }
          >
            <span className="setting-text">{bot.description || "Nothing yet"}</span>
          </SettingRow>
          <SettingRow label="Used as">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={bot.mode}
              onValueChange={(v) => v && void save(bot, { mode: v as Bot["mode"] })}
              aria-label="Used as"
            >
              <ToggleGroupItem value="personal">{MODES.personal}</ToggleGroupItem>
              <ToggleGroupItem value="teammate">{MODES.teammate}</ToggleGroupItem>
            </ToggleGroup>
          </SettingRow>
        </ListCard>
      </PageSection>
      <PageSection title="Instructions">
        <ListCard>
          <SettingRow
            label="Instructions"
            menu={
              <RowMenu
                label="Instructions"
                quiet
                items={[{ label: "Edit", onSelect: openDialog("instructions") }]}
              />
            }
          >
            <span className="setting-text">
              {bot.instructions || "None. Its role comes from its personality file."}
            </span>
          </SettingRow>
        </ListCard>
      </PageSection>
      <PageSection title="Voice">
        <ListCard>
          <SettingRow label="Voice">
            <Choice
              label="Voice"
              value={bot.voice}
              options={voiceOptions}
              onChange={(voice) => void save(bot, { voice })}
            />
            <IconButton
              label={`Hear ${bot.name}'s voice`}
              onClick={() =>
                void previewVoice({
                  botId: bot.id,
                  voice: bot.voice,
                  speed: bot.voiceSpeed,
                  language: bot.voiceLanguage,
                }).catch((e) =>
                  toast.error((e as Error).message || "The preview is not available."),
                )
              }
            >
              <IconPlayerPlay size={16} />
            </IconButton>
          </SettingRow>
          <SettingRow label="Speed">
            <Choice
              label="Speed"
              value={bot.voiceSpeed}
              options={speedOptions}
              onChange={(voiceSpeed) => void save(bot, { voiceSpeed })}
            />
          </SettingRow>
          <SettingRow label="Language">
            <Choice
              label="Language"
              value={bot.voiceLanguage}
              options={languages.map((l) => ({ value: l.code, label: l.name }))}
              onChange={(voiceLanguage) => void save(bot, { voiceLanguage })}
            />
          </SettingRow>
        </ListCard>
      </PageSection>
      <PageSection title="Skills" count={skills?.length}>
        {skills === null ? (
          <EmptyLine>Loading…</EmptyLine>
        ) : skills.length === 0 ? (
          <EmptyLine>No skills. Add a file to the skills folder.</EmptyLine>
        ) : (
          <ListCard>
            {skills.map((s) => (
              <li key={s.id} className="tk-list-row">
                <span className="task-text">
                  <span className="task-title">{s.name}</span>
                  <span className="task-note">{s.description || s.body.split("\n")[0]}</span>
                </span>
              </li>
            ))}
          </ListCard>
        )}
      </PageSection>
      <LookDialog bot={bot} open={dialog === "look"} onOpenChange={close} />
      <TextDialog
        title="About"
        label="What this bot is for"
        value={bot.description}
        rows={3}
        maxLength={500}
        open={dialog === "about"}
        onOpenChange={close}
        onSave={(description) => save(bot, { description })}
      />
      <TextDialog
        title="Instructions"
        label="Tone, priorities, things to avoid"
        value={bot.instructions}
        rows={10}
        maxLength={8000}
        open={dialog === "instructions"}
        onOpenChange={close}
        onSave={(instructions) => save(bot, { instructions })}
      />
      <DeleteDialog bot={bot} open={dialog === "delete"} onOpenChange={close} />
    </WorkPage>
  );
}
