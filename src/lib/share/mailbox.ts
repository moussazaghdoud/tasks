import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';
import type { Card } from './card';
import { openAnonymous, openFrom, sealAnonymous, sealFor } from './crypto';
import { identity } from './identity';
import { ShareBox, type Envelope, type NoticeStatus } from './native';
import { delivered } from './outbox';
import { addPerson, isBlocked, personOf, type Person } from './people';

/**
 * Sending a thought to someone, and collecting what others sent.
 *
 * Envelopes go through the app's public iCloud database (ShareBoxPlugin):
 * addressed to an anonymous identifier, sealed so that only the recipient can
 * open them, and deleted once they have been read. What has been read waits
 * here, on the phone, until it is accepted or declined.
 *
 * Kinds of envelope:
 * - `hello`: "here is my card" — so the recipient can add the sender back.
 * - `note`: a thought, sealed between the sender's key and the recipient's,
 *   with the sender's card beside it.
 * - `ack`: "your thought arrived" — the receipt that lets the sender stop
 *   keeping it (see outbox.ts).
 * - `thought`: the first beta's thoughts, read for as long as any are left.
 *
 * Nothing is deleted unread: an envelope this version cannot read — a newer
 * kind, or one it fails to open — stays in iCloud for a later version, and is
 * only cleared after a month. Only blocked senders' envelopes go unopened.
 */

export type { NoticeStatus } from './native';

/** What travels in a `note` envelope. */
export interface SharedThought {
  v: 1;
  /** Names this send in the recipient's receipt, and makes a resend harmless. */
  ref?: string;
  title: string;
  notes: string;
  important: boolean;
  reminderAt: string | null;
  /** Whether the sender kept a copy. */
  mode: 'copy' | 'transfer';
}

/** Someone who would like to be able to send you thoughts. */
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
  /** Sends already taken in (`from:ref`), so a resend or a re-read never doubles one. */
  seen: string[];
}

const KEY = 'hence.inbox';
const EMPTY: Inbox = { requests: [], thoughts: [], seen: [] };
const MONTH = 30 * 24 * 3600 * 1000;

function load(): Inbox {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Inbox>) : {};
    return { requests: parsed.requests ?? [], thoughts: parsed.thoughts ?? [], seen: parsed.seen ?? [] };
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

async function myCard(): Promise<Card> {
  const me = await identity();
  return { id: me.id, name: me.name, publicKey: me.keys.publicKey };
}

