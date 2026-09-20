import { useSyncExternalStore } from 'react';
import type { Space, Task } from '@/domain/types';

/**
 * Which half of your life you are looking at.
 *
 * Kept outside React because two things need it: the list, which re-renders
 * when it changes, and the capture bar, which reads it at the instant a
 * thought is created. It is remembered between launches — reopening the app
 * in the wrong space would be worse than no spaces at all.
 */
const KEY = 'hence.space';

function read(): Space {
  try {
    return localStorage.getItem(KEY) === 'private' ? 'private' : 'business';
  } catch {
    return 'business';
  }
}

let current: Space = read();
const listeners = new Set<() => void>();

/** Tasks captured before spaces existed belong to Business. */
export const spaceOf = (task: Task): Space => task.space ?? 'business';

export const currentSpace = (): Space => current;

export function setSpace(next: Space): void {
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

export const useSpace = (): Space => useSyncExternalStore(subscribe, () => current, () => 'business');
