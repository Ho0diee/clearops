import type { EventColorId } from '../types/schema';

export interface EventColorOption {
  id: EventColorId;
  label: string;
  hex: string;
}

export const EVENT_COLOR_OPTIONS: EventColorOption[] = [
  { id: 'crimson', label: 'Red', hex: '#DC2626' },
  { id: 'coral', label: 'Orange', hex: '#EA580C' },
  { id: 'amber', label: 'Gold', hex: '#D97706' },
  { id: 'emerald', label: 'Green', hex: '#15803D' },
  { id: 'teal', label: 'Teal', hex: '#0D9488' },
  { id: 'sky', label: 'Sky', hex: '#0284C7' },
  { id: 'cobalt', label: 'Blue', hex: '#2563EB' },
  { id: 'violet', label: 'Purple', hex: '#7C3AED' },
  { id: 'pink', label: 'Pink', hex: '#DB2777' },
  { id: 'slate', label: 'Slate', hex: '#475569' },
];

export const EVENT_COLOR_HEX: Record<EventColorId, string> = Object.fromEntries(
  EVENT_COLOR_OPTIONS.map((c) => [c.id, c.hex])
) as Record<EventColorId, string>;

export function formatAlertOffsetShort(mins: number): string {
  if (mins <= 0) return 'At start';
  if (mins % 1440 === 0) {
    const d = mins / 1440;
    return `${d}d early`;
  }
  if (mins % 60 === 0) {
    const h = mins / 60;
    return `${h}h early`;
  }
  return `${mins}m early`;
}

export function formatAlertBadgeCompact(mins: number): string {
  if (mins <= 0) return '0m';
  if (mins % 1440 === 0) return `${mins / 1440}d`;
  if (mins % 60 === 0) return `${mins / 60}h`;
  return `${mins}m`;
}
