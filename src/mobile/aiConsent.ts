import { useSyncExternalStore } from 'react';

/**
 * Whether the person has agreed to their notes being read by Claude.
 *
 * Asked once, at the first capture, because that is when the question means
 * something — and because App Review Guideline 5.1.2(i) requires explicit
 * permission before personal data is shared with a third-party AI, not just a
 * paragraph in the privacy policy.
 *
 * `unset` is different from `denied`: an unset choice is asked again next
 * time, a declined one is not, until changed in Settings.
 */
export type AiConsent = 'granted' | 'denied' | 'unset';

const KEY = 'hence.ai-consent';

function read(): AiConsent {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'granted' || stored === 'denied' ? stored : 'unset';
  } catch {
    return 'unset';
  }
}

let current: AiConsent = read();
const listeners = new Set<() => void>();

export const aiConsent = (): AiConsent => current;

export function setAiConsent(next: 'granted' | 'denied'): void {
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the choice will be asked for again next session */
  }
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useAiConsent = (): AiConsent => useSyncExternalStore(subscribe, () => current, () => 'unset');
