/**
 * "Remind me tomorrow at nine" — heard, obeyed, and then removed from the
 * thought.
 *
 * Read on the device rather than asked of Claude, for three reasons: it works
 * with the network off and with Claude turned off, it costs nothing, and a
 * reminder is a promise — it should not depend on a round trip that can fail.
 *
 * Deliberately narrow. It fires on a phrase that plainly asks for a reminder
 * and an hour it can be sure of, and stays out of the way otherwise: a missed
 * reminder is a disappointment, but a reminder invented from "let me remind
 * John about the five o'clock" is the app putting words in your mouth.
 */

export interface SpokenReminder {
  /** When to ring, or null when nothing was asked for. */
  at: Date | null;
  /** What is left of the thought once the request is taken out. */
  text: string;
}

/** The ask itself, in each language the app speaks. */
const TRIGGERS = [
  /\b(?:please\s+)?remind me\b/i,
  /\brappelle[-\s]?(?:le[-\s]?)?moi\b/i,
  /\bfais[-\s]moi\s+penser\b/i,
  /提醒我/,
];

const DAY_WORDS: Array<{ re: RegExp; days?: number; weekday?: number; hour?: number }> = [
  // English
  { re: /^tomorrow morning/i, days: 1, hour: 9 },
  { re: /^tomorrow afternoon/i, days: 1, hour: 14 },
  { re: /^tomorrow (?:evening|night)/i, days: 1, hour: 19 },
  { re: /^tomorrow/i, days: 1 },
  { re: /^tonight|^this evening/i, days: 0, hour: 19 },
  { re: /^this morning/i, days: 0, hour: 9 },
  { re: /^this afternoon/i, days: 0, hour: 14 },
  { re: /^today/i, days: 0 },
  { re: /^(?:next\s+|on\s+)?monday/i, weekday: 1 },
  { re: /^(?:next\s+|on\s+)?tuesday/i, weekday: 2 },
  { re: /^(?:next\s+|on\s+)?wednesday/i, weekday: 3 },
  { re: /^(?:next\s+|on\s+)?thursday/i, weekday: 4 },
  { re: /^(?:next\s+|on\s+)?friday/i, weekday: 5 },
  { re: /^(?:next\s+|on\s+)?saturday/i, weekday: 6 },
  { re: /^(?:next\s+|on\s+)?sunday/i, weekday: 0 },
  // French
  { re: /^demain matin/i, days: 1, hour: 9 },
  { re: /^demain après[-\s]?midi/i, days: 1, hour: 14 },
  { re: /^demain soir/i, days: 1, hour: 19 },
  { re: /^demain/i, days: 1 },
  { re: /^après[-\s]?demain/i, days: 2 },
  { re: /^ce soir/i, days: 0, hour: 19 },
  { re: /^ce matin/i, days: 0, hour: 9 },
  { re: /^cet après[-\s]?midi/i, days: 0, hour: 14 },
  { re: /^aujourd'?hui/i, days: 0 },
  { re: /^lundi/i, weekday: 1 },
  { re: /^mardi/i, weekday: 2 },
  { re: /^mercredi/i, weekday: 3 },
  { re: /^jeudi/i, weekday: 4 },
  { re: /^vendredi/i, weekday: 5 },
  { re: /^samedi/i, weekday: 6 },
  { re: /^dimanche/i, weekday: 0 },
  // Chinese
  { re: /^明早/, days: 1, hour: 9 },
  { re: /^明晚/, days: 1, hour: 19 },
  { re: /^明天/, days: 1 },
  { re: /^后天/, days: 2 },
  { re: /^今晚/, days: 0, hour: 19 },
  { re: /^今天/, days: 0 },
  { re: /^下?周一|^下?星期一/, weekday: 1 },
  { re: /^下?周二|^下?星期二/, weekday: 2 },
  { re: /^下?周三|^下?星期三/, weekday: 3 },
  { re: /^下?周四|^下?星期四/, weekday: 4 },
  { re: /^下?周五|^下?星期五/, weekday: 5 },
  { re: /^下?周六|^下?星期六/, weekday: 6 },
  { re: /^下?周日|^下?星期日|^下?周天/, weekday: 0 },
];

/**
 * An hour, but only when it says so.
 *
 * "at 5", "5pm", "17h30", "下午3点" — each carries a marker that it is a time.
 * A bare "5" never matches, which is what keeps "remind me, 5 people are
 * coming" from becoming a five o'clock alarm.
 */
const TIMES: Array<{ re: RegExp; read: (m: RegExpMatchArray) => { hour: number; minute: number } | null }> = [
  {
    // 9am, 9:30 pm, at 9, at 9.30, 9 o'clock
    re: /^(?:at\s+|à\s+)?(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'clock|heures?|h)\b/i,
    read: (m) => {
      const marker = (m[3] ?? '').toLowerCase();
      let hour = Number(m[1]);
      const minute = Number(m[2] ?? 0);
      if (marker.startsWith('p') && hour < 12) hour += 12;
      if (marker.startsWith('a') && hour === 12) hour = 0;
      return { hour, minute };
    },
  },
  {
    // "at 5", "à 17:30" — the preposition is what makes it a time.
    re: /^(?:at|à)\s+(\d{1,2})(?:[:.h](\d{2}))?/i,
    read: (m) => ({ hour: Number(m[1]), minute: Number(m[2] ?? 0) }),
  },
  {
    // 早上9点, 下午3点半, 晚上八点
    re: /^(早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*[点:：]\s*(\d{2}|半)?/,
    read: (m) => {
      let hour = Number(m[2]);
      const part = m[1] ?? '';
      if ((part === '下午' || part === '晚上') && hour < 12) hour += 12;
      if (part === '中午' && hour < 12) hour = 12;
      return { hour, minute: m[3] === '半' ? 30 : Number(m[3] ?? 0) };
    },
  },
];

/** "in twenty minutes", "dans 2 heures", "20分钟后". */
const DELAYS: Array<{ re: RegExp; minutes: (m: RegExpMatchArray) => number }> = [
  {
    re: /^in\s+(?:an?\s+|(\d{1,3})\s*)(minutes?|mins?|hours?|hrs?|days?)/i,
    minutes: (m) => scale(m[1] ? Number(m[1]) : 1, m[2]),
  },
  {
    re: /^dans\s+(?:une?\s+|(\d{1,3})\s*)(minutes?|heures?|jours?)/i,
    minutes: (m) => scale(m[1] ? Number(m[1]) : 1, m[2]),
  },
  {
    re: /^(\d{1,3})\s*(分钟|小时|天)后/,
    minutes: (m) => scale(Number(m[1]), m[2]),
  },
];

function scale(count: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^(hour|hrs?|heure|小时)/.test(u)) return count * 60;
  if (/^(day|jour|天)/.test(u)) return count * 60 * 24;
  return count;
}

/** Where a spoken hour lands when nobody said morning or afternoon. */
function assume(hour: number, said: string): number {
  // 1 to 7 with no marker is the afternoon: nobody asks to be reminded at
  // five past four in the morning without saying so.
  if (hour >= 1 && hour <= 7 && !/\b(a\.?m\.?|morning|matin|早上|上午)\b/i.test(said)) return hour + 12;
  return hour;
}

/** The time clause at the very start of `rest`, if there is one. */
function readClause(rest: string, now: Date): { at: Date; length: number } | null {
  const trimmed = rest.replace(/^[\s,;:.·、，。]+/, '');
  const skipped = rest.length - trimmed.length;

  for (const delay of DELAYS) {
    const m = trimmed.match(delay.re);
    if (m) return { at: new Date(now.getTime() + delay.minutes(m) * 60_000), length: skipped + m[0].length };
  }

  let cursor = 0;
  let days: number | undefined;
  let weekday: number | undefined;
  let hour: number | undefined;
  let minute = 0;

  for (const word of DAY_WORDS) {
    const m = trimmed.match(word.re);
    if (!m) continue;
    days = word.days;
    weekday = word.weekday;
    hour = word.hour;
    cursor = m[0].length;
    break;
  }

  // The hour, whether it followed a day word or stood on its own.
  const after = trimmed.slice(cursor);
  const tail = after.replace(/^[\s,]+/, '');
  const gap = after.length - tail.length;
  for (const time of TIMES) {
    const m = tail.match(time.re);
    if (!m) continue;
    const read = time.read(m);
    if (!read || read.hour > 23 || read.minute > 59) continue;
    // A marker — am, pm, 下午 — has already said which half of the day this
    // is, and so has any hour past noon. Otherwise guess.
    const stated = /[ap]\.?m|o'clock|早上|上午|中午|下午|晚上/i.test(m[0]) || read.hour > 12;
    hour = stated ? read.hour : assume(read.hour, m[0]);
    minute = read.minute;
    cursor += gap + m[0].length;
    break;
  }

  if (days === undefined && weekday === undefined && hour === undefined) return null;

  const at = new Date(now);
  at.setSeconds(0, 0);
  if (hour === undefined) {
    // A day with no hour: the morning of it, or an hour from now for today.
    if (days === 0) return { at: new Date(now.getTime() + 60 * 60_000), length: skipped + cursor };
    at.setHours(9, 0, 0, 0);
  } else {
    at.setHours(hour, minute, 0, 0);
  }

  if (weekday !== undefined) {
    const ahead = (weekday - at.getDay() + 7) % 7;
    at.setDate(at.getDate() + (ahead === 0 && at.getTime() <= now.getTime() ? 7 : ahead));
  } else if (days) {
    at.setDate(at.getDate() + days);
  } else if (at.getTime() <= now.getTime()) {
    // "at eight" said at nine in the evening means tomorrow morning.
    at.setDate(at.getDate() + (days === 0 ? 0 : 1));
  }

  if (at.getTime() <= now.getTime()) return null;
  return { at, length: skipped + cursor };
}

/** Tidy the sentence left behind: no double spaces, no dangling comma. */
function tidy(text: string): string {
  const out = text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:.\-–—·、，。]+/, '')
    .replace(/[\s,;:\-–—]+$/, '')
    .replace(/^(?:to|that|about|de|d'|que|qu'|à)\s+/i, '')
    .trim();
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

/**
 * Pull a spoken reminder out of a memo.
 *
 * Returns the moment asked for, and the memo without the asking. When there
 * is no plain request, or no hour it can be sure of, the memo comes back
 * untouched and nothing is scheduled.
 */
export function extractReminder(transcript: string, now: Date = new Date()): SpokenReminder {
  const said = transcript.trim();
  if (!said) return { at: null, text: '' };

  for (const trigger of TRIGGERS) {
    const m = said.match(trigger);
    if (!m || m.index === undefined) continue;

    const before = said.slice(0, m.index);
    const rest = said.slice(m.index + m[0].length);

    // The usual shape: the hour follows the request. Then both go.
    const attached = readClause(rest, now);
    if (attached) return { at: attached.at, text: tidy(`${before} ${rest.slice(attached.length)}`) };

    // "Call Paul tomorrow at nine, remind me": the request is bare, so the
    // hour is somewhere in the sentence. Keep the sentence, take the hour.
    const whole = `${before} ${rest}`;
    for (let i = 0; i < whole.length; i++) {
      const found = readClause(whole.slice(i), now);
      if (found) return { at: found.at, text: tidy(whole) };
    }

    // A request with no hour in sight is not a reminder, only a turn of
    // phrase. Leave the words alone.
    return { at: null, text: said };
  }

  return { at: null, text: said };
}
