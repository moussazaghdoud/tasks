import type { Attendee } from './calendarTypes';

/** Who a person is on screen: their name, or the part of their address before the @. */
export const nameOf = (a: Pick<Attendee, 'name' | 'email'>): string => a.name.trim() || a.email.split('@')[0] || a.email;

/**
 * The people a meeting is with, as the list shows them: everyone invited but
 * you, those coming first, then the undecided, then those who said no.
 */
export function others(attendees: Attendee[] | undefined): Attendee[] {
  const order: Record<Attendee['response'], number> = { accepted: 0, tentative: 1, none: 2, declined: 3 };
  return (attendees ?? [])
    .filter((a) => !a.self)
    .slice()
    .sort((x, y) => order[x.response] - order[y.response]);
}

/**
 * A short line for the agenda: the first names, then how many more.
 * "Claire, Paul +3". First names keep it to one line on a phone.
 */
export function summary(attendees: Attendee[] | undefined, shown = 2): string {
  const people = others(attendees).filter((a) => a.response !== 'declined');
  if (!people.length) return '';
  const first = (a: Attendee) => nameOf(a).split(/[\s.]/)[0];
  const names = people.slice(0, shown).map(first).join(', ');
  const rest = people.length - shown;
  return rest > 0 ? `${names} +${rest}` : names;
}
