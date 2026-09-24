import { registerPlugin } from '@capacitor/core';
import type { Task } from '@/domain/types';
import { isNative } from '@/lib/native/platform';
import type { Account, Meeting } from './calendarTypes';

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
export const configured = (): boolean => isNative() && (usable(PUBLIC) || usable(WORK));

/**
 * Sign in with the registration that fits this address. The address also goes
 * to Microsoft as a hint, so its page opens with the account already chosen.
 */
export async function signIn(email?: string): Promise<Account> {
  const registration = registrationFor(email ?? '');
  if (!registration) throw Object.assign(new Error('No Microsoft registration configured'), { code: 'unconfigured' });
  return Microsoft.signIn({ ...registration, ...(email ? { loginHint: email.trim() } : {}) });
}

export const signOut = (): Promise<{ connected: boolean }> => Microsoft.signOut();

export const account = (): Promise<Account> => Microsoft.account();

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
