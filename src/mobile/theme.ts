import { useSyncExternalStore } from 'react';

/**
 * Dark or light, chosen rather than inherited.
 *
 * The phone opens dark because that is the design the app was built around,
 * but a screen you look at in daylight is a different screen. Both palettes
 * are the same token names, so nothing in the interface knows which one it is
 * wearing.
 */
export type Theme = 'dark' | 'light';

const KEY = 'hence.theme';

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let current: Theme = storedTheme();
const listeners = new Set<() => void>();

export const currentTheme = (): Theme => current;

/**
 * Paint the choice. The attribute goes on <html> rather than a container so
 * that sheets and toasts, which portal to the end of <body>, are painted from
 * the same tokens.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

export function setTheme(next: Theme): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice simply will not outlive the session */
  }
  applyTheme(next);
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current, () => 'dark');
