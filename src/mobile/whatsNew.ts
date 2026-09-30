import { App } from '@capacitor/app';
import { Bell, CalendarCheck, CornerDownLeft, Lock, Mic, ScanText, Trash2, type LucideIcon } from 'lucide-react';
import { isNative } from '@/lib/native/platform';
import { ws } from '@/store/workspace';
import type { Key } from './i18n';

/**
 * Said once, when the app is new to you: at the first launch, and at the
 * first launch after an update that brought something worth knowing.
 *
 * New versions go at the top of RELEASES with what they bring. A version
 * with nothing listed — a quiet fix — shows nothing.
 */

export interface Note {
  icon: LucideIcon;
  title: Key;
  body: Key;
}

const RELEASES: Array<{ version: string; notes: Note[] }> = [
  {
    version: '1.0.1',
    notes: [
      { icon: ScanText, title: 'wn_photo_text_title', body: 'wn_photo_text_body' },
      { icon: CornerDownLeft, title: 'wn_newline_title', body: 'wn_newline_body' },
      { icon: Bell, title: 'wn_reminders_title', body: 'wn_reminders_body' },
      { icon: Trash2, title: 'wn_swipe_title', body: 'wn_swipe_body' },
    ],
  },
];

/** What a first launch is told: the three things that make the app. */
const WELCOME: Note[] = [
  { icon: Mic, title: 'wn_speak_title', body: 'wn_speak_body' },
  { icon: CalendarCheck, title: 'wn_act_title', body: 'wn_act_body' },
  { icon: Lock, title: 'wn_private_title', body: 'wn_private_body' },
];

export interface Announcement {
  kind: 'welcome' | 'update';
  version: string;
  notes: Note[];
}

const KEY = 'hence.seen-version';

/** -1, 0 or 1, comparing "1.0.10" and "1.0.9" the way people mean them. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/**
 * What to announce, given the version running and the last one announced.
 * Kept free of storage and of the phone so it can be tested.
 */
export function announcementFor(current: string, seen: string | null, hasThoughts: boolean): Announcement | null {
  if (seen && compareVersions(current, seen) <= 0) return null;
  // Nothing seen yet and nothing captured: a new installation. Nothing seen
  // but thoughts already there: an update from before this sheet existed.
  if (!seen && !hasThoughts) return { kind: 'welcome', version: current, notes: WELCOME };
  const notes = RELEASES.filter(
    (r) => compareVersions(r.version, current) <= 0 && (!seen || compareVersions(r.version, seen) > 0),
  ).flatMap((r) => r.notes);
  // Someone arriving from before this sheet existed hears about this version only.
  const trimmed = seen ? notes : (RELEASES.find((r) => r.version === current)?.notes ?? []);
  return trimmed.length ? { kind: 'update', version: current, notes: trimmed.slice(0, 5) } : null;
}

/** What this launch should say, if anything. Only in the iPhone app. */
export async function pendingAnnouncement(): Promise<Announcement | null> {
  if (!isNative()) return null;
  let current: string;
  try {
    current = (await App.getInfo()).version;
  } catch {
    return null;
  }
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(KEY);
  } catch {
    /* unreadable storage: treated as nothing seen */
  }
  const found = announcementFor(current, seen, Object.keys(ws().tasks).length > 0);
  // A version with nothing to say is still marked seen, so the next one is
  // compared against it.
  if (!found) markSeen(current);
  return found;
}

export function markSeen(version: string): void {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    /* it will be said again next launch, which is harmless */
  }
}
