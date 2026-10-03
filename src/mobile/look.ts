import { useSyncExternalStore } from 'react';

/**
 * How the app looks, beside whether it is dark or light.
 *
 * Classic is the app as it was designed and stays the default. The others
 * re-dress the same screens — the list, the agenda, the sheets — with their
 * own paper, colours, type and card shapes, each in a dark and a light
 * version, so the Dark/Light switch keeps meaning what it says.
 *
 * Like the theme, the choice is an attribute on <html>: every surface,
 * sheets and toasts included, reads the same tokens, and nothing in the
 * interface has to know which look it is wearing.
 */
export type Look = 'classic' | 'pinboard' | 'notebook' | 'bubbles' | 'widgets' | 'sky';

/** In the order Settings offers them; Classic first. */
export const LOOKS: Look[] = ['classic', 'pinboard', 'notebook', 'bubbles', 'widgets', 'sky'];

const KEY = 'hence.look';

function stored(): Look {
  try {
    const value = localStorage.getItem(KEY) as Look | null;
    return value && LOOKS.includes(value) ? value : 'classic';
  } catch {
    return 'classic';
  }
}

let current: Look = stored();
const listeners = new Set<() => void>();

export const currentLook = (): Look => current;

/** Paint the look: Classic is the absence of the attribute. */
export function applyLook(look: Look): void {
  const root = document.documentElement;
  if (look === 'classic') root.removeAttribute('data-look');
  else root.setAttribute('data-look', look);
}

export function setLook(next: Look): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice simply will not outlive the session */
  }
  applyLook(next);
  for (const notify of listeners) notify();
}

export const useLook = (): Look =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => current,
    () => 'classic',
  );
