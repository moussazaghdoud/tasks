/**
 * "New line" — one breath, several thoughts.
 *
 * Saying "new line", "à la ligne" or "换行" between two things starts another
 * thought, the way the Return key would if you were typing a list. The words
 * themselves never reach the thought.
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
];

/** "Enter" alone between pauses, or at either end. */
const ENTER_EN = /(?:^|(?<=[.,;:!?]))\s*enter\s*(?=[.,;:!?]|$)/gi;
/** "Entrée" with no article in front of it — "l'entrée", "une entrée" are nouns. */
const ENTER_FR = /(?<![’'\p{L}])(?<!\b(?:une|en|les|des|son|sa|mon|ma|ton|ta|votre|notre|cette|leur|d|l)\s+)entrée(?![\p{L}])/giu;

const MARK = '\u0000';

/** Split what was said into the thoughts it holds, commands removed. */
export function splitThoughts(said: string): string[] {
  let marked = said.replace(/\r?\n/g, MARK);
  for (const re of ALWAYS) marked = marked.replace(re, MARK);
  marked = marked.replace(ENTER_EN, MARK).replace(ENTER_FR, MARK);

  const parts = marked
    .split(MARK)
    // What the recogniser left around the command: a comma, a full stop.
    .map((p) => p.replace(/^[\s,;:.·、，。]+/, '').replace(/[\s,;:.·、，。]+$/, '').trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return parts.length ? parts : said.trim() ? [said.trim()] : [];
}
