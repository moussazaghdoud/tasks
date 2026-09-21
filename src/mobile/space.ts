import { useSyncExternalStore } from 'react';
import type { Space, Task } from '@/domain/types';

/** What the list is showing. The agenda is read-only; the other two are spaces. */
export type View = 'agenda' | Space;

/**
 * Which half of your life you are looking at.
 *
 * Kept outside React because two things need it: the list, which re-renders
 * when it changes, and the capture bar, which reads it at the instant a
 * thought is created. It is remembered between launches — reopening the app
 * in the wrong space would be worse than no spaces at all.
 */
const KEY = 'hence.space';

function read(): View {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'private' || stored === 'agenda' ? stored : 'business';
  } catch {
    return 'business';
  }
}

let current: View = read();
const listeners = new Set<() => void>();

/** Tasks captured before spaces existed belong to Business. */
export const spaceOf = (task: Task): Space => task.space ?? 'business';

export const currentView = (): View => current;

/** Where a thought captured right now belongs. The agenda holds none. */
export const currentSpace = (): Space => (current === 'agenda' ? 'business' : current);

export function setView(next: View): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private browsing; the choice simply will not outlive the session */
  }
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useView = (): View => useSyncExternalStore(subscribe, () => current, () => 'business');
