import { ColourSwatches, Field, FormDialog } from "@jaetask/toolkit/suite";
import { Input } from "@jaetask/toolkit/ui/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BotAvatar } from "../avatar/BotAvatar";
import { api } from "../lib/api";
import { colorOfFill, palette, SWATCHES } from "../lib/colors";
import { botPath, go } from "../router";
import { useStore } from "../store";
import type { AvatarColor, AvatarShape } from "../types";
import { ShapePicker } from "./BotSettings";

export function NewBotDialog({ open }: { open: boolean }) {
  const [name, setName] = useState("");
  const [shape, setShape] = useState<AvatarShape>("heart");
  const [color, setColor] = useState<AvatarColor>("orange");
  useEffect(() => {
    if (open) setName("");
  }, [open]);
  const close = () => window.history.back();
  const create = async () => {
    if (!name.trim()) return false;
    try {
      const { bot } = await api.createBot({
        name: name.trim(),
        avatarShape: shape,
        avatarColor: color,
        mode: "personal",
      });
      const st = useStore.getState();
      useStore.setState({
        bots: st.bots.some((b) => b.id === bot.id) ? st.bots : [...st.bots, bot],
      });
      go(botPath(bot.id));
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title="New bot"
      saveLabel="Create"
      onSave={create}
    >
      <div className="look-preview">
        <BotAvatar shape={shape} color={color} size={72} />
      </div>
      <Field label="Name" htmlFor="new-bot-name">
        <Input
          id="new-bot-name"
          value={name}
          maxLength={60}
          autoFocus
          placeholder="Give your bot a name"
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Shape">
        <ShapePicker shape={shape} color={color} onShape={setShape} />
      </Field>
      <Field label="Colour">
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
