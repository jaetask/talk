import { IconStarFilled } from "@tabler/icons-react";
import { palette } from "../lib/colors";
import type { AvatarColor, AvatarShape, Bot } from "../types";
import { SHAPES, type ShapeDef } from "./shapes";

export function shapeDef(shape: AvatarShape | string): ShapeDef {
  return SHAPES[shape as AvatarShape] ?? SHAPES.blob;
}

export const PICKER_SHAPES: AvatarShape[] = [
  "blob",
  "cloud",
  "square",
  "sparkle",
  "clover",
  "heart",
  "flower",
  "teardrop",
  "tablet",
  "wedge",
  "house",
  "star",
  "hex",
];

const OVERDRAW = 1.5;
const INK = "#1C1C1C"; // toolkit-guard-allow
const PAPER = "#FFFFFF"; // toolkit-guard-allow

export function BotAvatar({
  shape,
  color,
  size,
  star,
  ring,
  title,
}: {
  shape: AvatarShape | string;
  color: AvatarColor | string;
  size: number;
  star?: boolean;
  ring?: boolean;
  title?: string;
}) {
  const def = shapeDef(shape);
  const draw = size * OVERDRAW;
  const off = (draw - size) / 2;
  const fill = palette(color).fill;
  const white = color === "white";
  const vbw = Number(def.viewBox.split(/\s+/)[2]);
  const px = vbw / draw;
  return (
    <span
      className="bot-avatar"
      style={{ width: size, height: size }}
      title={title}
      role="img"
      aria-label={title}
    >
      <svg
        width={draw}
        height={draw}
        viewBox={def.viewBox}
        style={{ position: "absolute", left: -off, top: -off, overflow: "visible" }}
        aria-hidden
      >
        {ring && (
          <path
            d={def.outline}
            fill={`${INK}3D`}
            stroke={`${INK}3D`}
            strokeWidth={px * 2 * 3.4}
            strokeLinejoin="round"
          />
        )}
        {ring && (
          <path
            d={def.outline}
            fill={PAPER}
            stroke={PAPER}
            strokeWidth={px * 2 * 2.4}
            strokeLinejoin="round"
          />
        )}
        <path d={def.outline} fill={white ? INK : PAPER} />
        <path
          d={def.d}
          fill={fill}
          fillRule="evenodd"
          stroke={white ? `${INK}33` : undefined}
          strokeWidth={white ? px : undefined}
        />
      </svg>
      {star && (
        <span className="bot-avatar-star" style={{ width: size * 0.2667, height: size * 0.2667 }}>
          <IconStarFilled size={size * 0.1333} />
        </span>
      )}
    </span>
  );
}

export function BotAvatarFor({
  bot,
  size,
  star,
}: {
  bot: Pick<Bot, "avatarShape" | "avatarColor" | "name">;
  size: number;
  star?: boolean;
}) {
  return (
    <BotAvatar
      shape={bot.avatarShape}
      color={bot.avatarColor}
      size={size}
      star={star}
      title={bot.name}
    />
  );
}
