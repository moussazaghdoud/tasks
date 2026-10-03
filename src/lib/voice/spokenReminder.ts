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
  // Italian
  /\bmettimi\s+un\s+promemoria(?:\s+per)?\b/i,
  /\bricordami\b/i,
  // Spanish
  /(?<![\p{L}])pon(?:me)?\s+un\s+recordatorio(?:\s+para)?(?![\p{L}])/iu,
  /(?<![\p{L}])recu[eé]rdame(?![\p{L}])/iu,
  // German
  /\berinnere?\s+mich\b/i,
  // Arabic, with or without the doubling mark on the kaf
  /ذكّ?رني/,
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
  // Italian
  { re: /^domani mattina/i, days: 1, hour: 9 },
  { re: /^domani pomeriggio/i, days: 1, hour: 14 },
  { re: /^domani sera/i, days: 1, hour: 19 },
  { re: /^dopodomani/i, days: 2 },
  { re: /^domani/i, days: 1 },
  { re: /^stasera/i, days: 0, hour: 19 },
  { re: /^stamattina/i, days: 0, hour: 9 },
  { re: /^oggi pomeriggio/i, days: 0, hour: 14 },
  { re: /^oggi/i, days: 0 },
  { re: /^luned[iì](?:\s+prossimo)?/iu, weekday: 1 },
  { re: /^marted[iì](?:\s+prossimo)?/iu, weekday: 2 },
  { re: /^mercoled[iì](?:\s+prossimo)?/iu, weekday: 3 },
  { re: /^gioved[iì](?:\s+prossimo)?/iu, weekday: 4 },
  { re: /^venerd[iì](?:\s+prossimo)?/iu, weekday: 5 },
  { re: /^sabato(?:\s+prossimo)?/i, weekday: 6 },
  { re: /^domenica(?:\s+prossima)?/i, weekday: 0 },
  // Spanish — "pasado mañana" and "esta mañana" before the bare "mañana"
  { re: /^pasado\s+mañana/iu, days: 2 },
  { re: /^mañana\s+por\s+la\s+mañana/iu, days: 1, hour: 9 },
  { re: /^mañana\s+por\s+la\s+tarde/iu, days: 1, hour: 16 },
  { re: /^mañana\s+por\s+la\s+noche/iu, days: 1, hour: 20 },
  { re: /^mañana/iu, days: 1 },
  { re: /^esta\s+mañana/iu, days: 0, hour: 9 },
  { re: /^esta\s+tarde/iu, days: 0, hour: 16 },
  { re: /^esta\s+noche/iu, days: 0, hour: 20 },
  { re: /^hoy/iu, days: 0 },
  { re: /^(?:el\s+)?lunes(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 1 },
  { re: /^(?:el\s+)?martes(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 2 },
  { re: /^(?:el\s+)?mi[eé]rcoles(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 3 },
  { re: /^(?:el\s+)?jueves(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 4 },
  { re: /^(?:el\s+)?viernes(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 5 },
  { re: /^(?:el\s+)?s[aá]bado(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 6 },
  { re: /^(?:el\s+)?domingo(?:\s+(?:que\s+viene|pr[oó]ximo))?/iu, weekday: 0 },
  // German
  { re: /^morgen\s+früh/iu, days: 1, hour: 9 },
  { re: /^morgen\s+vormittag/i, days: 1, hour: 10 },
  { re: /^morgen\s+nachmittag/i, days: 1, hour: 14 },
  { re: /^morgen\s+abend/i, days: 1, hour: 19 },
  { re: /^übermorgen/iu, days: 2 },
  { re: /^morgen/i, days: 1 },
  { re: /^heute\s+(?:morgen|früh)/iu, days: 0, hour: 9 },
  { re: /^heute\s+nachmittag/i, days: 0, hour: 14 },
  { re: /^heute\s+abend/i, days: 0, hour: 19 },
  { re: /^heute/i, days: 0 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?montag/iu, weekday: 1 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?dienstag/iu, weekday: 2 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?mittwoch/iu, weekday: 3 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?donnerstag/iu, weekday: 4 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?freitag/iu, weekday: 5 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?samstag/iu, weekday: 6 },
  { re: /^(?:am\s+|nächsten\s+|kommenden\s+)?sonntag/iu, weekday: 0 },
  // Arabic — with or without the tanween the recogniser may add
  { re: /^غد(?:ًا|اً|ا)?\s+صباح(?:ًا|اً|ا)?/, days: 1, hour: 9 },
  { re: /^غد(?:ًا|اً|ا)?\s+مساء(?:ً|اً)?/, days: 1, hour: 19 },
  { re: /^غد(?:ًا|اً|ا)?/, days: 1 },
  { re: /^بعد\s+غد/, days: 2 },
  { re: /^(?:الليلة|هذا\s+المساء)/, days: 0, hour: 19 },
  { re: /^هذا\s+الصباح/, days: 0, hour: 9 },
  { re: /^اليوم/, days: 0 },
  { re: /^(?:يوم\s+)?ال[اإ]ثنين(?:\s+القادم)?/, weekday: 1 },
  { re: /^(?:يوم\s+)?الثلاثاء(?:\s+القادم)?/, weekday: 2 },
  { re: /^(?:يوم\s+)?ال[أا]ربعاء(?:\s+القادم)?/, weekday: 3 },
  { re: /^(?:يوم\s+)?الخميس(?:\s+القادم)?/, weekday: 4 },
  { re: /^(?:يوم\s+)?الجمعة(?:\s+القادمة)?/, weekday: 5 },
  { re: /^(?:يوم\s+)?السبت(?:\s+القادم)?/, weekday: 6 },
  { re: /^(?:يوم\s+)?ال[أا]حد(?:\s+القادم)?/, weekday: 0 },
];

/** The afternoon and evening words after an hour, in each language: they add twelve. */
const LATER_IN_DAY = /^(?:tarde|noche|sera|pomeriggio|notte|abends|nachmittags|nachts|مساء|ليل|ظهر)/iu;
const pmIf = (part: string | undefined, hour: number) => (part && LATER_IN_DAY.test(part) && hour < 12 ? hour + 12 : hour);

/**
 * An hour, but only when it says so.
 *
 * "at 5", "5pm", "17h30", "下午3点" — each carries a marker that it is a time.
 * A bare "5" never matches, which is what keeps "remind me, 5 people are
 * coming" from becoming a five o'clock alarm.
 */
const TIMES: Array<{ re: RegExp; read: (m: RegExpMatchArray) => { hour: number; minute: number } | null }> = [
  {
    // noon, midnight, midi, minuit, mezzogiorno, mediodía, Mittag — no number in it.
    re: /^(?:at\s+|à\s+|a\s+|al\s+|um\s+)?(noon|midday|midnight|midi|minuit|mezzogiorno|mezzanotte|mediod[ií]a|medianoche|mitternacht|mittags?)(?![\p{L}])/iu,
    read: (m) => ({ hour: /^(midnight|minuit|mezzanotte|medianoche|mitternacht)$/i.test(m[1]) ? 0 : 12, minute: 0 }),
  },
  {
    // Arabic noon: عند الظهر
    re: /^(?:عند\s+)?الظهر/,
    read: () => ({ hour: 12, minute: 0 }),
  },
  {
    // Italian: "alle 9", "alle ore 21", "alle 9:30 di sera"
    re: /^(?:alle(?:\s+ore)?|all['’])\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s+di\s+(mattina|sera|pomeriggio|notte))?/i,
    read: (m) => ({ hour: pmIf(m[3], Number(m[1])), minute: Number(m[2] ?? 0) }),
  },
  {
    // Spanish: "a las 9", "a la 1", "a las 9:30 de la tarde"
    re: /^a\s+las?\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s+de\s+la\s+(mañana|tarde|noche|madrugada))?/iu,
    read: (m) => ({ hour: pmIf(m[3], Number(m[1])), minute: Number(m[2] ?? 0) }),
  },
  {
    // German: "um 9", "um 9 Uhr", "um 9:30", "um 9 Uhr 30", "um 7 Uhr abends"
    re: /^um\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s*uhr(?:\s+(\d{1,2}))?)?(?:\s+(morgens|früh|vormittags|nachmittags|abends|nachts))?/iu,
    read: (m) => ({ hour: pmIf(m[4], Number(m[1])), minute: Number(m[2] ?? m[3] ?? 0) }),
  },
  {
    // Arabic: "الساعة 9", "في الساعة 9 والنصف مساءً"
    re: /^(?:في\s+|عند\s+)?الساعة\s+(\d{1,2})(?:[:.](\d{2}))?(?:\s+و\s*(?:ال)?(نصف|ربع))?(?:\s+(صباح(?:ًا|اً|ا)?|مساء(?:ً|اً)?|ظهر(?:ًا|اً|ا)?|ليل(?:ًا|اً|ا)?))?/,
    read: (m) => ({ hour: pmIf(m[4], Number(m[1])), minute: m[3] === 'نصف' ? 30 : m[3] === 'ربع' ? 15 : Number(m[2] ?? 0) }),
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
    // Whole words only: "in 30 Minuten" is German, not "in 30 minute" and an "n".
    re: /^in\s+(?:an?\s+|(\d{1,3})\s*)(minutes?|mins?|hours?|hrs?|days?)(?![\p{L}])/iu,
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
  {
    // "tra 20 minuti", "fra un'ora", "tra 2 giorni"
    re: /^(?:tra|fra)\s+(?:un['’]?\s*|(\d{1,3})\s*)(minut[oi]|or[ae]|giorn[oi])/i,
    minutes: (m) => scale(m[1] ? Number(m[1]) : 1, m[2]),
  },
  {
    // "dentro de 20 minutos", "en una hora", "en 2 días"
    re: /^(?:dentro\s+de|en)\s+(?:una?\s+|(\d{1,3})\s*)(minutos?|horas?|d[ií]as?)/iu,
    minutes: (m) => scale(m[1] ? Number(m[1]) : 1, m[2]),
  },
  {
    // "in 20 Minuten", "in einer Stunde", "in 2 Tagen"
    re: /^in\s+(?:einer?\s+|(\d{1,3})\s*)(minuten?|stunden?|tag(?:en)?)(?![\p{L}])/iu,
    minutes: (m) => scale(m[1] ? Number(m[1]) : 1, m[2]),
  },
  {
    // "بعد 20 دقيقة", "بعد ساعة", "بعد ساعتين", "بعد يومين"
    re: /^بعد\s+(?:(\d{1,3})\s*)?(دقيقة|دقائق|ساعتين|ساعات|ساعة|يومين|أيام|يوم)/,
    minutes: (m) => scale(m[1] ? Number(m[1]) : /ين$/.test(m[2]) ? 2 : 1, m[2]),
  },
];

function scale(count: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^(hour|hrs?|heure|小时|钟头|or[ae]|hora|stunde|ساع)/.test(u)) return count * 60;
  if (/^(day|jour|天|giorn|d[ií]a|tag|يوم|أيام)/.test(u)) return count * 60 * 24;
  return count;
}

/** Where a spoken hour lands when nobody said morning or afternoon. */
function assume(hour: number, said: string): number {
  // 1 to 7 with no marker is the afternoon: nobody asks to be reminded at
  // five past four in the morning without saying so.
  const morning = /\b(a\.?m\.?|morning|matin|mattina|morgens|vormittags)\b|mañana|madrugada|früh|早上|上午|صباح/i;
  if (hour >= 1 && hour <= 7 && !morning.test(said)) return hour + 12;
  return hour;
}

/** The time clause at the very start of `rest`, if there is one. */
function readClause(rest: string, now: Date): { at: Date; length: number } | null {
  const trimmed = rest.replace(/^[\s,;:.·、，。،]+/, '');
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
    const stated =
      /[ap]\.?m|o'clock|早上|上午|中午|下午|晚上|mattina|sera|pomeriggio|notte|mañana|tarde|noche|madrugada|morgens|früh|vormittags|nachmittags|abends|nachts|صباح|مساء|ظهر|ليل/iu.test(m[0]) ||
      read.hour > 12;
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
      // Arabic-Indic and Persian digits, which some recognisers write
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      // Italian: "alle nove", "alle nove e mezza", "all'una", "tra mezz'ora", "tra venti minuti"
      .replace(
        new RegExp(`\\b(?:alle(?:\\s+ore)?|all['’])\\s*(${words(IT_HOURS)})(?:\\s+e\\s+(mezza|mezzo|un\\s+quarto|quarto))?(?![\\p{L}])`, 'giu'),
        (_, h: string, m: string | undefined) => `alle ${lookup(IT_HOURS, h)}${m ? (/^mezz/i.test(m) ? ':30' : ':15') : ''}`,
      )
      .replace(/\b(tra|fra)\s+mezz['’]ora\b/gi, '$1 30 minuti')
      .replace(new RegExp(`\\b(tra|fra)\\s+(${words(IT_COUNTS)})\\s+(minuti|ore|giorni)\\b`, 'gi'), (_, p: string, n: string, u: string) => `${p} ${lookup(IT_COUNTS, n)} ${u}`)
      // Spanish: "a las nueve", "a las nueve y media", "en media hora", "dentro de veinte minutos"
      .replace(
        new RegExp(`(?<![\\p{L}])a\\s+las?\\s+(${words(ES_HOURS)})(?:\\s+y\\s+(media|cuarto))?(?![\\p{L}])`, 'giu'),
        (_, h: string, m: string | undefined) => `a las ${lookup(ES_HOURS, h)}${m ? (/^media/i.test(m) ? ':30' : ':15') : ''}`,
      )
      .replace(/(?<![\p{L}])(dentro\s+de|en)\s+media\s+hora(?![\p{L}])/giu, '$1 30 minutos')
      .replace(new RegExp(`(?<![\\p{L}])(dentro\\s+de|en)\\s+(${words(ES_COUNTS)})\\s+(minutos|horas|d[ií]as)(?![\\p{L}])`, 'giu'), (whole, p: string, n: string, u: string) =>
        /^una?$/i.test(n) ? whole : `${p} ${lookup(ES_COUNTS, n)} ${u}`,
      )
      // German: "um halb zehn" is half past nine; "um Viertel nach neun", "um neun", "in einer halben Stunde"
      .replace(new RegExp(`(?<![\\p{L}])um\\s+halb\\s+(${words(DE_HOURS)})(?![\\p{L}])`, 'giu'), (_, h: string) => {
        const v = lookup(DE_HOURS, h);
        return `um ${v === 1 ? 12 : v - 1}:30`;
      })
      .replace(new RegExp(`(?<![\\p{L}])um\\s+viertel\\s+nach\\s+(${words(DE_HOURS)})(?![\\p{L}])`, 'giu'), (_, h: string) => `um ${lookup(DE_HOURS, h)}:15`)
      .replace(new RegExp(`(?<![\\p{L}])um\\s+viertel\\s+vor\\s+(${words(DE_HOURS)})(?![\\p{L}])`, 'giu'), (_, h: string) => {
        const v = lookup(DE_HOURS, h);
        return `um ${v === 1 ? 12 : v - 1}:45`;
      })
      .replace(new RegExp(`(?<![\\p{L}])um\\s+(${words(DE_HOURS)})(?![\\p{L}])`, 'giu'), (_, h: string) => `um ${lookup(DE_HOURS, h)}`)
      .replace(/(?<![\p{L}])in\s+einer\s+halben\s+stunde(?![\p{L}])/giu, 'in 30 Minuten')
      .replace(new RegExp(`(?<![\\p{L}])in\\s+(${words(DE_COUNTS)})\\s+(minuten|stunden|tagen)(?![\\p{L}])`, 'giu'), (_, n: string, u: string) => `in ${lookup(DE_COUNTS, n)} ${u}`)
      // Arabic: "الساعة التاسعة", "بعد نصف ساعة"
      .replace(new RegExp(`الساعة\\s+(${AR_ORDINALS})`, 'g'), (_, h: string) => `الساعة ${AR_HOURS[h]}`)
      .replace(/بعد\s+نصف\s+ساعة/g, 'بعد 30 دقيقة')
  );
}

const IT_HOURS: Record<string, number> = {
  una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
};
const IT_COUNTS: Record<string, number> = { ...IT_HOURS, quindici: 15, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50 };
const ES_HOURS: Record<string, number> = {
  una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
};
const ES_COUNTS: Record<string, number> = { ...ES_HOURS, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50 };
const DE_HOURS: Record<string, number> = {
  eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
};
const DE_COUNTS: Record<string, number> = {
  zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
  fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50,
};
/** Arabic hours are said as feminine ordinals: الساعة التاسعة, nine o'clock. */
const AR_HOURS: Record<string, number> = {
  'الحادية عشرة': 11, 'الثانية عشرة': 12, الواحدة: 1, الثانية: 2, الثالثة: 3, الرابعة: 4, الخامسة: 5,
  السادسة: 6, السابعة: 7, الثامنة: 8, التاسعة: 9, العاشرة: 10,
};
const AR_ORDINALS = Object.keys(AR_HOURS).sort((a, b) => b.length - a.length).join('|');

/** Tidy the sentence left behind: no double spaces, no dangling comma. */
function tidy(text: string): string {
  // Line breaks the person asked for stay; only runs of spaces collapse.
  const out = text
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]*\n[^\S\n]*/g, '\n')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:.\-–—·、，。]+/, '')
    .replace(/[\s,;:\-–—]+$/, '')
    .replace(/^(?:to|that|about|de|d'|que|qu'|à|di|da|zu|dass|an|أن)\s+/i, '')
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
