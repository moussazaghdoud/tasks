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
  signIn(options: { clientId: string; tenantId: string; scopes?: string; loginHint?: string }): Promise<Account>;
  signOut(): Promise<{ connected: boolean }>;
  account(): Promise<Account>;
  todayEvents(options?: { days?: number }): Promise<{ events: Meeting[] }>;
  createEvent(options: {
    subject: string;
    body: string;
    start: string;
    end: string;
    timeZone: string;
    allDay: boolean;
  }): Promise<{ id: string; webLink: string }>;
}

export interface Meeting {
  subject: string;
  /** Local wall time, no zone suffix: Graph was asked for this phone’s zone. */
  start: string;
  end: string;
  allDay: boolean;
  showAs: string;
}

export interface Account {
  connected: boolean;
  account: string;
}

const Microsoft = registerPlugin<MicrosoftPlugin>('Microsoft');

// Each read written out whole: Vite substitutes build variables only where it
// can see the literal name, and a computed one would ship empty.
const clean = (value: string | undefined) => (value ?? '').trim();

/** An app registration: who Microsoft is asked on behalf of. */
interface Registration {
  clientId: string;
  tenantId: string;
}

/**
 * Two registrations, chosen by the address someone signs in with.
 *
 * The public one lives in a directory the app's owner controls and accepts
 * any Microsoft account. The optional work one is registered inside a single
 * organisation, where it counts as an internal app — which is what lets
 * people there connect their calendar without their IT approving an outside
 * publisher. It is used only for that organisation's domain, and nobody else
 * ever sees it.
 */
const PUBLIC: Registration = {
  clientId: clean(import.meta.env.VITE_M365_CLIENT_ID as string | undefined),
  tenantId: clean(import.meta.env.VITE_M365_TENANT_ID as string | undefined),
};
const WORK: Registration & { domain: string } = {
  clientId: clean(import.meta.env.VITE_M365_WORK_CLIENT_ID as string | undefined),
  tenantId: clean(import.meta.env.VITE_M365_WORK_TENANT_ID as string | undefined),
  domain: clean(import.meta.env.VITE_M365_WORK_DOMAIN as string | undefined).toLowerCase().replace(/^@/, ''),
};

const usable = (r: Registration) => !!r.clientId && !!r.tenantId;

export function registrationFor(email: string): Registration | null {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  if (usable(WORK) && WORK.domain && domain === WORK.domain) return WORK;
  return usable(PUBLIC) ? PUBLIC : null;
}

/** Whether this build was given any registration to talk to. */
export const calendarConfigured = (): boolean => isNative() && (usable(PUBLIC) || usable(WORK));

/* ---- connection state, shared with the interface ---- */

/**
 * `checked` separates "not connected" from "not asked yet". Without it the
 * first frames after launch read as disconnected, and the agenda told a
 * connected person to go and connect.
 */
export interface Connection extends Account {
  checked: boolean;
}

let state: Connection = { connected: false, account: '', checked: false };
const listeners = new Set<() => void>();

const publish = (next: Account) => {
  state = { ...next, checked: true };
  for (const notify of listeners) notify();
};

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useMicrosoft = (): Connection => useSyncExternalStore(subscribe, () => state, () => state);

/**
 * Read the connection the phone already holds.
 *
 * The sign-in survives the app closing — it lives in the Keychain — but
 * nothing asked about it at launch, so a restarted app believed it was
 * disconnected until Settings happened to be opened.
 */
export async function refreshAccount(): Promise<void> {
  if (!calendarConfigured()) {
    publish({ connected: false, account: '' });
    return;
  }
  try {
    publish(await Microsoft.account());
  } catch {
    publish({ connected: false, account: '' });
  }
}

/* ---- the last agenda, kept on the phone ---- */

/**
 * The most recent agenda, so it appears the instant the app opens and still
 * reads on a plane. Kept on the device rather than on a server: the phone
 * already holds the connection, so a copy elsewhere would only add a place
 * for your meeting titles to be.
 */
const AGENDA_KEY = 'hence.agenda';

export interface CachedAgenda {
  at: number;
  meetings: Meeting[];
}

export function readAgendaCache(): CachedAgenda | null {
  try {
    const raw = localStorage.getItem(AGENDA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAgenda;
    return Array.isArray(parsed?.meetings) && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAgendaCache(meetings: Meeting[]): void {
  try {
    localStorage.setItem(AGENDA_KEY, JSON.stringify({ at: Date.now(), meetings }));
  } catch {
    /* storage full or unavailable; the agenda simply loads from the network */
  }
}

function clearAgendaCache(): void {
  try {
    localStorage.removeItem(AGENDA_KEY);
  } catch {
    /* nothing to clear */
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

/**
 * Sign in with the registration that fits this address. The address also goes
 * to Microsoft as a hint, so its page opens with the account already chosen.
 */
export async function connect(email: string): Promise<Account> {
  const registration = registrationFor(email);
  if (!registration) throw Object.assign(new Error('No Microsoft registration configured'), { code: 'unconfigured' });
  const result = await Microsoft.signIn({ ...registration, loginHint: email.trim() });
  publish(result);
  return result;
}

export async function disconnect(): Promise<void> {
  // Disconnecting means the calendar leaves the phone, the copy included.
  clearAgendaCache();
  await Microsoft.signOut();
  publish({ connected: false, account: '' });
}

/** Meetings from the start of today for `days` days, in the order they happen. */
export async function listAgenda(days = 2): Promise<Meeting[]> {
  const { events } = await Microsoft.todayEvents({ days });
  return events;
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
