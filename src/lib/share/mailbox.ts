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

/** Send a thought to each of these people. Resolves with those it could not reach. */
export async function sendThought(to: Person[], thought: SharedThought): Promise<Person[]> {
  const me = await identity();
  const failed: Person[] = [];
  for (const person of to) {
    try {
      const data = await sealFor(me.keys.privateJwk, person.publicKey, thought);
      await ShareBox.post({ to: person.id, kind: 'thought', from: me.id, data });
    } catch {
      failed.push(person);
    }
  }
  return failed;
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
  } catch {
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
        if (requests.some((r) => r.card.id === card.id)) continue;
        requests.push({ id: envelope.id, card, at: envelope.sentAt });
        arrived++;
      } else if (envelope.kind === 'thought') {
        const sender = personOf(envelope.from);
        // From someone not in the book: nothing to open it with.
        if (!sender) continue;
        const thought = await openFrom<SharedThought>(me.keys.privateJwk, sender.publicKey, envelope.data);
        if (thought?.v !== 1 || typeof thought.title !== 'string' || !thought.title.trim()) continue;
        thoughts.push({
          id: envelope.id,
          from: sender.id,
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
  await ShareBox.subscribe({ to: me.id, alert }).catch(() => undefined);
}

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
