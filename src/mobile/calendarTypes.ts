/**
 * What every calendar the app speaks to has in common.
 *
 * Kept apart from the providers themselves so that Outlook and Google can
 * both depend on it without depending on each other, and so that adding a
 * third means adding a file rather than editing two.
 */

export interface Meeting {
  subject: string;
  /** Local wall time, no zone suffix: the calendar was asked for this phone's zone. */
  start: string;
  end: string;
  allDay: boolean;
  showAs: string;
}

export interface Account {
  connected: boolean;
  account: string;
}

/** Which calendar a meeting came from, for the label beside it. */
export type ProviderId = 'microsoft' | 'google';
