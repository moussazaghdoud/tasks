import { useSyncExternalStore } from 'react';
import type { Task } from '@/domain/types';
import type { Account, Meeting, ProviderId } from './calendarTypes';
import * as google from './google';
import * as microsoft from './microsoft';

export type { Meeting, Account, ProviderId } from './calendarTypes';

/**
 * Every calendar the app can connect to, behind one door.
 *
 * Outlook came first and the rest of the app was written against it; a second
 * calendar would have meant "if Google … else if Microsoft …" in the agenda,
 * in Settings and in the share sheet. Instead each service is a small module
 * of its own — sign in, sign out, list, create — and this is where they are
 * treated as interchangeable. A third one is a file and a line in the list.
 *
 * Both can be connected at once. The agenda then shows one week made of both
 * calendars, in time order, which is what someone with a work Outlook and a
 * personal Google actually wants to see.
 */
export interface Provider {
  id: ProviderId;
  /** Name shown in Settings; not translated, these are products. */
  label: string;
  configured(): boolean;
  /**
   * Whether the address is asked for before sign-in. Microsoft needs it to
   * pick a registration; Google shows its own account chooser.
   */
  asksEmail: boolean;
  signIn(email?: string): Promise<Account>;
  signOut(): Promise<unknown>;
  account(): Promise<Account>;
  listAgenda(days: number): Promise<Meeting[]>;
  createEvent(task: Task): Promise<{ webLink: string }>;
}

const PROVIDERS: Provider[] = [
  { id: 'microsoft', label: 'Outlook', asksEmail: true, ...microsoft },
  { id: 'google', label: 'Google Calendar', asksEmail: false, ...google },
];

/** The ones this build has identifiers for — the rest are not offered. */
export const providers = (): Provider[] => PROVIDERS.filter((p) => p.configured());

export const calendarConfigured = (): boolean => providers().length > 0;

const providerOf = (id: ProviderId): Provider => PROVIDERS.find((p) => p.id === id)!;

/* ---- connection state, shared with the interface ---- */

/**
 * `checked` separates "not connected" from "not asked yet". Without it the
 * first frames after launch read as disconnected, and the agenda told a
 * connected person to go and connect.
 */
export interface Connection extends Account {
  id: ProviderId;
  label: string;
  checked: boolean;
}

const blank = (p: Provider): Connection => ({
  id: p.id,
  label: p.label,
  connected: false,
  account: '',
  checked: false,
});

let state: Connection[] = PROVIDERS.map(blank);
const listeners = new Set<() => void>();

function publish(id: ProviderId, next: Account): void {
  state = state.map((c) => (c.id === id ? { ...c, ...next, checked: true } : c));
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Every configured calendar and whether it is connected. */
export const useCalendars = (): Connection[] =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

export const connectionOf = (id: ProviderId): Connection => state.find((c) => c.id === id)!;
export const connected = (): Connection[] => state.filter((c) => c.connected);
/** True once every configured calendar has been asked — see `checked`. */
export const allChecked = (): boolean => providers().every((p) => connectionOf(p.id).checked);
export const anyConnected = (): boolean => connected().length > 0;

/**
 * Read the connections the phone already holds.
 *
 * A sign-in survives the app closing — it lives in the Keychain — but nothing
 * asks about it at launch, so a restarted app would believe it is
 * disconnected until Settings happened to be opened.
 */
export async function refreshAccounts(): Promise<void> {
  await Promise.all(
    PROVIDERS.map(async (p) => {
      if (!p.configured()) {
        publish(p.id, { connected: false, account: '' });
        return;
      }
      try {
        publish(p.id, await p.account());
      } catch {
        publish(p.id, { connected: false, account: '' });
      }
    }),
  );
}

export async function connect(id: ProviderId, email?: string): Promise<Account> {
  const result = await providerOf(id).signIn(email);
  publish(id, result);
  return result;
}

export async function disconnect(id: ProviderId): Promise<void> {
  // Disconnecting means that calendar leaves the phone, the copy included:
  // the stored week holds meetings from both, and there is no telling them
  // apart afterwards.
  clearAgendaCache();
  await providerOf(id).signOut();
  publish(id, { connected: false, account: '' });
}

/* ---- the agenda ---- */

/** One week, from every connected calendar, in the order things happen. */
export async function listAgenda(days = 2): Promise<Meeting[]> {
  const live = connected();
  if (!live.length) throw Object.assign(new Error('No calendar connected'), { code: 'not_connected' });

  const results = await Promise.allSettled(live.map((c) => providerOf(c.id).listAgenda(days)));
  const meetings = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

  // One calendar failing while another answers is not worth an error screen —
  // but all of them failing is, and the first refusal explains it best.
  if (!meetings.length) {
    const failure = results.find((r) => r.status === 'rejected');
    if (failure && failure.status === 'rejected') throw failure.reason;
  }
  return meetings.sort((a, b) => a.start.localeCompare(b.start));
}

/** Add the thought to the first connected calendar. */
export async function createEvent(task: Task): Promise<{ webLink: string }> {
  const live = connected()[0];
  if (!live) throw Object.assign(new Error('No calendar connected'), { code: 'not_connected' });
  const result = await providerOf(live.id).createEvent(task);
  agendaChanged();
  return result;
}

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
  known = meetings;
  for (const notify of agendaStateListeners) notify();
}

function clearAgendaCache(): void {
  try {
    localStorage.removeItem(AGENDA_KEY);
  } catch {
    /* nothing to clear */
  }
  known = [];
  for (const notify of agendaStateListeners) notify();
}

/**
 * The week as last read, for anything outside the agenda that needs to say
 * something about it — the heading counting what is left of your day, for
 * one. Seeded from the copy on the phone so it is right before any network.
 */
let known: Meeting[] = readAgendaCache()?.meetings ?? [];
const agendaStateListeners = new Set<() => void>();

export const useAgendaMeetings = (): Meeting[] =>
  useSyncExternalStore(
    (onChange) => {
      agendaStateListeners.add(onChange);
      return () => {
        agendaStateListeners.delete(onChange);
      };
    },
    () => known,
    () => known,
  );

/** Meetings still ahead of you: what the agenda itself is showing. */
export const stillAhead = (meetings: Meeting[], now = Date.now()): Meeting[] => {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return meetings.filter((m) =>
    m.allDay ? new Date(m.start).getTime() >= midnight.getTime() : new Date(m.end).getTime() > now,
  );
};

/* ---- telling the agenda ---- */

const agendaListeners = new Set<() => void>();

/** The calendar changed from here, so an agenda on screen should read it again. */
function agendaChanged(): void {
  for (const notify of agendaListeners) notify();
}

export function onAgendaChanged(listener: () => void): () => void {
  agendaListeners.add(listener);
  return () => {
    agendaListeners.delete(listener);
  };
}
