import { registerPlugin } from '@capacitor/core';
import { isNative } from '@/lib/native/platform';

/**
 * A Wikipedia opening made into what fits a glance in a meeting: one
 * sentence, then three points.
 *
 * On an iPhone with Apple Intelligence, Apple's on-device model does it
 * (KnowPlugin.swift) — on the phone, free, nothing sent anywhere — and is
 * told to use only the text it is given, so it summarises rather than
 * invents. Without it, the article's own sentences are used: the first as
 * the definition, the next ones as the points.
 */

export interface Condensed {
  sentence: string;
  bullets: string[];
  /** Whether Apple's on-device model wrote it. */
  byModel: boolean;
}

interface KnowPlugin {
  condense(options: { term: string; text: string; lang: string }): Promise<{ available: boolean; text?: string }>;
}

const Know = registerPlugin<KnowPlugin>('Know');

/** Sentences of an extract, in any of the app's languages. */
export function sentencesOf(text: string): string[] {
  // A Latin full stop ends a sentence only before a space (not in "e.g." or
  // "3.5"); a Chinese one ends it outright, with no space after.
  return (text.match(/[^.!?。！？]+(?:[.!?]+(?=\s|$)|[。！？]+)|[^.!?。！？]+$/gu) ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Without the model: the article's first sentence, then up to three more as points. */
export function fromExtract(extract: string): Condensed {
  const [first = extract, ...rest] = sentencesOf(extract);
  return { sentence: clip(first, 260), bullets: rest.slice(0, 3).map((s) => clip(s, 180)), byModel: false };
}

/**
 * The model's answer, read: the first line is the sentence, lines starting
 * with "-", "•" or "*" are the points. Null when it does not have that shape.
 */
export function parseModel(text: string): Condensed | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const bullets = lines.filter((l) => /^[-•*]\s*/u.test(l)).map((l) => l.replace(/^[-•*]\s*/u, '').trim());
  const sentence = lines.find((l) => !/^[-•*]/u.test(l))?.replace(/^(?:definition|définition|sentence)\s*:\s*/iu, '');
  if (!sentence || bullets.length < 2) return null;
  return { sentence: clip(sentence, 260), bullets: bullets.slice(0, 4).map((b) => clip(b, 180)), byModel: true };
}

export async function condense(term: string, extract: string, lang: string): Promise<Condensed> {
  if (isNative()) {
    try {
      const result = await Know.condense({ term, text: extract, lang });
      const parsed = result.available && result.text ? parseModel(result.text) : null;
      if (parsed) return parsed;
    } catch {
      /* no model on this iPhone, or it declined: the article's own sentences */
    }
  }
  return fromExtract(extract);
}
