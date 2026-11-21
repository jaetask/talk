import {
  ColourSwatches,
  EditFrame,
  EditLink,
  Facts,
  ListCard,
  ListRow,
  PageBody,
  Panel,
  Row,
  useBackTo,
} from "@jaetask/toolkit/suite";
import { Button } from "@jaetask/toolkit/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@jaetask/toolkit/ui/dialog";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotAvatar, PICKER_SHAPES } from "../avatar/BotAvatar";
import { speedLabel, useVoiceOptions } from "../chat/Details";
import { api, type BotPatch } from "../lib/api";
import { colorOfFill, palette, SWATCHES } from "../lib/colors";
import { botPath, go } from "../router";
import { useStore } from "../store";
import type { AvatarColor, AvatarShape, Bot, Skill } from "../types";

const MODES = { personal: "Personal assistant", teammate: "Teammate" } as const;

const settingsPath = (bot: Bot) => `${botPath(bot.id)}/settings`;

function replaceBot(next: Bot) {
  useStore.setState((s) => ({ bots: s.bots.map((b) => (b.id === next.id ? next : b)) }));
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

function DeleteBot({ bot }: { bot: Bot }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const remove = async () => {
    try {
      await api.deleteBot(bot.id);
      setOpen(false);
      toast(`${bot.name} is deleted.`);
      const st = useStore.getState();
      useStore.setState({ bots: st.bots.filter((b) => b.id !== bot.id) });
      st.loadBots().catch(() => {});
      go("/");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      <Button
        variant="outline-destructive"
        size="sm"
        disabled={bot.isPrimary}
        onClick={() => setOpen(true)}
      >
        Delete {bot.name}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {bot.name}?</DialogTitle>
            <DialogDescription>
              Its chats go for good. Type its name to delete it.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="The bot's name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={typed.trim() !== bot.name} onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BotPage({ bot }: { bot: Bot }) {
  const opts = useVoiceOptions();
  const skills = useSkills(bot.id);
  const base = settingsPath(bot);
  return (
    <PageBody title={bot.name} line={bot.label || "A bot, its voice and the apps it may use."}>
      <Panel
        id="look"
        title="Look"
        line="Its shape and colour, wherever it is shown."
        action={<EditLink to={`${base}/look`} />}
      >
        <div className="look-preview">
          <BotAvatar
            shape={bot.avatarShape}
            color={bot.avatarColor}
            size={72}
            star={bot.isPrimary}
          />
        </div>
      </Panel>
      <Panel
        id="about"
        title="About"
        line="Its name, label and what it is for."
        action={<EditLink to={`${base}/about`} />}
      >
        <Facts
          items={[
            { label: "Name", value: bot.name },
            { label: "Label", value: bot.label || "None" },
            { label: "About", value: bot.description || "Nothing yet" },
            { label: "Used as", value: MODES[bot.mode] },
          ]}
        />
      </Panel>
      <Panel
        id="instructions"
        title="Instructions"
        line={`Standing guidance ${bot.name} always follows.`}
        action={<EditLink to={`${base}/instructions`} />}
      >
        <p className="text">
          {bot.instructions || "None. Its role comes from its personality file."}
        </p>
      </Panel>
      <Panel
        id="voice"
        title="Voice"
        line="How it sounds on a voice call."
        action={<EditLink to={`${base}/voice`} />}
      >
        <Facts
          items={[
            {
              label: "Voice",
              value: opts?.voices.find((v) => v.id === bot.voice)?.name ?? bot.voice,
            },
            { label: "Speed", value: speedLabel(bot.voiceSpeed) },
            {
              label: "Language",
              value:
                opts?.languages.find((l) => l.code === bot.voiceLanguage)?.name ??
                bot.voiceLanguage,
            },
          ]}
        />
      </Panel>
      <Panel
        id="skills"
        title="Skills"
        line={`How-tos ${bot.name} reads when a job calls for one. They are files in the skills folder; edit them there.`}
      >
        {skills === null ? (
          <p className="quiet">Loading…</p>
        ) : skills.length === 0 ? (
          <p className="quiet">No skills. Add a file to the skills folder.</p>
        ) : (
          <ListCard as="ul">
            {skills.map((s) => (
              <ListRow key={s.id}>
                <span className="task-text">
                  <span className="task-title">{s.name}</span>
                  <span className="task-note">{s.description || s.body.split("\n")[0]}</span>
                </span>
              </ListRow>
            ))}
          </ListCard>
        )}
      </Panel>
      <Panel
        id="conversation"
        title="Conversation"
        line="A new conversation clears the chat. Earlier ones stay under Earlier conversations."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              api
                .fresh(bot.id)
                .then(() => go(botPath(bot.id)))
                .catch((e) => toast.error((e as Error).message))
            }
          >
            New conversation
          </Button>
        }
      >
        {!bot.isPrimary && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              api
                .makePrimary(bot.id)
                .then(() => useStore.getState().loadBots())
                .catch((e) => toast.error((e as Error).message))
            }
          >
            Make {bot.name} the main bot
          </Button>
        )}
      </Panel>
      <Panel
        id="delete"
        title="Delete"
        line={
          bot.isPrimary
            ? "Make another bot the main one first."
            : "Removes the bot and its chats for good."
        }
        action={<DeleteBot bot={bot} />}
      >
        {null}
      </Panel>
    </PageBody>
  );
}

