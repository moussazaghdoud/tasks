/**
 * "New line" — a line break inside the thought.
 *
 * Saying "new line", "à la ligne" or "换行" puts the next words on a line of
 * their own, the way the Return key would if you were typing. It is still one
 * thought; the command words themselves never reach it.
 *
 * "Enter" and "entrée" count too, but only where they cannot be part of the
 * sentence: "enter the figures" and "réserver l'entrée" stay as they are.
 */

/** Always a command, wherever it falls. */
const ALWAYS = [
  // English
  /\b(?:new|next)\s+(?:line|paragraph)\b/gi,
  /\bline\s+break\b/gi,
  // French — longest first, so "retour à la ligne" goes whole
  /(?<![\p{L}])retour\s+à\s+la\s+ligne(?![\p{L}])/giu,
  /(?<![\p{L}])(?:nouvelle\s+ligne|nouveau\s+paragraphe|saut\s+de\s+ligne)(?![\p{L}])/giu,
  /(?<![\p{L}])à\s+la\s+ligne(?![\p{L}])/giu,
  // Chinese
  /另起一行|换行|下一行|新段落|回车/g,
  // Italian — "a capo", but not "a capo del progetto" (at the head of)
  /(?<![\p{L}])(?:nuova\s+riga|nuovo\s+paragrafo)(?![\p{L}])/giu,
  /(?<![\p{L}])a\s+capo(?![\p{L}])(?!\s+d(?:i|el|ella|ello|ei|egli|elle|ell['’])(?![\p{L}]))/giu,
  // Spanish
  /(?<![\p{L}])(?:nueva\s+l[ií]nea|punto\s+y\s+aparte|nuevo\s+p[aá]rrafo)(?![\p{L}])/giu,
  // German
  /(?<![\p{L}])(?:neue\s+zeile|neuer\s+absatz)(?![\p{L}])/giu,
  // Arabic
  /سطر\s+جديد|فقرة\s+جديدة/g,
];

/** "Enter" alone between pauses, or at either end. */
const ENTER_EN = /(?:^|(?<=[.,;:!?]))\s*enter\s*(?=[.,;:!?]|$)/gi;
/** "Entrée" with no article in front of it — "l'entrée", "une entrée" are nouns. */
const ENTER_FR = /(?<![’'\p{L}])(?<!\b(?:une|en|les|des|son|sa|mon|ma|ton|ta|votre|notre|cette|leur|d|l)\s+)entrée(?![\p{L}])/giu;

const MARK = '\u0000';

/**
 * Where each spoken "new line" sits in what was said, as [start, end) ranges
 * in that same text — so the words can be shown understood while they are
 * still being spoken. The same patterns as withLineBreaks, so what lights up
 * is exactly what will become a line break.
 */
export function lineBreakSpans(said: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const re of [...ALWAYS, ENTER_EN, ENTER_FR]) {
    for (const m of said.matchAll(new RegExp(re.source, re.flags))) {
      if (m.index === undefined || !m[0].trim()) continue;
      // The ENTER patterns take the space around the word with them.
      const lead = m[0].length - m[0].trimStart().length;
      spans.push([m.index + lead, m.index + lead + m[0].trim().length]);
    }
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

/**
 * What was said, with each spoken "new line" turned into a real one. Lines
 * left empty — a command said twice, or at either end — are dropped.
 */
export function withLineBreaks(said: string): string {
  let marked = said;
  for (const re of ALWAYS) marked = marked.replace(re, MARK);
  marked = marked.replace(ENTER_EN, MARK).replace(ENTER_FR, MARK);
  if (!marked.includes(MARK)) return said.trim();

  return (
    marked
      .split(MARK)
      // What the recogniser left around the command: a comma, a full stop.
      .map((line) => line.replace(/^[\s,;:.·、，。]+/, '').replace(/[\s,;:.·、，。]+$/, '').trim())
      .filter(Boolean)
      .map((line) => line.charAt(0).toUpperCase() + line.slice(1))
      .join('\n')
  );
}
