import type { CanvasTheme } from './themes';
import { hexToRgb } from './themes';
import type { CleanObj } from './types';

export const DAY = 86_400_000;

/**
 * 0 = just cleaned, 0.5 = due, 1 = twice the schedule has passed.
 * Colour ramp (per theme): `fresh` until halfway to due (0.25), then fresh → `due` at due,
 * then due → full `overdue`.
 */
export function staleness(o: CleanObj, now: number): number {
  if (o.lastCleaned === null) return 1;
  const days = (now - o.lastCleaned) / DAY;
  return Math.min(1, Math.max(0, days / (2 * Math.max(o.intervalDays, 0.01))));
}

export function stalenessColor(t: number, ramp: Pick<CanvasTheme, 'fresh' | 'due' | 'overdue'>): string {
  const [fresh, due, overdue] = [ramp.fresh, ramp.due, ramp.overdue].map(hexToRgb);
  if (t <= 0.25) return `rgb(${fresh[0]}, ${fresh[1]}, ${fresh[2]})`;
  const [from, to, k] = t <= 0.5 ? [fresh, due, (t - 0.25) / 0.25] : [due, overdue, (t - 0.5) / 0.5];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function daysSince(o: CleanObj, now: number): number | null {
  return o.lastCleaned === null ? null : Math.max(0, now - o.lastCleaned) / DAY;
}

/** Short "since last clean" text for canvas labels, e.g. "today", "yesterday", "3d ago". */
export function shortAgo(o: CleanObj, now: number): string {
  const d = daysSince(o, now);
  if (d === null) return 'never cleaned';
  const days = Math.floor(d);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function lastCleanedText(o: CleanObj, now: number): string {
  const d = daysSince(o, now);
  if (d === null) return 'Never cleaned';
  const days = Math.floor(d);
  if (days === 0) return 'Cleaned today';
  if (days === 1) return 'Cleaned yesterday';
  return `Cleaned ${days} days ago`;
}

export function everyText(n: number): string {
  if (n === 1) return 'daily';
  if (n === 7) return 'weekly';
  if (n === 14) return 'fortnightly';
  return `every ${n} days`;
}
