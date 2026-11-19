// Talk's own avatar shapes, drawn here from a few formulas (nothing is traced from anyone's artwork). Each shape is
// a silhouette in a 48-unit box with two eyes cut out of the fill.
import type { AvatarShape } from '@shared/types';

export interface ShapeDef { viewBox: string; d: string; outline: string }

type Pt = [number, number];
const C = 24;
const TAU = Math.PI * 2;
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const path = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

/** A closed curve from a radius at each angle (0 = right, a quarter turn = down). */
const polar = (r: (t: number) => number, sx = 1, sy = 1, n = 120): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU;
    return [C + r(t) * Math.cos(t) * sx, C + r(t) * Math.sin(t) * sy] as Pt;
  });
/** A rounded box: the higher the power, the squarer the corners. Below 1 it pinches into a four-point star. */
const box = (a: number, b: number, power: number) =>
  polar((t) => (Math.abs(Math.cos(t) / a) ** power + Math.abs(Math.sin(t) / b) ** power) ** (-1 / power));
const ngon = (sides: number, r: number, turn = -Math.PI / 2, dy = 0): Pt[] =>
  Array.from({ length: sides }, (_, i) => [C + r * Math.cos(turn + (i / sides) * TAU), C + dy + r * Math.sin(turn + (i / sides) * TAU)] as Pt);
const curve = (xy: (t: number) => Pt, n = 120): Pt[] => Array.from({ length: n }, (_, i) => xy((i / n) * TAU));
const turned = (pts: Pt[], by: number): Pt[] => pts.map(([x, y]) => [C + (x - C) * Math.cos(by) - (y - C) * Math.sin(by), C + (x - C) * Math.sin(by) + (y - C) * Math.cos(by)]);
/** An arc over the top that drops straight to a flat base. */
const domed = (r: number, cy: number, base: number): Pt[] => [
  ...Array.from({ length: 49 }, (_, i) => [C - r * Math.cos((i / 48) * Math.PI), cy - r * Math.sin((i / 48) * Math.PI)] as Pt),
  [C + r, base], [C - r, base],
];

const SILHOUETTES: Record<AvatarShape, Pt[]> = {
  blob: polar(() => 16),
  pebble: polar(() => 16, 1, 0.82),
  bean: polar((t) => 14.5 + 1.6 * Math.cos(2 * t) + 1.2 * Math.sin(t)),
  egg: polar((t) => 14.5 + 1.8 * Math.sin(t), 0.9, 1),
  squircle: box(15.5, 15.5, 4),
  square: box(14.5, 14.5, 9),
  tablet: box(17, 12.5, 6),
  capsule: box(17.5, 10.5, 3.2),
  cylinder: box(12, 16.5, 6),
  hex: ngon(6, 17, 0),
  gem: ngon(8, 16.5, Math.PI / 8),
  crystal: ngon(4, 17.5),
  wedge: ngon(3, 19, -Math.PI / 2, 3.5),
  shield: [[10, 9.5], [38, 9.5], [38, 25], [24, 40], [10, 25]],
  house: [[24, 7], [40.5, 20], [40.5, 40], [7.5, 40], [7.5, 20]],
  dome: domed(16, 27, 38),
  arch: domed(13, 21, 40.5),
  cloud: polar((t) => 13.2 + 2.2 * Math.cos(5 * t + 0.6), 1.18, 0.95),
  teardrop: curve((t) => [C + 14 * Math.sin(t) * Math.sin(t / 2) ** 1.2, 25 - 17 * Math.cos(t)]),
  leaf: turned(polar(() => 17, 0.62, 1), 0.6),
  sparkle: box(18.5, 18.5, 0.78),
  clover: polar((t) => 10.5 + 6 * Math.sin(2 * t) ** 2),
  flower: polar((t) => 13.5 + 2.8 * Math.cos(6 * t)),
  heart: curve((t) => [C + 16 * Math.sin(t) ** 3, 22.5 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]).map(([x, y]) => [C + (x - C) * 1.02, C + (y - C) * 1.02]),
  star: Array.from({ length: 10 }, (_, i) => [C + (i % 2 ? 9.5 : 18) * Math.cos(-Math.PI / 2 + (i / 10) * TAU), 25 + (i % 2 ? 9.5 : 18) * Math.sin(-Math.PI / 2 + (i / 10) * TAU)] as Pt),
};

/** Where the eyes sit, for the shapes whose middle isn't the middle of the box. */
const EYE_Y: Partial<Record<AvatarShape, number>> = { wedge: 29, house: 27, teardrop: 29, heart: 21, dome: 26, arch: 24, star: 25 };
const eye = (x: number, y: number, w = 3, h = 6.4) =>
  `M${f(x - w / 2)} ${f(y - h / 2 + w / 2)}a${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(w)} 0v${f(h - w)}a${f(w / 2)} ${f(w / 2)} 0 0 1 ${f(-w)} 0Z`;

export const SHAPES = Object.fromEntries(
  (Object.entries(SILHOUETTES) as [AvatarShape, Pt[]][]).map(([name, pts]) => {
    const outline = path(pts);
    const y = EYE_Y[name] ?? 23.5;
    return [name, { viewBox: '0 0 48 48', outline, d: `${outline}${eye(20, y)}${eye(28, y)}` }];
  }),
) as Record<AvatarShape, ShapeDef>;
