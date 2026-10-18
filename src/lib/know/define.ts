import { isPro } from '@/lib/pro/store';
import { readAgendaCache } from '@/mobile/calendar';
import { currentLang, speechLang } from '@/mobile/i18n';
import { condense } from './condense';
import { scheduleReviewNotice } from './reviews';
import { countLookUp, FREE_PER_MONTH, keep, usedThisMonth, type Definition } from './store';
import { lookUp } from './wikipedia';

/**
 * From a term to a kept definition: Wikipedia for the facts, condensed to a
 * sentence and three points, tied to the meeting it came up in, and put on
 * the review schedule.
 */

export type DefineResult =
  | { kind: 'defined'; definition: Definition }
  | { kind: 'not-found'; term: string }
  | { kind: 'offline'; term: string }
  | { kind: 'limit' };

/** The meeting on right now, from the agenda last read. */
export function meetingNow(now = new Date()): { subject: string; at: string } | undefined {
  const meetings = readAgendaCache()?.meetings ?? [];
  const on = meetings.find((m) => !m.allDay && Date.parse(m.start) <= now.getTime() && now.getTime() <= Date.parse(m.end));
  return on ? { subject: on.subject, at: on.start } : undefined;
}

export async function define(term: string): Promise<DefineResult> {
  if (!isPro() && usedThisMonth() >= FREE_PER_MONTH) return { kind: 'limit' };
  const found = await lookUp(term, [currentLang(), speechLang()]);
  if (!found) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline ? { kind: 'offline', term } : { kind: 'not-found', term };
  }
  const { sentence, bullets, byModel } = await condense(found.title, found.extract, found.lang);
  const definition = keep({
    term: found.title,
    sentence,
    bullets,
    byModel,
    source: { title: found.title, url: found.url, lang: found.lang },
    meeting: meetingNow(),
  });
  countLookUp();
  void scheduleReviewNotice();
  return { kind: 'defined', definition };
}

/** A definition the person writes themselves: when Wikipedia has none, or for their own words. */
export function writeOwn(term: string, sentence: string, bullets: string[]): Definition {
  const definition = keep({ term: term.trim(), sentence: sentence.trim(), bullets: bullets.map((b) => b.trim()).filter(Boolean), meeting: meetingNow() });
  void scheduleReviewNotice();
  return definition;
}
