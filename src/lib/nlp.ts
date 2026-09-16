/**
 * Natural-language task parser.
 *
 * Turns "Prepare board presentation friday 3pm high priority #IPS" into a
 * clean title plus structured attributes. Every detected attribute is
 * returned as a token with its span in the original text, so the composer
 * can highlight it and the user can dismiss it (the words then stay in the
 * title). The parser never guesses silently: callers show tokens as chips.
 */
import type { DateKey, Priority, RecurrenceRule, TimeKey } from '@/domain/types';
import {
  addDaysKey,
  addMonthsKey,
  fromKey,
  nextWeekKey,
  nextWeekdayKey,
  timeKey,
  todayKey,
  toKey,
  weekendKey,
} from './dates';

export type TokenKind = 'date' | 'time' | 'priority' | 'project' | 'person' | 'recurrence' | 'duration' | 'link';

export interface ParsedToken {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
  /** Stable identity used to remember a dismissal while the user keeps typing. */
  key: string;
}

export interface NamedRef {
  id: string;
  name: string;
}

export interface ParseOptions {
  today?: DateKey;
  projects?: NamedRef[];
  people?: NamedRef[];
  ignore?: ReadonlySet<string>;
  dateOrder?: 'dmy' | 'mdy';
  weekStartsOn?: 0 | 1;
}

export interface ParseResult {
  title: string;
  dueDate?: DateKey;
  dueTime?: TimeKey;
  priority?: Priority;
  projectId?: string;
  /** Set when `#name` doesn't match an existing project. */
  newProjectName?: string;
  personId?: string;
  newPersonName?: string;
  recurrence?: RecurrenceRule;
  estimatedMinutes?: number;
  links: string[];
  tokens: ParsedToken[];
}

interface Candidate extends ParsedToken {
  apply: (r: ParseResult, ctx: Ctx) => void;
}

interface Ctx {
  today: DateKey;
  opts: ParseOptions;
}

const B = '(?<![\\p{L}\\p{N}_])'; // word start
const E = '(?![\\p{L}\\p{N}_])'; // word end

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};
const WEEKDAY_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
};
const NUM_RE = `\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')}`;
const toNum = (s: string) => NUMBER_WORDS[s.toLowerCase()] ?? parseInt(s, 10);

const DATE_PREFIX = '(?:(?:due|on|by|before|for|this)\\s+)?';

type Matcher = {
  kind: TokenKind;
  re: RegExp;
  /** Only valid when nothing but other tokens / punctuation follows. */
  trailingOnly?: boolean;
  build: (m: RegExpExecArray, ctx: Ctx) => ((r: ParseResult, ctx: Ctx) => void) | null;
};

const rx = (src: string) => new RegExp(src, 'giu');

