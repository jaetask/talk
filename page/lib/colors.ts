import type { CSSProperties } from "react";
import type { AvatarColor } from "../types";

export type BotPalette = { fill: string; bubble: string; action: string };

const THEMED = { bubble: "var(--tk-primary)", action: "var(--tk-primary)" };
const ON_COLOUR = "#FFFFFF"; // toolkit-guard-allow

export const BOT_COLORS: Record<AvatarColor, BotPalette> = {
  black: { fill: "#000000", ...THEMED }, // toolkit-guard-allow
  white: { fill: "#FFFFFF", ...THEMED }, // toolkit-guard-allow
  brown: { fill: "#A06B39", bubble: "#86592E", action: "#9D6937" }, // toolkit-guard-allow
  red: { fill: "#FB2B3E", bubble: "#C82532", action: "#E72E3B" }, // toolkit-guard-allow
  orange: { fill: "#FD690F", bubble: "#D2550A", action: "#EE620D" }, // toolkit-guard-allow
  yellow: { fill: "#F59312", bubble: "#C2730B", action: "#DA830E" }, // toolkit-guard-allow
  green: { fill: "#14C16F", bubble: "#0D9655", action: "#10AB61" }, // toolkit-guard-allow
  cyan: { fill: "#13B7A2", bubble: "#0D9381", action: "#10A693" }, // toolkit-guard-allow
  blue: { fill: "#1E86FC", bubble: "#126FD4", action: "#1680F3" }, // toolkit-guard-allow
  violet: { fill: "#8F59F9", bubble: "#7442D1", action: "#8351E4" }, // toolkit-guard-allow
  magenta: { fill: "#F93498", bubble: "#C82779", action: "#E52F8B" }, // toolkit-guard-allow
  gray: { fill: "#959595", bubble: "#6E6E6E", action: "#7A7A7A" }, // toolkit-guard-allow
};

export const COLOR_ORDER: AvatarColor[] = [
  "black",
  "white",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "violet",
  "magenta",
  "gray",
];

export const SWATCHES = COLOR_ORDER.map((name) => ({ name, value: BOT_COLORS[name].fill }));

export const colorOfFill = (fill: string): AvatarColor =>
  COLOR_ORDER.find((c) => BOT_COLORS[c].fill.toLowerCase() === fill.toLowerCase()) ?? "black";

export const palette = (c: AvatarColor | string | undefined): BotPalette =>
  BOT_COLORS[(c as AvatarColor) ?? "black"] ?? BOT_COLORS.black;

export function botVars(c: AvatarColor | string | undefined): CSSProperties {
  const p = palette(c);
  const themed = p.bubble === THEMED.bubble;
  return {
    ["--bot-fill" as string]: p.fill,
    ["--bot-bubble" as string]: p.bubble,
    ["--bot-action" as string]: p.action,
    ["--bot-on-action" as string]: themed ? "var(--tk-on-primary)" : ON_COLOUR,
  };
}
