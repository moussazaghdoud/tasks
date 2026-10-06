import { registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';
import type { Card } from './card';
import { openAnonymous, openFrom, sealAnonymous, sealFor } from './crypto';
import { identity } from './identity';
import { addPerson, isBlocked, personOf, type Person } from './people';

/**
 * Sending a thought to someone, and collecting what others sent.
 *
 * Envelopes go through the app's public iCloud database (ShareBoxPlugin):
 * addressed to an anonymous identifier, sealed so that only the recipient can
 * open them, and deleted as soon as they are collected. What has been
 * collected waits here, on the phone, until it is accepted or declined.
 *
 * Two kinds of envelope:
 * - `hello`: "here is my card" — sent to someone whose code you scanned, so
 *   they can add you back. Sealed anonymously, since they do not know you yet.
 * - `thought`: a thought, sealed between your key and theirs, which also
 *   proves it came from you. Only opened from people you have added.
 */

interface ShareBoxPlugin {
  available(): Promise<{ available: boolean }>;
  post(options: { to: string; kind: string; from: string; data: string }): Promise<void>;
  fetch(options: { to: string }): Promise<{ envelopes: Envelope[] }>;
  remove(options: { ids: string[] }): Promise<void>;
  subscribe(options: { to: string; alert: string }): Promise<void>;
  chime(): Promise<void>;
}

interface Envelope {
  id: string;
  kind: string;
  from: string;
  data: string;
  sentAt: string;
}

const ShareBox = registerPlugin<ShareBoxPlugin>('ShareBox');

/** What travels in a `thought` envelope. */
export interface SharedThought {
  v: 1;
  title: string;
  notes: string;
  important: boolean;
  reminderAt: string | null;
  /** Whether the sender kept a copy. */
  mode: 'copy' | 'transfer';
}

/** Someone who scanned your code and would like to be able to send you thoughts. */
export interface ContactRequest {
  id: string;
  card: Card;
  at: string;
}

/** A thought someone sent, waiting for Accept or Decline. */
export interface Incoming {
  id: string;
  from: string;
  thought: SharedThought;
  at: string;
}

interface Inbox {
  requests: ContactRequest[];
  thoughts: Incoming[];
}

const KEY = 'hence.inbox';
const EMPTY: Inbox = { requests: [], thoughts: [] };

function load(): Inbox {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Inbox>) : {};
    return { requests: parsed.requests ?? [], thoughts: parsed.thoughts ?? [] };
  } catch {
    return EMPTY;
  }
}

let inbox: Inbox = load();
const listeners = new Set<() => void>();

function commit(next: Inbox): void {
  inbox = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept for this session only */
  }
  listeners.forEach((l) => l());
}

export function useInbox(): Inbox {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => inbox,
    () => EMPTY,
  );
}

/** Whether this iPhone can send and receive: the native app, signed in to iCloud. */
export async function sharingAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await ShareBox.available()).available;
  } catch {
    return false;
  }
}

/** Tell someone you added them, with your card, so they can add you back. */
export async function sayHello(to: Person): Promise<void> {
  const me = await identity();
  const card: Card = { id: me.id, name: me.name, publicKey: me.keys.publicKey };
  await ShareBox.post({ to: to.id, kind: 'hello', from: me.id, data: await sealAnonymous(to.publicKey, { card }) });
}

/**
 * Send a thought to each of these people. Resolves with those it could not reach.
 *
 * The thought is sealed between my key and theirs, which proves it is mine;
 * my card travels with it, sealed for them alone, so someone who has since
 * removed me still learns who is writing and can choose to take me back.
 */
export async function sendThought(to: Person[], thought: SharedThought): Promise<Person[]> {
  const me = await identity();
  const card: Card = { id: me.id, name: me.name, publicKey: me.keys.publicKey };
  const failed: Person[] = [];
  for (const person of to) {
    try {
      const sealed = await sealFor(me.keys.privateJwk, person.publicKey, thought);
      const data = await sealAnonymous(person.publicKey, { card, sealed });
      await ShareBox.post({ to: person.id, kind: 'note', from: me.id, data });
    } catch (error) {
      setMailError(messageOf(error));
      failed.push(person);
    }
  }
  return failed;
}

/**
 * What last went wrong between this iPhone and iCloud, as iCloud said it —
 * shown in People, so a failure is not silent. Cleared by the next success.
 */
let mailError: string | null = null;
const errorListeners = new Set<() => void>();

function setMailError(next: string | null): void {
  if (next === mailError) return;
  mailError = next;
  errorListeners.forEach((l) => l());
}

export const messageOf = (error: unknown): string =>
  (error as { message?: string })?.message || String(error);

export function useMailError(): string | null {
  return useSyncExternalStore(
    (on) => {
      errorListeners.add(on);
      return () => errorListeners.delete(on);
    },
    () => mailError,
    () => null,
  );
}