/** Tell someone you added them, with your card, so they can add you back. */
export async function sayHello(to: Person): Promise<void> {
  const card = await myCard();
  await ShareBox.post({ to: to.id, kind: 'hello', from: card.id, data: await sealAnonymous(to.publicKey, { card }) });
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
  const card = await myCard();
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

/** Collect the mailbox. Resolves with how many new things arrived. */
export function collect(): Promise<number> {
  if (!isNative()) return Promise.resolve(0);
  collecting ??= collectNow().finally(() => {
    collecting = null;
  });
  return collecting;
}

/** A thought as it is kept: only the fields expected, of the types expected. */
function clean(thought: SharedThought): SharedThought {
  return {
    v: 1,
    ref: typeof thought.ref === 'string' ? thought.ref.slice(0, 64) : undefined,
    title: thought.title.slice(0, 2000),
    notes: typeof thought.notes === 'string' ? thought.notes.slice(0, 10000) : '',
    important: thought.important === true,
    reminderAt: typeof thought.reminderAt === 'string' && !Number.isNaN(Date.parse(thought.reminderAt)) ? thought.reminderAt : null,
    mode: thought.mode === 'transfer' ? 'transfer' : 'copy',
  };
}

const readable = (thought: SharedThought | null | undefined): thought is SharedThought =>
  thought?.v === 1 && typeof thought.title === 'string' && !!thought.title.trim();

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
  const seen = new Set(inbox.seen);
  /** Read, or from someone blocked: only these leave iCloud. */
  const done: string[] = [];
  const receipts: Array<{ to: string; key: string; ref: string }> = [];
  let arrived = 0;

  /** Keep a thought — once, however many times it is sent or read. */
  const take = (envelope: Envelope, from: string, thought: SharedThought) => {
    const key = thought.ref ? `${from}:${thought.ref}` : `${from}:${envelope.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    thoughts.push({ id: envelope.id, from, at: envelope.sentAt, thought: clean(thought) });
    arrived++;
  };

  for (const envelope of envelopes) {
    if (isBlocked(envelope.from)) {
      done.push(envelope.id);
      continue;
    }
    try {
      if (envelope.kind === 'hello') {
        const { card } = await openAnonymous<{ card: Card }>(me.keys.privateJwk, envelope.data);
        if (!card?.id || card.id !== envelope.from) throw new Error('mismatched card');
        done.push(envelope.id);
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
        if (!card?.id || card.id !== envelope.from || typeof sealed !== 'string') throw new Error('mismatched card');
        const known = personOf(card.id);
        // Someone in the book is held to the key they were added with: a
        // stranger cannot borrow their identifier. Someone not in it proves
        // only that they hold the key on their own card.
        const key = known ? known.publicKey : card.publicKey;
        const thought = await openFrom<SharedThought>(me.keys.privateJwk, key, sealed);
        if (!readable(thought)) throw new Error('unreadable thought');
        done.push(envelope.id);
        // From someone removed, or never added: it waits behind a request,
        // shown once they are taken (back) in, dropped if they are declined.
        if (!known && !requests.some((r) => r.card.id === card.id)) {
          requests.push({ id: `${envelope.id}-hello`, card, at: envelope.sentAt });
        }
        take(envelope, card.id, thought);
        if (thought.ref) receipts.push({ to: card.id, key, ref: thought.ref });
      } else if (envelope.kind === 'ack') {
        const sender = personOf(envelope.from);
        if (!sender) throw new Error('receipt from a stranger');
        const { ref } = await openFrom<{ ref: string }>(me.keys.privateJwk, sender.publicKey, envelope.data);
        done.push(envelope.id);
        if (typeof ref === 'string') delivered(ref, sender.id);
      } else if (envelope.kind === 'thought') {
        const sender = personOf(envelope.from);
        if (!sender) throw new Error('old thought from a stranger');
        const thought = await openFrom<SharedThought>(me.keys.privateJwk, sender.publicKey, envelope.data);
        if (!readable(thought)) throw new Error('unreadable thought');
        done.push(envelope.id);
        take(envelope, sender.id, thought);
      } else {
        throw new Error(`unknown kind ${envelope.kind}`);
      }
    } catch {
      // Not readable by this version, or not yet (a sender not yet taken
      // back): left in iCloud, for a month, rather than lost.
      if (Date.now() - Date.parse(envelope.sentAt) > MONTH) done.push(envelope.id);
    }
  }

  // Kept here first, then deleted there: never the other way round.
  commit({ requests, thoughts, seen: [...seen].slice(-1000) });
  if (done.length) await ShareBox.remove({ ids: done }).catch(() => undefined);

  // Tell each sender their thought arrived, so they stop keeping it.
  for (const receipt of receipts) {
    const data = await sealFor(me.keys.privateJwk, receipt.key, { ref: receipt.ref });
    await ShareBox.post({ to: receipt.to, kind: 'ack', from: me.id, data }).catch(() => undefined);
  }
  return arrived;
}

/** Ask iCloud to notify this iPhone when something arrives. */
export async function listenForMail(alert: string): Promise<void> {
  if (!isNative()) return;
  const me = await identity();
  // A refusal here is shown by the notice line in People, not as an error:
  // the background look announces arrivals all the same.
  await ShareBox.subscribe({ to: me.id, alert }).catch(() => undefined);
}

/** Where each link of the notice of arrival stands, for People to show. */
export async function noticeStatus(): Promise<NoticeStatus | null> {
  if (!isNative()) return null;
  const me = await identity();
  return ShareBox.status({ to: me.id }).catch(() => null);
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

/** Forget everything waiting from someone — they were removed, blocked or declined. */
export function dropFrom(personId: string): void {
  commit({
    ...inbox,
    requests: inbox.requests.filter((r) => r.card.id !== personId),
    thoughts: inbox.thoughts.filter((t) => t.from !== personId),
  });
}
