import { useSyncExternalStore } from 'react';
import { todayKey } from '@/lib/dates';

/**
 * Today's date key, updated when the day rolls over (e.g. an app left open
 * overnight) so "Today" never goes stale.
 */
let current = todayKey();
const listeners = new Set<() => void>();

function tick() {
  const next = todayKey();
  if (next !== current) {
    current = next;
    listeners.forEach((l) => l());
  }
}

if (typeof window !== 'undefined') {
  setInterval(tick, 30_000);
  document.addEventListener('visibilitychange', tick);
}

export function useToday(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** Current wall-clock minute, for greetings and "now" indicators. */
let minute = Math.floor(Date.now() / 60000);
const minuteListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  setInterval(() => {
    const m = Math.floor(Date.now() / 60000);
    if (m !== minute) {
      minute = m;
      minuteListeners.forEach((l) => l());
    }
  }, 10_000);
}

export function useMinute(): number {
  return useSyncExternalStore(
    (l) => {
      minuteListeners.add(l);
      return () => minuteListeners.delete(l);
    },
    () => minute,
  );
}
