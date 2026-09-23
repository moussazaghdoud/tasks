import { useSyncExternalStore } from 'react';

/**
 * What each language made of the last thing you said.
 *
 * Listening in three languages at once either works or picks the wrong one,
 * and from a phone there is no way to tell which language was even heard —
 * no console, no logs, nothing but a thought in the wrong words. This keeps
 * the last race so Settings can show it.
 *
 * Lives in memory only: it holds what you just said, and that belongs on the
 * screen for a minute, not on the disk.
 */
export interface Candidate {
  locale: string;
  text: string;
  /** Apple's confidence in the words, 0 to 1. */
  confidence: number;
  /** How much the text reads like that language, 0 to 1. */
  match: number;
  /** Why this language never answered, when it did not. */
  failure: string;
}

export interface Race {
  at: number;
  won: string;
  candidates: Candidate[];
}

let last: Race | null = null;
const listeners = new Set<() => void>();

export function rememberRace(won: string, candidates: Candidate[]): void {
  last = { at: Date.now(), won, candidates };
  for (const notify of listeners) notify();
}

export const lastRace = (): Race | null => last;

export const useLastRace = (): Race | null =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => last,
    () => null,
  );

/** One line per language: `fr-FR ✓ 0.91/0.73 "rappelle-moi demain"`. */
export const describe = (c: Candidate, won: string): string => {
  const head = `${c.locale}${c.locale === won ? ' ✓' : ''}`;
  if (c.failure && !c.text) return `${head} — ${c.failure}`;
  if (!c.text) return `${head} — nothing`;
  return `${head} ${c.match.toFixed(2)}/${c.confidence.toFixed(2)} “${c.text}”`;
};
