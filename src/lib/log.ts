/**
 * A diary of what the app did, kept on the phone.
 *
 * When something goes wrong on someone's iPhone — a thought that vanished, a
 * purchase that did not unlock — there is otherwise nothing to look at. This
 * keeps the last few hundred events, and leaves only when the person sends
 * it themselves (Settings › Diagnostics).
 *
 * Never the words of a thought: an entry names a thought by the end of its
 * id, so the diary can be sent without giving anything away.
 */

export interface LogEntry {
  /** When, as an ISO timestamp. */
  t: string;
  /** What kind of event: `thought`, `tap`, `error`, `app`, `icloud`, `pro`, `share`. */
  e: string;
  /** The event itself, in a few words. */
  d: string;
}

const KEY = 'hence.log';
const MAX = 500;

function read(): LogEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
  } catch {
    return [];
  }
}

let entries: LogEntry[] = read();

/**
 * Written at once rather than batched: the entries that matter most are the
 * ones just before the app was closed or crashed.
 */
export function log(e: string, d: string): void {
  entries.push({ t: new Date().toISOString(), e, d: d.slice(0, 300) });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full: the diary is the first thing worth losing */
  }
}

/** A thought, named without its words. */
export const ref = (id: string): string => id.slice(-6);

export const logEntries = (): LogEntry[] => entries;

/** The diary as plain text, a header first, oldest entry first. */
export function logText(header: string[]): string {
  const lines = entries.map((x) => `${x.t.replace('T', ' ').slice(0, 19)}  ${x.e.padEnd(7)}  ${x.d}`);
  return [...header, '', ...lines, ''].join('\n');
}
