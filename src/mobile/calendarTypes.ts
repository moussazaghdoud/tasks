/**
 * What every calendar the app speaks to has in common.
 *
 * Kept apart from the providers themselves so that Outlook and Google can
 * both depend on it without depending on each other, and so that adding a
 * third means adding a file rather than editing two.
 */

export interface Meeting {
  /** The calendar's own id; absent in an agenda stored by an older build. */
  id?: string;
  subject: string;
  /** Local wall time, no zone suffix: the calendar was asked for this phone's zone. */
  start: string;
  end: string;
  allDay: boolean;
  showAs: string;
  /** Yours to cancel; otherwise an invitation, yours to decline. */
  isOrganizer?: boolean;
  organizerName?: string;
  organizerEmail?: string;
  /** Which calendar it came from; added on this side, the plugins do not send it. */
  provider?: ProviderId;
}

/** What can be done with a meeting from the agenda. */
export type MeetingAction = 'cancel' | 'decline';

export interface Account {
  connected: boolean;
  account: string;
}

/** Which calendar a meeting came from, for the label beside it. */
export type ProviderId = 'microsoft' | 'google';