function monthDay(month: number, day: number, year: number | undefined, today: DateKey): DateKey | null {
  const t = fromKey(today);
  let y = year ?? t.getFullYear();
  if (year !== undefined && year < 100) y = 2000 + year;
  const d = new Date(y, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  let key = toKey(d);
  if (year === undefined && key < today) key = toKey(new Date(y + 1, month, day));
  return key;
}

function hour12(h: number, suffix: string | undefined): number | null {
  if (!suffix) return h;
  const pm = suffix.toLowerCase().startsWith('p');
  if (h < 1 || h > 12) return null;
  if (pm) return h === 12 ? 12 : h + 12;
  return h === 12 ? 0 : h;
}

const setDate = (key: DateKey | null) => (key ? (r: ParseResult) => void (r.dueDate = key) : null);

const MATCHERS: Matcher[] = [
  // ---- links -------------------------------------------------------------
  {
    kind: 'link',
    re: rx(`${B}https?:\\/\\/[^\\s]+`),
    build: (m) => (r) => void r.links.push(m[0].replace(/[),.;]+$/, '')),
  },
  // ---- recurrence --------------------------------------------------------
  {
    kind: 'recurrence',
    re: rx(`${B}every\\s+(${WEEKDAY_RE})${E}`),
    build: (m, { today }) => (r) => {
      r.recurrence = { freq: 'weekly', interval: 1 };
      r.dueDate ??= nextWeekdayKey(today, WEEKDAYS[m[1].toLowerCase()]);
    },
  },
  {
    kind: 'recurrence',
    re: rx(`${B}every\\s+(${NUM_RE}|other)\\s+(day|week|month|year)s?${E}`),
    build: (m) => (r) => {
      const n = m[1].toLowerCase() === 'other' ? 2 : toNum(m[1]);
      const unit = m[2].toLowerCase();
      r.recurrence = {
        freq: unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : unit === 'month' ? 'monthly' : 'yearly',
        interval: Math.max(1, n),
      };
    },
  },
  {
    kind: 'recurrence',
    re: rx(`${B}(?:every|each)\\s+(day|week|month|year|weekday|work\\s?day)${E}`),
    build: (m) => (r) => {
      const u = m[1].toLowerCase().replace(/\s/g, '');
      r.recurrence = {
        freq: u === 'day' ? 'daily' : u === 'week' ? 'weekly' : u === 'month' ? 'monthly' : u === 'year' ? 'yearly' : 'weekdays',
        interval: 1,
      };
    },
  },
  {
    kind: 'recurrence',
    re: rx(`${B}(daily|weekly|biweekly|monthly|yearly|annually|weekdays)${E}`),
    trailingOnly: true,
    build: (m) => (r) => {
      const w = m[1].toLowerCase();
      r.recurrence =
        w === 'daily' ? { freq: 'daily', interval: 1 }
        : w === 'weekly' ? { freq: 'weekly', interval: 1 }
        : w === 'biweekly' ? { freq: 'weekly', interval: 2 }
        : w === 'monthly' ? { freq: 'monthly', interval: 1 }
        : w === 'weekdays' ? { freq: 'weekdays', interval: 1 }
        : { freq: 'yearly', interval: 1 };
    },
  },
  // ---- dates -------------------------------------------------------------
  {
    kind: 'date',
    re: rx(`${B}(?:the\\s+)?day\\s+after\\s+tomorrow${E}`),
    build: (_m, { today }) => setDate(addDaysKey(today, 2)),
  },
  {
    kind: 'date',
    re: rx(`${B}${DATE_PREFIX}(today|tonight|tomorrow|tmrw|tmr|tomorow)${E}`),
    build: (m, { today }) => {
      const w = m[1].toLowerCase();
      return setDate(w === 'today' || w === 'tonight' ? today : addDaysKey(today, 1));
    },
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|by|before)\\s+)?(?:this\\s+|the\\s+)?(?:end\\s+of\\s+(?:the\\s+)?(week|month)|eo(w|m))${E}`),
    build: (m, { today }) => {
      const unit = (m[1] ?? (m[2] === 'w' ? 'week' : 'month')).toLowerCase();
      if (unit === 'week') return setDate(nextWeekdayKey(today, 5));
      const d = fromKey(today);
      return setDate(toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    },
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|on|by|before)\\s+)?next\\s+(week|month|weekend)${E}`),
    build: (m, { today, opts }) => {
      const u = m[1].toLowerCase();
      if (u === 'week') return setDate(nextWeekKey(today, opts.weekStartsOn ?? 1));
      if (u === 'weekend') return setDate(addDaysKey(weekendKey(addDaysKey(today, 7)), 0));
      const d = fromKey(today);
      return setDate(toKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)));
    },
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:on|by|for)\\s+)?(?:this\\s+)?weekend${E}`),
    build: (_m, { today }) => setDate(weekendKey(today)),
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|on|by|before|for)\\s+)?(next\\s+|this\\s+)?(${WEEKDAY_RE})\\.?${E}`),
    build: (m, { today }) => {
      const strict = !!m[1] && m[1].toLowerCase().startsWith('next');
      return setDate(nextWeekdayKey(today, WEEKDAYS[m[2].toLowerCase()], !strict));
    },
  },
  {
    kind: 'date',
    re: rx(`${B}in\\s+(${NUM_RE})\\s+(day|week|month)s?${E}`),
    build: (m, { today }) => {
      const n = toNum(m[1]);
      const u = m[2].toLowerCase();
      return setDate(u === 'day' ? addDaysKey(today, n) : u === 'week' ? addDaysKey(today, 7 * n) : addMonthsKey(today, n));
    },
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|on|by|before|for)\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`),
    build: (m, { today }) =>
      setDate(monthDay(MONTHS[m[1].toLowerCase()], +m[2], m[3] ? +m[3] : undefined, today)),
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|on|by|before|for)\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:,?\\s+(\\d{4}))?${E}`),
    build: (m, { today }) =>
      setDate(monthDay(MONTHS[m[2].toLowerCase()], +m[1], m[3] ? +m[3] : undefined, today)),
  },
  {
    kind: 'date',
    re: rx(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`),
    build: (m, { today }) => setDate(monthDay(+m[2] - 1, +m[3], +m[1], today)),
  },
  {
    kind: 'date',
    re: rx(`${B}(?:(?:due|on|by|before)\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?${E}`),
    build: (m, { today, opts }) => {
      const a = +m[1];
      const b = +m[2];
      const [day, month] = (opts.dateOrder ?? 'dmy') === 'dmy' ? [a, b] : [b, a];
      return setDate(monthDay(month - 1, day, m[3] ? +m[3] : undefined, today));
    },
  },
  // ---- durations (before times so "2h" becomes a duration) --------------
  {
    kind: 'duration',
    re: rx(`${B}(?:for\\s+|~\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(minutes|minute|mins|min|hours|hour|hrs|hr)${E}`),
    build: (m) => {
      const n = parseFloat(m[1].replace(',', '.'));
      const minutes = m[2].toLowerCase().startsWith('h') ? Math.round(n * 60) : Math.round(n);
      if (!minutes || minutes > 24 * 60) return null;
      return (r) => void (r.estimatedMinutes = minutes);
    },
  },
  {
    kind: 'duration',
    re: rx(`${B}(?:for\\s+|~\\s*)?([1-5](?:[.,]5)?)h${E}`),
    build: (m) => (r) => void (r.estimatedMinutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60)),
  },
  // ---- times -------------------------------------------------------------
  {
    kind: 'time',
    re: rx(`${B}(?:at\\s+|à\\s+)?(\\d{1,2}):(\\d{2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)?(?![\\p{L}\\p{N}])`),
    build: (m) => {
      const h = hour12(+m[1], m[3]);
      const min = +m[2];
      if (h === null || h > 23 || min > 59) return null;
      return (r) => void (r.dueTime = timeKey(h, min));
    },
  },
  {
    kind: 'time',
    re: rx(`${B}(?:at\\s+)?(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![\\p{L}\\p{N}])`),
    build: (m) => {
      const h = hour12(+m[1], m[2]);
      return h === null ? null : (r) => void (r.dueTime = timeKey(h));
    },
  },
  {
    kind: 'time',
    re: rx(`${B}(?:at\\s+|à\\s+)?(\\d{1,2})h(\\d{2})?${E}`),
    build: (m) => {
      const h = +m[1];
      const min = m[2] ? +m[2] : 0;
      if (h > 23 || min > 59) return null;
      return (r) => void (r.dueTime = timeKey(h, min));
    },
  },
  {
    kind: 'time',
    re: rx(`${B}at\\s+(\\d{1,2})(?![\\p{L}\\p{N}:/.])`),
    build: (m) => {
      let h = +m[1];
      if (h > 23) return null;
      if (h >= 1 && h <= 6) h += 12; // "at 3" in a working day means 15:00
      return (r) => void (r.dueTime = timeKey(h));
    },
  },
  {
    kind: 'time',
    re: rx(`${B}(?:at\\s+)?(noon|midday)${E}`),
    build: () => (r) => void (r.dueTime = '12:00'),
  },
  // ---- priority ----------------------------------------------------------
  {
    kind: 'priority',
    re: rx(`${B}(?:(?:high|top)\\s+priority|priority\\s*:?\\s*(?:high|1)|p1)${E}`),
    build: () => (r) => void (r.priority = 'important'),
  },
  {
    kind: 'priority',
    re: rx(`(?<![\\p{L}\\p{N}!])!!+(?![\\p{L}\\p{N}])`),
    build: () => (r) => void (r.priority = 'important'),
  },
  {
    kind: 'priority',
    re: rx(`${B}(?:low\\s+priority|priority\\s*:?\\s*low|p3|p4)${E}`),
    build: () => (r) => void (r.priority = 'low'),
  },
  {
    kind: 'priority',
    re: rx(`${B}(important|urgent|asap)${E}`),
    trailingOnly: true,
    build: () => (r) => void (r.priority = 'important'),
  },
  // ---- project & person --------------------------------------------------
  {
    kind: 'project',
    re: rx(`(?<![\\p{L}\\p{N}_&])#([\\p{L}\\p{N}][\\p{L}\\p{N}_-]*)`),
    build: (m, { opts }) => {
      const q = m[1].toLowerCase();
      const list = opts.projects ?? [];
      const hit =
        list.find((p) => p.name.toLowerCase() === q) ??
        list.find((p) => p.name.toLowerCase().replace(/\s+/g, '') === q) ??
        list.find((p) => p.name.toLowerCase().startsWith(q));
      return (r) => {
        if (hit) r.projectId = hit.id;
        else r.newProjectName = m[1];
      };
    },
  },
  {
    kind: 'person',
    re: rx(`(?<![\\p{L}\\p{N}_.])@([\\p{L}][\\p{L}\\p{N}_-]*)(?!\\.[\\p{L}])`),
    build: (m, { opts }) => {
      const q = m[1].toLowerCase();
      const list = opts.people ?? [];
      const hit =
        list.find((p) => p.name.toLowerCase() === q) ??
        list.find((p) => p.name.toLowerCase().split(/\s+/)[0] === q) ??
        list.find((p) => p.name.toLowerCase().startsWith(q));
      return (r) => {
        if (hit) r.personId = hit.id;
        else r.newPersonName = m[1].charAt(0).toUpperCase() + m[1].slice(1);
      };
    },
  },
];

function tokenKey(kind: TokenKind, text: string) {
  return `${kind}:${text.toLowerCase().replace(/\s+/g, ' ').trim()}`;
}

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

const JUNK = /^[\s,;:\-–—.]*$/;

export function parseTask(input: string, opts: ParseOptions = {}): ParseResult {
  const ctx: Ctx = { today: opts.today ?? todayKey(), opts };
  const ignore = opts.ignore ?? new Set<string>();

  const collect = (trailingOnly: boolean) => {
    const out: Candidate[] = [];
    for (const matcher of MATCHERS) {
      if (!!matcher.trailingOnly !== trailingOnly) continue;
      matcher.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = matcher.re.exec(input))) {
        const text = m[0];
        const key = tokenKey(matcher.kind, text);
        if (ignore.has(key)) continue;
        const apply = matcher.build(m, ctx);
        if (!apply) continue;
        out.push({ kind: matcher.kind, start: m.index, end: m.index + text.length, text, key, apply });
      }
    }
    return out;
  };

  // Pass 1: unambiguous patterns. Longest match wins; one token per kind
  // (links excepted), earliest first.
  const accepted: Candidate[] = [];
  const primary = collect(false).sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  for (const c of primary) {
    if (accepted.some((a) => overlaps(a, c))) continue;
    accepted.push(c);
  }
  const perKind = new Map<TokenKind, Candidate>();
  for (const c of accepted.sort((a, b) => a.start - b.start)) {
    if (c.kind === 'link') continue;
    if (!perKind.has(c.kind)) perKind.set(c.kind, c);
  }
  let chosen = accepted.filter((c) => c.kind === 'link' || perKind.get(c.kind) === c);

  // Pass 2: words that are only attributes when they close the sentence
  // ("… important", "… weekly"), never "Important contracts review".
  const trailing = collect(true).sort((a, b) => b.start - a.start);
  for (const c of trailing) {
    if (chosen.some((a) => overlaps(a, c) || a.kind === c.kind)) continue;
    const after = stripSpans(input.slice(c.end), chosen, c.end);
    if (!JUNK.test(after)) continue;
    chosen.push(c);
  }
  chosen = chosen.sort((a, b) => a.start - b.start);

  let title = stripSpans(input, chosen, 0);
  title = cleanTitle(title);

  const result: ParseResult = { title, links: [], tokens: [] };
  if (!title) {
    // Nothing but attributes ("tomorrow") — treat the words as the title.
    // A lone link still becomes a task named after its host.
    const onlyLinks = chosen.length > 0 && chosen.every((c) => c.kind === 'link');
    if (!onlyLinks) return { title: cleanTitle(input), links: [], tokens: [] };
    result.title = hostOf(chosen[0].text);
  }

  for (const c of chosen) c.apply(result, ctx);
  // A time or recurrence without a date anchors on today.
  if ((result.dueTime || result.recurrence) && !result.dueDate) result.dueDate = ctx.today;
  result.tokens = chosen.map((c) => ({ kind: c.kind, start: c.start, end: c.end, text: c.text, key: c.key }));
  return result;
}

function stripSpans(text: string, spans: { start: number; end: number }[], offset: number): string {
  let out = '';
  let i = 0;
  const sorted = spans
    .map((s) => ({ start: s.start - offset, end: s.end - offset }))
    .filter((s) => s.end > 0 && s.start < text.length)
    .sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    out += text.slice(i, Math.max(i, s.start)) + ' ';
    i = Math.max(i, s.end);
  }
  return out + text.slice(i);
}

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/^[\s,;:\-–—]+/, '')
    .replace(/[\s,;:\-–—]+$/, '')
    .replace(/\s+(?:at|on|by|due|for|in|this|the)$/i, '')
    .trim();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Parse a date/time phrase typed into a date picker ("fri 3pm", "sep 30", "in 2 weeks"). */
export function parseWhen(
  text: string,
  opts: ParseOptions = {},
): { date?: DateKey; time?: TimeKey } | null {
  const q = text.trim();
  if (!q) return null;
  const r = parseTask(`x ${q}`, opts);
  if (!r.dueDate && !r.dueTime) return null;
  // Everything typed must have been understood, otherwise it's a guess.
  if (r.title.trim().toLowerCase() !== 'x') return null;
  return { date: r.dueDate, time: r.dueTime };
}

export function defaultDateOrder(): 'dmy' | 'mdy' {
  try {
    const lang = navigator.language || 'en-GB';
    return /^en-(US|PH|CA)|^fil/i.test(lang) ? 'mdy' : 'dmy';
  } catch {
    return 'dmy';
  }
}
