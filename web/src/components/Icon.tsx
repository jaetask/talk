import type { CSSProperties } from 'react';
import {
  ArrowDown, ArrowUp, AudioLines, AudioWaveform, Check, ChevronDown, ChevronRight, Circle, Clock, Copy, Ellipsis, FileText, Hash, LayoutGrid,
  MessageCircle, Mic, Monitor, PanelLeft, Paperclip, Plus, RefreshCw, Save, Search, Share, Square, SquarePen, Star, X, type LucideIcon,
} from 'lucide-react';

const ICONS = {
  apps: LayoutGrid, arrow_down: ArrowDown, chat_filled: MessageCircle, check: Check, chev_down: ChevronDown, chev_right: ChevronRight, clock: Clock,
  close: X, composer_plus: Plus, copy: Copy, edit: SquarePen, file: FileText, mic: Mic, paperclip: Paperclip, plus: Plus, record: Circle, save: Save,
  search: Search, share: Share, sidebar: PanelLeft, slack: Hash, star: Star, voice_a: AudioLines, voice_b: AudioWaveform, arrow_up: ArrowUp,
  stop: Square, more: Ellipsis, monitor: Monitor, refresh: RefreshCw,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
const FILLED = new Set<IconName>(['stop', 'star', 'record', 'chat_filled']);

interface Props { name: IconName; size?: number; opacity?: number; className?: string; style?: CSSProperties; color?: string }

export function Icon({ name, size = 16, opacity, className, style, color }: Props) {
  const Glyph = ICONS[name];
  return <Glyph aria-hidden className={className} size={size} strokeWidth={2} fill={FILLED.has(name) ? 'currentColor' : 'none'} style={{ opacity, color, flexShrink: 0, ...style }} />;
}
