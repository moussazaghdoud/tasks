import { useSyncExternalStore } from 'react';
import { aiProvider, onProviderChange, type Provider } from './aiProvider';

/**
 * Whether the person has agreed to their notes being read by the AI service
 * the server uses — Claude, or Gemini.
 *
 * Asked once, at the first capture, because that is when the question means
 * something — and because App Review Guideline 5.1.2(i) requires explicit
 * permission before personal data is shared with a third-party AI, not just a
 * paragraph in the privacy policy.
 *
 * `unset` is different from `denied`: an unset choice is asked again next
 * time, a declined one is not, until changed in Settings.
 *
 * A yes is a yes to one service. When the server moves to another, the
 * question is asked again for the new one; a no stays a no.
 */
export type AiConsent = 'granted' | 'denied' | 'unset';

const KEY = 'hence.ai-consent';
/** The service a yes was given to. Absent on answers from before Gemini: they were given to Claude. */
const FOR_KEY = 'hence.ai-consent-for';

function read(): { answer: AiConsent; given: Provider } {
  try {
    const stored = localStorage.getItem(KEY);
    const answer: AiConsent = stored === 'granted' || stored === 'denied' ? stored : 'unset';
    return { answer, given: localStorage.getItem(FOR_KEY) === 'gemini' ? 'gemini' : 'claude' };
  } catch {
    return { answer: 'unset', given: 'claude' };
  }
}

let { answer: current, given } = read();
const listeners = new Set<() => void>();

/** The answer that holds for the service in use now. */
const effective = (): AiConsent => (current === 'granted' && given !== aiProvider() ? 'unset' : current);

export const aiConsent = (): AiConsent => effective();

export function setAiConsent(next: 'granted' | 'denied'): void {
  current = next;
  given = aiProvider();
  try {
    localStorage.setItem(KEY, next);
    localStorage.setItem(FOR_KEY, given);
  } catch {
    /* the choice will be asked for again next session */
  }
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const off = onProviderChange(onChange);
  return () => {
    listeners.delete(onChange);
    off();
  };
}

export const useAiConsent = (): AiConsent => useSyncExternalStore(subscribe, effective, () => 'unset');
