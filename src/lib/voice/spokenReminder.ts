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
  /\bset (?:me )?a reminder(?: for)?\b/i,
  /\bn['’]oubliez?\s+pas\s+de\s+me\s+rappeler\b/i,
  /\b(?:peux[-\s]tu|pouvez[-\s]vous)\s+me\s+rappeler\b/i,
  /\brappel(?:le|ez)[-\s]?(?:le[-\s]?)?moi\b/i,
  /\bfai(?:s|tes)[-\s]moi\s+penser\b/i,
  /\bmet(?:s|tez)[-\s]moi\s+un\s+rappel(?:\s+pour)?\b/i,
  /(?:请|记得)?提醒(?:一下)?我/,
  /设(?:置|定)?(?:一?个)?提醒/,
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
  { re: /^lundi(?:\s+prochain)?/i, weekday: 1 },
  { re: /^mardi(?:\s+prochain)?/i, weekday: 2 },
  { re: /^mercredi(?:\s+prochain)?/i, weekday: 3 },
  { re: /^jeudi(?:\s+prochain)?/i, weekday: 4 },
  { re: /^vendredi(?:\s+prochain)?/i, weekday: 5 },
  { re: /^samedi(?:\s+prochain)?/i, weekday: 6 },
  { re: /^dimanche(?:\s+prochain)?/i, weekday: 0 },
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
    // noon, midnight, midi, minuit — a time with no number in it.
    re: /^(?:at\s+|à\s+)?(noon|midday|midnight|midi|minuit)\b/i,
    read: (m) => ({ hour: /^(midnight|minuit)$/i.test(m[1]) ? 0 : 12, minute: 0 }),
  },
  {
    // "9 h 30", "9 heures 30": the French hour with a space before the minutes.
    re: /^(?:à\s+)?(\d{1,2})\s*(?:h|heures?)\s*(\d{2})\b/i,
    read: (m) => ({ hour: Number(m[1]), minute: Number(m[2]) }),
  },
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
    // 早上9点, 下午3点半, 晚上八点, 九点一刻
    re: /^(早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*[点:：]\s*(\d{2}|半|一刻|三刻)?/,
    read: (m) => {
      let hour = Number(m[2]);
      const part = m[1] ?? '';
      if ((part === '下午' || part === '晚上') && hour < 12) hour += 12;
      if (part === '中午' && hour < 12) hour = 12;
      const minute = m[3] === '半' ? 30 : m[3] === '一刻' ? 15 : m[3] === '三刻' ? 45 : Number(m[3] ?? 0);
      return { hour, minute };
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
    re: /^(\d{1,3})\s*个?\s*(分钟|小时|钟头|天)(?:以?后|之后)/,
    minutes: (m) => scale(Number(m[1]), m[2]),
  },
];

function scale(count: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^(hour|hrs?|heure|小时|钟头)/.test(u)) return count * 60;
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

/* ---- numbers the recogniser wrote out as words ---- */

const EN_HOURS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const EN_MINUTES: Record<string, number> = { fifteen: 15, thirty: 30, 'forty-five': 45, 'forty five': 45 };
const EN_COUNTS: Record<string, number> = {
  ...EN_HOURS, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45, 'forty five': 45, forty: 40, fifty: 50, ninety: 90,
};

const FR_HOURS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11,
  douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
  vingt: 20, 'vingt et une': 21, 'vingt-et-une': 21, 'vingt-deux': 22, 'vingt-trois': 23,
};
const FR_MINUTES: Record<string, number> = {
  cinq: 5, dix: 10, quinze: 15, vingt: 20, 'vingt-cinq': 25, trente: 30, 'trente-cinq': 35, quarante: 40,
  'quarante-cinq': 45, cinquante: 50, 'cinquante-cinq': 55, 'et quart': 15, 'et demie': 30,
};
const FR_COUNTS: Record<string, number> = { ...FR_HOURS, trente: 30, quarante: 40, 'quarante-cinq': 45, cinquante: 50 };

const words = (table: Record<string, number>) =>
  Object.keys(table)
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[-\s]/g, '[-\\s]'))
    .join('|');
const lookup = (table: Record<string, number>, said: string) => table[said.toLowerCase().replace(/\s+/g, ' ')] ?? table[said.toLowerCase().replace(/[-\s]+/g, '-')];
const two = (n: number) => String(n).padStart(2, '0');

/** 一 … 二十四, 两; enough for hours, minutes and short delays. */
function chinese(numeral: string): number | null {
  const digit: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (numeral === '十') return 10;
  const [tens, units] = numeral.split('十');
  if (units === undefined) return numeral.length === 1 ? (digit[numeral] ?? null) : null;
  const t = tens === '' ? 1 : digit[tens];
  const u = units === '' ? 0 : digit[units];
  return t === undefined || u === undefined ? null : t * 10 + u;
}

/**
 * Put digits where the recogniser spelled a number out, so the rules above
 * can read it — "at nine thirty", "à neuf heures et demie", "九点一刻",
 * "半小时后". Only numbers standing where a time or a delay goes are
 * touched; "one idea" stays as it was said.
 */
