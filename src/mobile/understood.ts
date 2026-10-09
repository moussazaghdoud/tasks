import { lineBreakSpans, withLineBreaks } from '@/lib/voice/spokenCommands';
import { extractReminder, reminderSpan } from '@/lib/voice/spokenReminder';

/**
 * What the app has understood in words still being spoken, for the capture
 * screen to colour as they arrive: a "new line", the asking for a reminder,
 * a name from the list. Built on the very rules capture applies at the end,
 * so what lights up is what will happen — never a second opinion.
 */

export type SaidKind = 'newline' | 'when' | 'name';

export interface Segment {
  text: string;
  kind?: SaidKind;
}

export interface Understood {
  segments: Segment[];
  /** The moment a reminder would be set for, if one was asked for. */
  at: Date | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every place a known name is said, whole words only, any case. */
function nameSpans(text: string, names: string[]): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const name of names) {
    const clean = name.trim();
    if (clean.length < 2) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escape(clean)}(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of text.matchAll(re)) if (m.index !== undefined) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

export function understand(text: string, names: string[], now: Date = new Date()): Understood {
  if (!text) return { segments: [], at: null };
  const at = extractReminder(withLineBreaks(text), now).at;

  // Earlier kinds win where two overlap: a "new line" is never a name.
  const ranked: Array<[number, number, SaidKind]> = [
    ...lineBreakSpans(text).map(([s, e]) => [s, e, 'newline'] as [number, number, SaidKind]),
    ...((): Array<[number, number, SaidKind]> => {
      const span = reminderSpan(text, now);
      return span ? [[span[0], span[1], 'when']] : [];
    })(),
    ...nameSpans(text, names).map(([s, e]) => [s, e, 'name'] as [number, number, SaidKind]),
  ];
  const taken: Array<[number, number, SaidKind]> = [];
  for (const span of ranked) {
    if (taken.some(([s, e]) => span[0] < e && span[1] > s)) continue;
    taken.push(span);
  }
  taken.sort((a, b) => a[0] - b[0]);

  const segments: Segment[] = [];
  let at0 = 0;
  for (const [s, e, kind] of taken) {
    if (s > at0) segments.push({ text: text.slice(at0, s) });
    segments.push({ text: text.slice(s, e), kind });
    at0 = e;
  }
  if (at0 < text.length) segments.push({ text: text.slice(at0) });
  return { segments, at };
}
