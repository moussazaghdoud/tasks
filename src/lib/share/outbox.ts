import { useSyncExternalStore } from 'react';

/**
 * What was sent and not yet picked up.
 *
 * A thought that leaves this phone is kept here — whole, so it can be put
 * back — until the recipient's Hence confirms it arrived. A transfer can
 * therefore never vanish between two phones: until that receipt, it can be
 * sent again or restored to the list.
 */
export interface Sent {
  /** Shared by every recipient of one send; their receipt names it. */
  ref: string;
  to: { id: string; name: string };
  thought: { title: string; notes: string; important: boolean; reminderAt: string | null; space?: 'business' | 'private' };
  mode: 'copy' | 'transfer';
  sentAt: string;
}

const KEY = 'hence.outbox';

function load(): Sent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Sent[]) : [];
  } catch {
    return [];
  }
}

let outbox: Sent[] = load();
const listeners = new Set<() => void>();

function commit(next: Sent[]): void {
  outbox = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept for this session only */
  }
  listeners.forEach((l) => l());
}

export const waitingFor = (): Sent[] => outbox;

export function keepSent(entries: Sent[]): void {
  const fresh = entries.filter((e) => !outbox.some((o) => o.ref === e.ref && o.to.id === e.to.id));
  if (fresh.length) commit([...outbox, ...fresh]);
}

/** Their Hence has it: nothing more to keep. */
export function delivered(ref: string, by: string): void {
  if (outbox.some((o) => o.ref === ref && o.to.id === by)) commit(outbox.filter((o) => !(o.ref === ref && o.to.id === by)));
}

export const forget = (entry: Sent): void => delivered(entry.ref, entry.to.id);

/** Back from the iCloud copy: what was still waiting, added to what is here. */
export const restoreSent = (saved: Sent[] | undefined): void => keepSent(Array.isArray(saved) ? saved : []);

/** Be told when the waiting list changes — for the iCloud copy. */
export function onOutboxChange(run: () => void): () => void {
  listeners.add(run);
  return () => listeners.delete(run);
}

export function useOutbox(): Sent[] {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => outbox,
    () => [],
  );
}
