import { registerPlugin } from '@capacitor/core';
import type { Task } from '@/domain/types';
import { isNative } from '@/lib/native/platform';
import type { Account, Meeting } from './calendarTypes';

/**
 * The Google calendar connection.
 *
 * The same arrangement as Microsoft's: everything that touches a token happens
 * in Swift, because the refresh token belongs in the Keychain and Google's
 * token endpoint will not be called from a web view. This side asks for a
 * sign-in and asks for events; it never holds a credential.
 *
 * One identifier configures it. Google's installed-app flow takes no secret —
 * PKCE proves the exchange came from the app that started it — and the
 * redirect is the client ID reversed, which the plugin works out itself.
 */
interface GooglePlugin {
  signIn(options: { clientId: string; loginHint?: string }): Promise<Account>;
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

const Google = registerPlugin<GooglePlugin>('Google');

// Written out whole: Vite substitutes a build variable only where it can see
// the literal name, and a computed one would ship empty.
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';

export const configured = (): boolean => isNative() && !!CLIENT_ID;

export async function signIn(email?: string): Promise<Account> {
  if (!configured()) throw Object.assign(new Error('No Google client configured'), { code: 'unconfigured' });
  return Google.signIn({ clientId: CLIENT_ID, ...(email ? { loginHint: email.trim() } : {}) });
}

export const signOut = (): Promise<{ connected: boolean }> => Google.signOut();

export const account = (): Promise<Account> => Google.account();

export async function listAgenda(days: number): Promise<Meeting[]> {
  const { events } = await Google.todayEvents({ days });
  return events;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local wall time with no zone suffix; the zone travels beside it. */
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

  const result = await Google.createEvent({
    subject: task.title,
    body,
    start: wall(start),
    end: wall(end),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    allDay,
  });
  return { webLink: result.webLink };
}
