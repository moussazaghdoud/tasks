import { useSyncExternalStore } from 'react';
import { randomId } from './crypto';

/**
 * The people this Hence can send thoughts to, the teams made of them, and
 * the ones blocked.
 *
 * Kept on the phone: a person is added only by scanning their code or
 * opening their link, and agreeing to it on both sides. There is no
 * directory to search and nobody else to find.
 */
export interface Person {
  id: string;
  name: string;
  /** Their public key: what seals a thought so only they can open it. */
  publicKey: string;
  addedAt: string;
}

export interface Team {
  id: string;
  name: string;
  members: string[];
}

interface Book {
  people: Record<string, Person>;
  teams: Team[];
  /** Nothing from these is opened or shown. */
  blocked: string[];
}

const KEY = 'hence.people';
const EMPTY: Book = { people: {}, teams: [], blocked: [] };

function load(): Book {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Book>) : {};
    return { people: parsed.people ?? {}, teams: parsed.teams ?? [], blocked: parsed.blocked ?? [] };
  } catch {
    return EMPTY;
  }
}

let book: Book = load();
const listeners = new Set<() => void>();

function commit(next: Book): void {
  book = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept for this session only */
  }
  listeners.forEach((l) => l());
}

export const people = (): Person[] => Object.values(book.people).sort((a, b) => a.name.localeCompare(b.name));
export const personOf = (id: string): Person | undefined => book.people[id];
export const teams = (): Team[] => book.teams;
export const isBlocked = (id: string): boolean => book.blocked.includes(id);

export function addPerson(person: Omit<Person, 'addedAt'>): void {
  // Someone re-added after a block is unblocked: adding is the clearer wish.
  commit({
    ...book,
    people: { ...book.people, [person.id]: { ...person, addedAt: new Date().toISOString() } },
    blocked: book.blocked.filter((id) => id !== person.id),
  });
}

export function removePerson(id: string): void {
  const { [id]: _gone, ...rest } = book.people;
  commit({ ...book, people: rest, teams: book.teams.map((t) => ({ ...t, members: t.members.filter((m) => m !== id) })) });
}

/** Remove, and refuse anything they send from now on. */
export function blockPerson(id: string): void {
  removePerson(id);
  commit({ ...book, blocked: [...new Set([...book.blocked, id])] });
}

export function saveTeam(team: { id?: string; name: string; members: string[] }): Team {
  const saved: Team = { id: team.id ?? randomId(), name: team.name.trim().slice(0, 40), members: [...new Set(team.members)] };
  const others = book.teams.filter((t) => t.id !== saved.id);
  commit({ ...book, teams: [...others, saved].sort((a, b) => a.name.localeCompare(b.name)) });
  return saved;
}

export function removeTeam(id: string): void {
  commit({ ...book, teams: book.teams.filter((t) => t.id !== id) });
}

/** Re-render when people, teams or blocks change. */
export function usePeopleBook(): Book {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => book,
    () => EMPTY,
  );
}