function useSave(bot: Bot, backTo: string) {
  const [busy, setBusy] = useState(false);
  const save = async (patch: BotPatch) => {
    setBusy(true);
    try {
      const { bot: next } = await api.updateBot(bot.id, patch);
      replaceBot(next);
      go(backTo);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return { busy, save };
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

function LookEdit({ bot, backTo }: { bot: Bot; backTo: string }) {
  const [shape, setShape] = useState(bot.avatarShape);
  const [color, setColor] = useState(bot.avatarColor);
  const { busy, save } = useSave(bot, backTo);
  return (
    <EditFrame
      title="Look"
      line={`How ${bot.name} is drawn.`}
      backTo={backTo}
      busy={busy}
      onSave={() => save({ avatarShape: shape, avatarColor: color })}
    >
      <div className="look-preview">
        <BotAvatar shape={shape} color={color} size={72} />
      </div>
      <Row title="Shape" line="Its outline. The eyes come with every shape.">
        <ShapePicker shape={shape} color={color} onShape={setShape} />
      </Row>
      <Row title="Colour" line="Its fill, and the colour of your messages to it.">
        <ColourSwatches
          label="Colour"
          colours={SWATCHES}
          custom={false}
          value={palette(color).fill}
          onChange={(v) => setColor(colorOfFill(v))}
        />
      </Row>
    </EditFrame>
  );
}

function AboutEdit({ bot, backTo }: { bot: Bot; backTo: string }) {
  const [name, setName] = useState(bot.name);
  const [label, setLabel] = useState(bot.label);
  const [description, setDescription] = useState(bot.description);
  const [mode, setMode] = useState(bot.mode);
  const { busy, save } = useSave(bot, backTo);
  return (
    <EditFrame
      title="About"
      line={`${bot.name}'s name, label and what it is for.`}
      backTo={backTo}
      busy={busy || !name.trim()}
      onSave={() => save({ name: name.trim(), label, description, mode })}
    >
      <Row title="Name" line="What you call it." htmlFor="bot-name">
        <Input
          id="bot-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </Row>
      <Row title="Label" line="Shown next to the name, like Research or Inbox." htmlFor="bot-label">
        <Input
          id="bot-label"
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Row>
      <Row title="About" line="What this bot is for." htmlFor="bot-about">
        <Textarea
          id="bot-about"
          rows={3}
          value={description}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Row>
      <Row title="Used as" line="Yours alone, or for the whole team.">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={mode}
          onValueChange={(v) => v && setMode(v as Bot["mode"])}
          aria-label="Used as"
        >
          <ToggleGroupItem value="personal">{MODES.personal}</ToggleGroupItem>
          <ToggleGroupItem value="teammate">{MODES.teammate}</ToggleGroupItem>
        </ToggleGroup>
      </Row>
    </EditFrame>
  );
}

function InstructionsEdit({ bot, backTo }: { bot: Bot; backTo: string }) {
  const [instructions, setInstructions] = useState(bot.instructions);
  const { busy, save } = useSave(bot, backTo);
  return (
    <EditFrame
      title="Instructions"
      line="Applied from the next turn."
      backTo={backTo}
      busy={busy}
      onSave={() => save({ instructions })}
    >
      <Row
        title="Instructions"
        line="Tone, priorities, things to avoid."
        htmlFor="bot-instructions"
      >
        <Textarea
          id="bot-instructions"
          rows={10}
          value={instructions}
          maxLength={8000}
          placeholder="Keep updates to three bullets. Ask before emailing anyone outside the team."
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Row>
    </EditFrame>
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
      <SelectTrigger aria-label={label}>
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

function VoiceEdit({ bot, backTo }: { bot: Bot; backTo: string }) {
  const opts = useVoiceOptions();
  const [voice, setVoice] = useState(bot.voice);
  const [speed, setSpeed] = useState(bot.voiceSpeed);
  const [language, setLanguage] = useState(bot.voiceLanguage);
  const { busy, save } = useSave(bot, backTo);
  const voices = opts?.voices ?? [];
  const voiceOptions = (
    voices.some((v) => v.id === voice) ? voices : [{ id: voice, name: voice }, ...voices]
  ).map((v) => ({ value: v.id, label: v.name }));
  const speeds = opts?.speeds ?? [];
  const speedOptions = (
    speeds.includes(speed) ? speeds : [...speeds, speed].sort((a, b) => a - b)
  ).map((s) => ({
    value: s,
    label: speedLabel(s),
  }));
  const languages = opts?.languages ?? [{ code: language, name: language }];
  return (
    <EditFrame
      title="Voice"
      line={`How ${bot.name} sounds on a voice call.`}
      backTo={backTo}
      busy={busy}
      onSave={() => save({ voice, voiceSpeed: speed, voiceLanguage: language })}
    >
      <Row title="Voice" line="The voice at the speech server.">
        <Choice label="Voice" value={voice} options={voiceOptions} onChange={setVoice} />
      </Row>
      <Row title="Speed" line="1x is the voice's own pace.">
        <Choice label="Speed" value={speed} options={speedOptions} onChange={setSpeed} />
      </Row>
      <Row title="Language" line="What it listens for and speaks.">
        <Choice
          label="Language"
          value={language}
          options={languages.map((l) => ({ value: l.code, label: l.name }))}
          onChange={setLanguage}
        />
      </Row>
    </EditFrame>
  );
}

export function BotEditPage({ bot, section }: { bot: Bot; section: string }) {
  const backTo = useBackTo(settingsPath(bot));
  if (section === "look") return <LookEdit bot={bot} backTo={backTo} />;
  if (section === "about") return <AboutEdit bot={bot} backTo={backTo} />;
  if (section === "instructions") return <InstructionsEdit bot={bot} backTo={backTo} />;
  if (section === "voice") return <VoiceEdit bot={bot} backTo={backTo} />;
  return <p className="quiet">No such settings page.</p>;
}
