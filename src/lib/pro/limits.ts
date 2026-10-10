import { useSyncExternalStore } from 'react';
import type { Task } from '@/domain/types';

/**
 * What the free version holds back, and the sheet that offers Pro.
 *
 * Free keeps everything that makes Hence Hence — capturing, reminders,
 * photos, the agenda, receiving thoughts — and draws three lines: thirty
 * open thoughts at a time (finished and deleted ones do not count), no
 * background picture, and sending to one person at a time, without teams.
 *
 * The thought limit is checked when a capture starts, never during one: a
 * thought already being said is always kept.
 */

export const FREE_OPEN_LIMIT = 30;

/** Thoughts still open: not done and not archived, in both spaces. */
export const openCount = (tasks: Record<string, Task> | Task[]): number =>
  (Array.isArray(tasks) ? tasks : Object.values(tasks)).filter((t) => t.status !== 'done' && !t.archivedAt).length;

/** Whether a new capture may start. */
export const mayCapture = (pro: boolean, open: number): boolean => pro || open < FREE_OPEN_LIMIT;

/**
 * Whether a send may go to these recipients: free sends to one person at a
 * time, and never to a team.
 */
export const maySend = (pro: boolean, recipients: number, viaTeam: boolean): boolean =>
  pro || (recipients <= 1 && !viaTeam);

export type ProReason = 'limit' | 'backdrop' | 'share' | 'team' | 'settings';

let sheet: { open: boolean; reason: ProReason } = { open: false, reason: 'settings' };
const listeners = new Set<() => void>();
const publish = (next: typeof sheet) => {
  sheet = next;
  listeners.forEach((l) => l());
};

/** Offer Pro, saying why it came up. */
export const openPro = (reason: ProReason = 'settings'): void => publish({ open: true, reason });
export const closePro = (): void => publish({ ...sheet, open: false });

export const useProSheet = () =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => sheet,
    () => sheet,
  );