let collecting: Promise<number> | null = null;

/**
 * Collect the mailbox: open what can be opened, keep it here, and delete it
 * from iCloud. Resolves with how many new things arrived.
 */
export function collect(): Promise<number> {
  if (!isNative()) return Promise.resolve(0);
  collecting ??= collectNow().finally(() => {
    collecting = null;
  });
  return collecting;
}

async function collectNow(): Promise<number> {
  const me = await identity();
  let envelopes: Envelope[];
  try {
    ({ envelopes } = await ShareBox.fetch({ to: me.id }));
    setMailError(null);
  } catch (error) {
    setMailError(messageOf(error));
    return 0;
  }
  if (!envelopes.length) return 0;

  const requests = [...inbox.requests];
  const thoughts = [...inbox.thoughts];
  let arrived = 0;

  for (const envelope of envelopes) {
    // Anything from a blocked sender is deleted unopened.
    if (isBlocked(envelope.from)) continue;
    try {
      if (envelope.kind === 'hello') {
        const { card } = await openAnonymous<{ card: Card }>(me.keys.privateJwk, envelope.data);
        if (!card?.id || card.id !== envelope.from || isBlocked(card.id)) continue;
        // Already in the book: just refresh the name and key they sent.
        if (personOf(card.id)) {
          addPerson(card);
          continue;
        }
        // A request still waiting: their newer card, with the name they have since chosen.
        const waiting = requests.findIndex((r) => r.card.id === card.id);
        if (waiting >= 0) {
          requests[waiting] = { ...requests[waiting], card };
          continue;
        }
        requests.push({ id: envelope.id, card, at: envelope.sentAt });
        arrived++;
      } else if (envelope.kind === 'note') {
        const { card, sealed } = await openAnonymous<{ card: Card; sealed: string }>(me.keys.privateJwk, envelope.data);
        if (!card?.id || card.id !== envelope.from || typeof sealed !== 'string') continue;
        const known = personOf(card.id);
        // Someone in the book is held to the key they were added with: a
        // stranger cannot borrow their identifier. Someone not in it proves
        // only that they hold the key on their own card.
        const thought = await openFrom<SharedThought>(me.keys.privateJwk, known ? known.publicKey : card.publicKey, sealed);
        if (thought?.v !== 1 || typeof thought.title !== 'string' || !thought.title.trim()) continue;
        // From someone removed, or never added: it waits behind a request,
        // shown once they are taken (back) in, dropped if they are declined.
        if (!known && !requests.some((r) => r.card.id === card.id)) {
          requests.push({ id: `${envelope.id}-hello`, card, at: envelope.sentAt });
        }
        thoughts.push({
          id: envelope.id,
          from: card.id,
          at: envelope.sentAt,
          thought: {
            v: 1,
            title: thought.title.slice(0, 2000),
            notes: typeof thought.notes === 'string' ? thought.notes.slice(0, 10000) : '',
            important: thought.important === true,
            reminderAt: typeof thought.reminderAt === 'string' && !Number.isNaN(Date.parse(thought.reminderAt)) ? thought.reminderAt : null,
            mode: thought.mode === 'transfer' ? 'transfer' : 'copy',
          },
        });
        arrived++;
      }
    } catch {
      // Forged, damaged, or sealed for a key this phone no longer has.
    }
  }

  commit({ requests, thoughts });
  // Kept here now: nothing stays in iCloud.
  await ShareBox.remove({ ids: envelopes.map((e) => e.id) }).catch(() => undefined);
  return arrived;
}

/** Ask iCloud to notify this iPhone when something arrives. */
export async function listenForMail(alert: string): Promise<void> {
  if (!isNative()) return;
  const me = await identity();
  await ShareBox.subscribe({ to: me.id, alert }).catch((error) => setMailError(messageOf(error)));
}

/** Send my card again to everyone I have — how a new name reaches them. */
export async function announce(to: Person[]): Promise<void> {
  for (const person of to) {
    await sayHello(person).catch((error) => setMailError(messageOf(error)));
  }
}

/** A short sound: something arrived while the app is open. */
export const chime = (): Promise<void> => ShareBox.chime().catch(() => undefined);

export function settleRequest(id: string): void {
  commit({ ...inbox, requests: inbox.requests.filter((r) => r.id !== id) });
}

export function settleThought(id: string): void {
  commit({ ...inbox, thoughts: inbox.thoughts.filter((t) => t.id !== id) });
}

/** Forget everything waiting from someone — they were removed or blocked. */
export function dropFrom(personId: string): void {
  commit({
    requests: inbox.requests.filter((r) => r.card.id !== personId),
    thoughts: inbox.thoughts.filter((t) => t.from !== personId),
  });
}
