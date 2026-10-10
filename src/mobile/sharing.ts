import { useSyncExternalStore } from 'react';
import { haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNative } from '@/lib/native/platform';
import { readCard, type Card } from '@/lib/share/card';
import { randomId } from '@/lib/share/crypto';
import { forget, keepSent, type Sent } from '@/lib/share/outbox';
import { identity, knownIdentity } from '@/lib/share/identity';
import {
  announce,
  chime,
  collect,
  messageOf,
  dropFrom,
  listenForMail,
  onSignal,
  sayHello,
  sendSignal,
  sendThought,
  settleRequest,
  settleThought,
  sharingAvailable,
  type ContactRequest,
  type Incoming,
  type SharedThought,
  type Signal,
} from '@/lib/share/mailbox';
import { isPro } from '@/lib/pro/store';
import { addPerson, blockPerson, people, personOf, removePerson, type Person } from '@/lib/share/people';
import type { Task } from '@/domain/types';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
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
    // They may have removed us since: say hello again, so they can take us back.
    await sayHello({ ...card, addedAt: '' }).catch((error) => toast(st('icloud_failed', { why: messageOf(error) })));
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
/**
 * Send a thought. To a team, it carries who else received it, so whoever
 * takes it can tell the others; kept here (Duplicate), it remembers to whom
 * it went, so what comes back — taken, done — can show on it.
 */
export async function send(task: Task, to: Person[], mode: 'copy' | 'transfer', team?: string): Promise<void> {
  if (!(await sharingAvailable())) {
    toast(st('share_unavailable'));
    return;
  }
  // The first send is when a notice from the other side starts to matter.
  void allowNotices();
  const thought: SharedThought = {
    v: 1 as const,
    ref: randomId(),
    title: task.title,
    notes: task.notes,
    important: task.priority === 'important',
    reminderAt: task.reminderAt && Date.parse(task.reminderAt) > Date.now() ? task.reminderAt : null,
    mode,
    team: team ? { name: team, members: to.map((p) => ({ id: p.id, name: p.name, publicKey: p.publicKey })) } : undefined,
  };
  const ref = thought.ref!;
  const failed = await sendThought(to, thought);
  const reached = to.filter((p) => !failed.includes(p));
  if (failed.length) toast(st('send_failed', { who: names(failed) }));
  if (!reached.length) return;
  // Kept, whole, until each of them confirms it arrived.
  keepSent(
    reached.map((p) => ({
      ref,
      to: { id: p.id, name: p.name },
      thought: { title: thought.title, notes: thought.notes, important: thought.important, reminderAt: thought.reminderAt, space: task.space },
      mode,
      sentAt: new Date().toISOString(),
    })),
  );
  haptic('success');
  if (mode === 'transfer') {
    const undo = ws().transact(() => ws().remove([task.id]));
    toast(st('transferred_to', { who: names(reached) }), { action: { label: t('undo'), run: undo } });
  } else {
    ws().updateTask(task.id, { delegated: { ref, to: reached.map((p) => ({ id: p.id, name: p.name })), team } });
    toast(st('sent_to', { who: names(reached) }));
  }
}

/** Send again something not yet picked up. The recipient takes it in only once. */
export async function resend(entry: Sent): Promise<void> {
  const person = personOf(entry.to.id);
  if (!person) {
    toast(st('resend_gone'));
    return;
  }
  const { title, notes, important, reminderAt } = entry.thought;
  const failed = await sendThought([person], { v: 1, ref: entry.ref, title, notes, important, reminderAt, mode: entry.mode });
  toast(failed.length ? st('send_failed', { who: names([person]) }) : st('sent_to', { who: names([person]) }));
}

/** Put a thought not yet picked up back in the list, and stop waiting for it. */
export function restore(entry: Sent): void {
  const { title, notes, important, reminderAt, space } = entry.thought;
  ws().addTask({
    title,
    notes,
    space: space ?? 'business',
    priority: important ? 'important' : 'normal',
    reminderAt: reminderAt && Date.parse(reminderAt) > Date.now() ? reminderAt : null,
  });
  forget(entry);
  haptic('success');
  toast(st('restored'));
}

const names = (people: Person[]): string => people.map((p) => p.name || st('someone')).join(', ');

export function acceptThought(item: Incoming): void {
  const { thought } = item;
  const sender = personOf(item.from);
  ws().addTask({
    title: thought.title,
    notes: thought.notes,
    space: 'business',
    // Kept on the thought, so it reads as someone else's in the list, and so
    // what happens to it can be told back to them.
    sharedBy: { id: item.from, name: sender?.name ?? '', ref: thought.ref, team: thought.team, takenBy: item.takenBy },
    priority: thought.important ? 'important' : 'normal',
    reminderAt: thought.reminderAt && Date.parse(thought.reminderAt) > Date.now() ? thought.reminderAt : null,
  });
  settleThought(item.id);
  haptic('success');
  toast(st('accepted'));
  // Sent to a team: tell the sender and the others that it is taken, so
  // nobody does it twice.
  if (thought.team && thought.ref && sender) {
    void sendSignal('taken', [sender, ...thought.team.members], { ref: thought.ref, title: thought.title });
  }
}

/**
 * Something that came back about a thought: someone took it, or finished
 * it. Shown on the thought it concerns — the copy kept by the sender, or the
 * same thought received by the rest of the team — and, for the sender on
 * Pro, said in a moment's message.
 */
function hear(signal: Signal): void {
  const name = signal.from.name || st('someone');
  const tasks = Object.values(ws().tasks);
  let mine: Task | undefined;
  for (const task of tasks) {
    if (task.delegated?.ref === signal.ref) {
      mine = task;
      ws().updateTask(
        task.id,
        signal.kind === 'done'
          ? { delegated: { ...task.delegated, doneBy: { id: signal.from.id, name, at: new Date().toISOString() } } }
          : { delegated: { ...task.delegated, takenBy: { id: signal.from.id, name } } },
      );
    } else if (signal.kind === 'taken' && task.sharedBy?.ref === signal.ref && !task.sharedBy.takenBy) {
      ws().updateTask(task.id, { sharedBy: { ...task.sharedBy, takenBy: { id: signal.from.id, name } } });
    }
  }
  if (!isPro()) return;
  const title = signal.title ?? mine?.title ?? '';
  if (signal.kind === 'done') toast(st('finished_toast', { name, title }));
  else if (mine) toast(st('took_toast', { name, title }));
}

/**
 * A thought someone sent, finished here: tell them, once. Watched on every
 * change, so it works however it was finished — a tap, a swipe, a voice.
 */
function watchCompletions(): void {
  useWorkspace.subscribe((now, before) => {
    if (now.tasks === before.tasks) return;
    for (const task of Object.values(now.tasks)) {
      const from = task.sharedBy;
      if (!from?.ref || from.doneSent || task.status !== 'done') continue;
      if (before.tasks[task.id]?.status === 'done') continue;
      const sender = personOf(from.id);
      if (!sender) continue;
      ws().updateTask(task.id, { sharedBy: { ...from, doneSent: true } });
      void sendSignal('done', [sender], { ref: from.ref, title: task.title });
    }
  });
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

/** Declined: and whatever they sent while waiting goes with them. */
export function declineRequest(request: ContactRequest): void {
  settleRequest(request.id);
  dropFrom(request.card.id);
}

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
  onSignal(hear);
  watchCompletions();
  void listenForMail(st('share_push'));
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void check();
  }, 60_000);
}

/** Collect, and make a small sound when something new is there. */
async function check(): Promise<void> {
  if ((await collect()) > 0) {
    void chime();
    haptic('success');
  }
}
