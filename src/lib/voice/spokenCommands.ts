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
];

/** "Enter" alone between pauses, or at either end. */
const ENTER_EN = /(?:^|(?<=[.,;:!?]))\s*enter\s*(?=[.,;:!?]|$)/gi;
/** "Entrée" with no article in front of it — "l'entrée", "une entrée" are nouns. */
const ENTER_FR = /(?<![’'\p{L}])(?<!\b(?:une|en|les|des|son|sa|mon|ma|ton|ta|votre|notre|cette|leur|d|l)\s+)entrée(?![\p{L}])/giu;

const MARK = '\u0000';

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
