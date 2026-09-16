import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  isSameYear,
  nextDay,
  parseISO,
  startOfWeek,
  type Day,
} from 'date-fns';
import type { DateKey, TimeKey } from '@/domain/types';

export function toKey(d: Date): DateKey {
  return format(d, 'yyyy-MM-dd');
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now = new Date()): DateKey {
  return toKey(now);
}

export function addDaysKey(key: DateKey, n: number): DateKey {
  return toKey(addDays(fromKey(key), n));
}

export function addMonthsKey(key: DateKey, n: number): DateKey {
  return toKey(addMonths(fromKey(key), n));
}

/** b - a in calendar days. */
export function daysBetween(a: DateKey, b: DateKey): number {
  return differenceInCalendarDays(fromKey(b), fromKey(a));
}

/** Next occurrence of a weekday (0 = Sunday). If `includeToday`, today counts. */
export function nextWeekdayKey(from: DateKey, weekday: number, includeToday = true): DateKey {
  const base = fromKey(from);
  if (includeToday && base.getDay() === weekday) return from;
  return toKey(nextDay(base, weekday as Day));
}

export function startOfWeekKey(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  return toKey(startOfWeek(fromKey(key), { weekStartsOn }));
}

export function nextWeekKey(from: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  return addDaysKey(startOfWeekKey(from, weekStartsOn), 7);
}

export function weekendKey(from: DateKey): DateKey {
  const d = fromKey(from).getDay();
  if (d === 6 || d === 0) return from;
  return nextWeekdayKey(from, 6);
}

export function isWeekend(key: DateKey): boolean {
  const d = fromKey(key).getDay();
  return d === 0 || d === 6;
}

/**
 * Short, human label for a due date relative to today.
 * Today / Tomorrow / Yesterday / weekday within a week / "Sep 21" / "Sep 21, 2027".
 */
export function dueLabel(key: DateKey, today = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = fromKey(key);
  if (diff > 1 && diff < 7) return format(d, 'EEEE');
  if (diff < 0 && diff > -7) return format(d, 'EEE');
  if (isSameYear(d, fromKey(today))) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

/** Compact label for metadata columns. */
export function dueLabelShort(key: DateKey, today = todayKey()): string {
  const diff = daysBetween(today, key);
  if (diff > 1 && diff < 7) return format(fromKey(key), 'EEE');
  return dueLabel(key, today);
}

export function longDate(key: DateKey): string {
  return format(fromKey(key), 'EEEE, MMMM d');
}

export function mediumDate(key: DateKey): string {
  return format(fromKey(key), 'EEE, MMM d');
}

export function detectTimeFormat(): '24h' | '12h' {
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    return opts.hour12 ? '12h' : '24h';
  } catch {
    return '24h';
  }
}

export function formatTime(time: TimeKey, fmt: '24h' | '12h'): string {
  if (fmt === '24h') return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

export function timeKey(h: number, m = 0): TimeKey {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Combine a date key and optional time into a local Date. */
export function toDate(key: DateKey, time?: TimeKey | null): Date {
  const d = fromKey(key);
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  }
  return d;
}

export function relativeTime(iso: string, now = new Date()): string {
  const then = parseISO(iso);
  const mins = Math.round((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && differenceInCalendarDays(now, then) === 0) return `${hours} h ago`;
  const days = differenceInCalendarDays(now, then);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return isSameYear(then, now) ? format(then, 'MMM d') : format(then, 'MMM d, yyyy');
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}
