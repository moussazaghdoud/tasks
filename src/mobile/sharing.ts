import { useSyncExternalStore } from 'react';
import { haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNative } from '@/lib/native/platform';
import { readCard, type Card } from '@/lib/share/card';
import { identity, knownIdentity } from '@/lib/share/identity';
import {
  announce,
  collect,
  messageOf,
  dropFrom,
  listenForMail,
  sayHello,
  sendThought,
  settleRequest,
  settleThought,
  sharingAvailable,
  type ContactRequest,
  type Incoming,
} from '@/lib/share/mailbox';
import { addPerson, blockPerson, people, personOf, removePerson, type Person } from '@/lib/share/people';
import type { Task } from '@/domain/types';
import { toast } from '@/store/toast';
import { ws } from '@/store/workspace';
import { t } from './i18n';
import { st } from './shareI18n';

/**
 * What the screens do when they send, receive, add or block — the moves
 * between the mailbox, the people book and the list of thoughts.
 */

const REPORT_TO = 'iHenceteam@gmail.com';

/** Add the person on a card — scanned, or opened from a link — and say hello. */
export async function addFromCard(card: Card): Promise<void> {
  const me = await identity();
  if (card.id === me.id) return;
  const name = card.name || st('someone');
  if (personOf(card.id)) {
    addPerson(card); // their latest name and key
    toast(st('already_added', { name }));
    return;
  }
  addPerson(card);
  haptic('success');
  toast(st('added_person', { name }));
  // Their card is enough to send them thoughts; the hello lets them add us back.
  await sayHello({ ...card, addedAt: '' }).catch((error) => toast(st('icloud_failed', { why: messageOf(error) })));
}

/**
 * A link or a QR's text: add whoever's card it holds. False when it holds
 * none. Without a name of your own yet, the card waits while People asks for
 * one — a hello with no name arrives as "Someone".
 */
export function addFromText(text: string): boolean {
  const card = readCard(text);
  if (!card) return false;
  if (knownIdentity()?.name) void addFromCard(card);
  else setPending(card);
  return true;
}

let pending: Card | null = null;
const pendingListeners = new Set<() => void>();
function setPending(next: Card | null): void {
  pending = next;
  pendingListeners.forEach((l) => l());
}

/** A card opened before you had a name, waiting for one. */
export const usePendingCard = (): Card | null =>
  useSyncExternalStore(
    (on) => {
      pendingListeners.add(on);
      return () => pendingListeners.delete(on);
    },
    () => pending,
    () => null,
  );

export const dropPending = (): void => setPending(null);

/** Your name is set: add whoever was waiting for it. */
export function addPending(): void {
  const card = pending;
  setPending(null);
  if (card) void addFromCard(card);
}

/** Your name changed: everyone you have gets the new one. */
export function announceName(): void {
  void announce(people());
}

/** A code copied from a message — Signal, WhatsApp, Mail. */
export async function pasteCode(): Promise<void> {
  let text = '';
  try {
    const { Clipboard } = await import('@capacitor/clipboard');
    text = (await Clipboard.read()).value ?? '';
  } catch {
    /* nothing to paste */
  }
  if (!addFromText(text)) toast(st('paste_none'));
}

/**
 * Ask once to show notifications: iCloud's notice that something arrived is
 * shown only if they are allowed. Then subscribe again, so the iPhone is
 * registered with what it is now allowed to do.
 */
export async function allowNotices(): Promise<void> {
  if (!isNative()) return;
  await ensureNotificationPermission();
  void listenForMail(st('share_push'));
}

/**
 * Send a thought. Transferring takes it off this list — with an undo, which
 * brings back your copy; theirs has already left.
 */
export async function send(task: Task, to: Person[], mode: 'copy' | 'transfer'): Promise<void> {
  if (!(await sharingAvailable())) {
    toast(st('share_unavailable'));
    return;
  }
  // The first send is when a notice from the other side starts to matter.
  void allowNotices();
  const failed = await sendThought(to, {
    v: 1,
    title: task.title,
    notes: task.notes,
    important: task.priority === 'important',
    reminderAt: task.reminderAt && Date.parse(task.reminderAt) > Date.now() ? task.reminderAt : null,
    mode,
  });
  const reached = to.filter((p) => !failed.includes(p));
  if (failed.length) toast(st('send_failed', { who: names(failed) }));
  if (!reached.length) return;
  haptic('success');
  if (mode === 'transfer') {
    const undo = ws().transact(() => ws().remove([task.id]));
    toast(st('transferred_to', { who: names(reached) }), { action: { label: t('undo'), run: undo } });
  } else {
    toast(st('sent_to', { who: names(reached) }));
  }
}

const names = (people: Person[]): string => people.map((p) => p.name || st('someone')).join(', ');

export function acceptThought(item: Incoming): void {
  const { thought } = item;
  ws().addTask({
    title: thought.title,
    notes: thought.notes,
    space: 'business',
    priority: thought.important ? 'important' : 'normal',
    reminderAt: thought.reminderAt && Date.parse(thought.reminderAt) > Date.now() ? thought.reminderAt : null,
  });
  settleThought(item.id);
  haptic('success');
  toast(st('accepted'));
}

export function declineThought(item: Incoming): void {
  settleThought(item.id);
  toast(st('declined'));
}

export function acceptRequest(request: ContactRequest): void {
  addPerson(request.card);
  settleRequest(request.id);
  haptic('success');
  toast(st('added_person', { name: request.card.name || st('someone') }));
}

export const declineRequest = (request: ContactRequest): void => settleRequest(request.id);

export function remove(person: { id: string; name: string }): void {
  removePerson(person.id);
  dropFrom(person.id);
  toast(st('removed_person', { name: person.name || st('someone') }));
}

export function block(person: { id: string; name: string }): void {
  blockPerson(person.id);
  dropFrom(person.id);
  haptic('medium');
  toast(st('blocked_person', { name: person.name || st('someone') }));
}

/** Report someone to the developer, by an email the person writes and sends. */
export function report(person: { id: string; name: string }): void {
  const subject = encodeURIComponent(st('report_subject'));
  const body = encodeURIComponent(st('report_body', { id: person.id, name: person.name || st('someone') }));
  window.location.href = `mailto:${REPORT_TO}?subject=${subject}&body=${body}`;
}

/**
 * Collect the mailbox at launch, on coming back to the screen, and every
 * minute while it is open; and ask iCloud to notify this iPhone when
 * something arrives while it is not.
 */
export async function initSharing(): Promise<void> {
  if (!isNative() || !(await sharingAvailable())) return;
  void listenForMail(st('share_push'));
  void collect();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void collect();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void collect();
  }, 60_000);
}
