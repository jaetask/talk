import { ColourSwatches, EditFrame, Row, useBackTo } from "@jaetask/toolkit/suite";
import { Input } from "@jaetask/toolkit/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { BotAvatar } from "../avatar/BotAvatar";
import { api } from "../lib/api";
import { colorOfFill, palette, SWATCHES } from "../lib/colors";
import { botPath, go } from "../router";
import { useStore } from "../store";
import type { AvatarColor, AvatarShape } from "../types";
import { ShapePicker } from "./BotSettings";

export function NewBotPage() {
  const backTo = useBackTo("/");
  const [name, setName] = useState("");
  const [shape, setShape] = useState<AvatarShape>("heart");
  const [color, setColor] = useState<AvatarColor>("orange");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
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
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <EditFrame
      title="New bot"
      line="A bot is a role, a voice and the apps it may use."
      backTo={backTo}
      busy={busy || !name.trim()}
      saveLabel="Create"
      onSave={create}
    >
      <div className="look-preview">
        <BotAvatar shape={shape} color={color} size={96} />
      </div>
      <Row title="Name" line="What you call it." htmlFor="new-bot-name">
        <Input
          id="new-bot-name"
          value={name}
          maxLength={60}
          autoFocus
          placeholder="Give your bot a name"
          onChange={(e) => setName(e.target.value)}
        />
      </Row>
      <Row title="Shape" line="Its outline.">
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
