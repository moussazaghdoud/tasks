import { registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import type { Task } from '@/domain/types';
import { isNative } from '@/lib/native/platform';

/**
 * The Microsoft calendar connection.
 *
 * Everything that touches a token happens in Swift: the token endpoint
 * refuses cross-origin redemption for a native client, and the refresh token
 * belongs in the Keychain rather than in web storage. This side asks for a
 * sign-in and asks for events; it never holds a credential.
 */
interface MicrosoftPlugin {
  signIn(options: { clientId: string; tenantId: string; scopes?: string }): Promise<Account>;
  signOut(): Promise<{ connected: boolean }>;
  account(): Promise<Account>;
  createEvent(options: {
    subject: string;
    body: string;
    start: string;
    end: string;
    timeZone: string;
    allDay: boolean;
  }): Promise<{ id: string; webLink: string }>;
}

export interface Account {
  connected: boolean;
  account: string;
}

const Microsoft = registerPlugin<MicrosoftPlugin>('Microsoft');

const CLIENT_ID = (import.meta.env.VITE_M365_CLIENT_ID as string | undefined)?.trim() ?? '';
const TENANT_ID = (import.meta.env.VITE_M365_TENANT_ID as string | undefined)?.trim() ?? '';

/** Whether this build was given an app registration to talk to. */
export const calendarConfigured = (): boolean => isNative() && !!CLIENT_ID && !!TENANT_ID;

/* ---- connection state, shared with the interface ---- */

let state: Account = { connected: false, account: '' };
const listeners = new Set<() => void>();

const publish = (next: Account) => {
  state = next;
  for (const notify of listeners) notify();
};

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useMicrosoft = (): Account => useSyncExternalStore(subscribe, () => state, () => state);

/** Read the connection the app already has, on launch. */
export async function refreshAccount(): Promise<void> {
  if (!calendarConfigured()) return;
  try {
    publish(await Microsoft.account());
  } catch {
    publish({ connected: false, account: '' });
  }
}

/** Ask the phone, rather than trusting what this module last remembered. */
export async function isConnected(): Promise<boolean> {
  if (!calendarConfigured()) return false;
  try {
    const result = await Microsoft.account();
    publish(result);
    return result.connected;
  } catch {
    return false;
  }
}

export async function connect(): Promise<Account> {
  const result = await Microsoft.signIn({ clientId: CLIENT_ID, tenantId: TENANT_ID });
  publish(result);
  return result;
}

export async function disconnect(): Promise<void> {
  await Microsoft.signOut();
  publish({ connected: false, account: '' });
}

/* ---- events ---- */

const pad = (n: number) => String(n).padStart(2, '0');
/** Graph wants local wall time with no zone suffix, plus the zone beside it. */
const wall = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

/**
 * Put the thought in the calendar.
 *
 * A thought with no date becomes an hour from now rather than refusing: the
 * point is to get it into the day, and the calendar is where it gets moved.
 */
export async function createEvent(task: Task): Promise<{ webLink: string }> {
  const allDay = !!task.dueDate && !task.dueTime;
  let start: Date;

  if (task.dueDate) {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    const [hh, mm] = (task.dueTime ?? '09:00').split(':').map(Number);
    start = new Date(y, m - 1, d, hh, mm);
  } else {
    start = new Date(Date.now() + 60 * 60_000);
    start.setMinutes(0, 0, 0);
  }

  const end = new Date(start.getTime() + (task.estimatedMinutes ?? 60) * 60_000);
  const steps = task.subtasks.filter((s) => !s.done).map((s) => `• ${s.title}`);
  const body = [task.notes?.trim(), steps.join('\n')].filter(Boolean).join('\n\n');

  const result = await Microsoft.createEvent({
    subject: task.title,
    body,
    start: wall(start),
    end: wall(end),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    allDay,
  });
  return { webLink: result.webLink };
}
