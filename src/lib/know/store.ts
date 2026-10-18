import { useSyncExternalStore } from 'react';
import { createId } from '@/lib/id';

/**
 * The person's own glossary: every term they asked about, kept, and brought
 * back to them until it sticks.
 *
 * Review follows widening gaps — a day, three, a week, three weeks, two
 * months. "Got it" moves a term to the next gap; "Again" starts it over.
 * That is what makes a definition looked up in a meeting become something
 * known, rather than something looked up again next time.
 */

export interface Definition {
  id: string;
  term: string;
  sentence: string;
  bullets: string[];
  /** Where it came from; absent when the person wrote it. */
  source?: { title: string; url: string; lang: string };
  /** Apple's on-device model condensed it. */
  byModel?: boolean;
  /** The meeting it came up in, if one was on. */
  meeting?: { subject: string; at: string };
  createdAt: string;
  updatedAt: string;
  review: { step: number; due: string };
}

/** Days before each review; past the last, it stays at the last. */
export const GAPS = [1, 3, 7, 21, 60];
/** Definitions free users may look up each month. */
export const FREE_PER_MONTH = 5;

const KEY = 'hence.know';
const USED_KEY = 'hence.know.used';

function load(): Definition[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Definition[]) : [];
  } catch {
    return [];
  }
}

let list: Definition[] = load();
const listeners = new Set<() => void>();

function commit(next: Definition[]): void {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}

export const definitions = (): Definition[] => list;

export const useDefinitions = (): Definition[] =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => list,
    () => [],
  );

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

/** The same term again replaces the old entry rather than doubling it. */
export function keep(entry: Omit<Definition, 'id' | 'createdAt' | 'updatedAt' | 'review'>, now = new Date()): Definition {
  const same = list.find((d) => d.term.toLowerCase() === entry.term.toLowerCase());
  const saved: Definition = {
    ...entry,
    id: same?.id ?? createId('def_'),
    createdAt: same?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    review: same?.review ?? { step: 0, due: addDays(now, GAPS[0]).toISOString() },
  };
  commit([saved, ...list.filter((d) => d.id !== saved.id)]);
  return saved;
}

export function update(id: string, patch: Partial<Pick<Definition, 'term' | 'sentence' | 'bullets'>>): void {
  commit(list.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d)));
}

export function forget(id: string): void {
  commit(list.filter((d) => d.id !== id));
}

/**
 * Bring back the glossary from the iCloud copy, after a reinstall or on a
 * new iPhone: added to what is here, a term already here keeps its version.
 */
export function restoreDefinitions(saved: Definition[] | undefined): number {
  if (!Array.isArray(saved)) return 0;
  const known = new Set(list.map((d) => d.term.toLowerCase()));
  const missing = saved.filter((d) => d && typeof d.term === 'string' && typeof d.sentence === 'string' && !known.has(d.term.toLowerCase()));
  if (missing.length) commit([...list, ...missing]);
  return missing.length;
}

/** Be told when the glossary changes — for the iCloud copy. */
export function onDefinitionsChange(run: () => void): () => void {
  listeners.add(run);
  return () => listeners.delete(run);
}

/** Terms due for review now, oldest due first. */
export const dueNow = (now = new Date(), from: Definition[] = list): Definition[] =>
  from.filter((d) => Date.parse(d.review.due) <= now.getTime()).sort((a, b) => a.review.due.localeCompare(b.review.due));

/** "Got it" widens the gap; "Again" brings it back tomorrow. */
export function reviewed(id: string, knew: boolean, now = new Date()): void {
  commit(
    list.map((d) => {
      if (d.id !== id) return d;
      const step = knew ? Math.min(d.review.step + 1, GAPS.length - 1) : 0;
      return { ...d, review: { step, due: addDays(now, GAPS[step]).toISOString() } };
    }),
  );
}

/** How many definitions were looked up this month (free users get FREE_PER_MONTH). */
export function usedThisMonth(now = new Date()): number {
  try {
    const raw = JSON.parse(localStorage.getItem(USED_KEY) ?? '{}') as { month?: string; n?: number };
    return raw.month === now.toISOString().slice(0, 7) ? (raw.n ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function countLookUp(now = new Date()): void {
  const month = now.toISOString().slice(0, 7);
  try {
    localStorage.setItem(USED_KEY, JSON.stringify({ month, n: usedThisMonth(now) + 1 }));
  } catch {
    /* uncounted this time */
  }
}