export function spokenNumbers(text: string): string {
  const enH = words(EN_HOURS);
  const enM = words(EN_MINUTES);
  const frH = words(FR_HOURS);
  const frM = words(FR_MINUTES);
  return (
    text
      // English: "half past nine", "quarter past/to nine"
      .replace(new RegExp(`\\b(half|quarter)\\s+(past|to)\\s+(${enH})\\b`, 'gi'), (_, part: string, dir: string, h: string) => {
        const hour = lookup(EN_HOURS, h);
        if (/^half/i.test(part)) return `${hour}:30`;
        return /^past/i.test(dir) ? `${hour}:15` : `${hour === 1 ? 12 : hour - 1}:45`;
      })
      // "at nine", "at nine thirty", "nine thirty pm", "nine o'clock"
      .replace(
        new RegExp(`\\b(at\\s+)?(${enH})(?:\\s+(${enM}))?(?=\\s*(?:a\\.?m\\.?|p\\.?m\\.?|o'clock)|\\b)`, 'gi'),
        (whole, at: string | undefined, h: string, m: string | undefined, offset: number, all: string) => {
          const rest = all.slice(offset + whole.length);
          if (!at && !/^\s*(?:a\.?m\.?|p\.?m\.?|o'clock)/i.test(rest)) return whole;
          const hour = lookup(EN_HOURS, h);
          return `${at ?? ''}${m ? `${hour}:${two(lookup(EN_MINUTES, m))}` : hour}`;
        },
      )
      // "in twenty minutes", "in half an hour"
      .replace(/\bin\s+half\s+an\s+hour\b/gi, 'in 30 minutes')
      .replace(new RegExp(`\\bin\\s+(${words(EN_COUNTS)})\\s+(minutes?|hours?|days?)\\b`, 'gi'), (_, n: string, unit: string) => `in ${lookup(EN_COUNTS, n)} ${unit}`)
      // French: "neuf heures", "neuf heures et demie", "quinze heures trente", "9 heures et quart"
      .replace(
        // Not after "dans": "dans deux heures" is a delay, read further down.
        new RegExp(`(?<!\\bdans\\s+)\\b(${frH}|\\d{1,2})\\s+heures?(?:\\s+(${frM}|\\d{2}))?(?![\\p{L}-])`, 'giu'),
        (_, h: string, m: string | undefined) => {
          const hour = /^\d/.test(h) ? Number(h) : lookup(FR_HOURS, h);
          const minute = m === undefined ? 0 : /^\d/.test(m) ? Number(m) : lookup(FR_MINUTES, m);
          return minute ? `${hour}h${two(minute)}` : `${hour}h`;
        },
      )
      .replace(/\bdans\s+une\s+demi[-\s]heure\b/gi, 'dans 30 minutes')
      .replace(/\bdans\s+un\s+quart\s+d['’]heure\b/gi, 'dans 15 minutes')
      .replace(new RegExp(`\\bdans\\s+(${words(FR_COUNTS)})\\s+(minutes?|heures?|jours?)\\b`, 'gi'), (whole, n: string, unit: string) =>
        /^une?$/i.test(n) ? whole : `dans ${lookup(FR_COUNTS, n)} ${unit}`,
      )
      // Chinese: 半小时后, 九点, 三点二十, 两个小时后
      .replace(/半个?(?:小时|钟头)/g, '30分钟')
      .replace(/([零〇一二两三四五六七八九十]{1,3})(?=\s*(?:点|个?\s*(?:小时|钟头)|分钟|天))/g, (whole, n: string) => {
        const value = chinese(n);
        return value === null ? whole : String(value);
      })
      .replace(/点([零〇一二三四五六七八九十]{1,3})分?/g, (whole, n: string) => {
        const value = chinese(n);
        return value === null || value > 59 ? whole : `点${two(value)}`;
      })
  );
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
  const original = transcript.trim();
  if (!original) return { at: null, text: '' };
  // Read with the numbers as digits; hand back the original words whenever
  // no reminder is found, so nothing else about the thought changes.
  const said = spokenNumbers(original);
  // Chinese runs its words together: no space where the request is cut out.
  const join = (a: string, b: string) => (/[一-鿿]$/.test(a.trim()) || /^[一-鿿]/.test(b.trim()) ? `${a.trim()}${b.trim()}` : `${a} ${b}`);

  for (const trigger of TRIGGERS) {
    const m = said.match(trigger);
    if (!m || m.index === undefined) continue;

    const before = said.slice(0, m.index);
    const rest = said.slice(m.index + m[0].length);

    // The usual shape: the hour follows the request. Then both go.
    const attached = readClause(rest, now);
    if (attached) return { at: attached.at, text: tidy(join(before, rest.slice(attached.length))) };

    // "Call Paul tomorrow at nine, remind me": the request is bare, so the
    // hour is somewhere in the sentence. Keep the sentence, take the hour.
    const whole = join(before, rest);
    for (let i = 0; i < whole.length; i++) {
      const found = readClause(whole.slice(i), now);
      if (found) return { at: found.at, text: tidy(whole) };
    }

    // A request with no hour in sight is not a reminder, only a turn of
    // phrase. Leave the words alone.
    return { at: null, text: original };
  }

  return { at: null, text: original };
}
