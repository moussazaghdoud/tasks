/**
 * "Define VXLAN", "What is EVPN", "C'est quoi le zero trust" — a definition
 * asked for in the middle of capturing, from any tab.
 *
 * Only a short term counts. "Define the budget with Paul" is a task, and so
 * is anything long or joined by "with", "for", "and": those stay thoughts.
 * When a definition is taken by mistake, the toast that announces it offers
 * to keep the words as a thought instead, so nothing is ever lost.
 */

// "l'" and "dell'" lean on the next word with no space: "l'EVPN".
const ARTICLES = String.raw`(?:(?:an?|the|un|une|le|la|les|el|los|las|il|lo|gli|i|der|die|das|ein|eine)\s+|l['’]\s*)?`;

/** Each pattern captures the term after the asking words. */
const ASKING: RegExp[] = [
  // English
  new RegExp(String.raw`^(?:please\s+)?(?:define|definition\s+of|what(?:['’]s|\s+is|\s+are)|whats|explain)\s+${ARTICLES}(.+)$`, 'iu'),
  // French — the imperative "définis", never the infinitive "définir" a task begins with
  new RegExp(String.raw`^(?:définis|définition\s+de|c['’]est\s+quoi|qu['’]est[- ]ce\s+que(?:\s+c['’]est\s+qu?e?)?|explique(?:-moi)?)\s+${ARTICLES}(.+)$`, 'iu'),
  // Italian
  new RegExp(String.raw`^(?:definisci|definizione\s+di|(?:che\s+)?cos['’]è|cosa\s+(?:è|sono)|spiega(?:mi)?)\s+${ARTICLES}(.+)$`, 'iu'),
  // Spanish
  new RegExp(String.raw`^(?:define|definición\s+de|qu[ée]\s+(?:es|son)|explica(?:me)?)\s+${ARTICLES}(.+)$`, 'iu'),
  // German
  new RegExp(String.raw`^(?:definiere|definition\s+von|was\s+(?:ist|sind|bedeutet)|erkläre?)\s+${ARTICLES}(.+)$`, 'iu'),
  // Chinese
  /^(?:定义|什么是|解释一下|解释)\s*(.+)$/u,
  /^(.+?)是什么(?:意思)?$/u,
];

/** Words that join a term to a task: "the budget with Paul", "slides for Monday". */
const JOINERS = /(?:^|\s)(?:with|for|to|and|by|before|avec|pour|et|avant|mit|für|und|vor|con|per|e|prima|y|para|antes)(?:\s|$)|[和跟给为]/iu;

const strip = (s: string) =>
  s
    .trim()
    .replace(/^[\s,;:"'«“]+|[\s,;:.!?？。"'»”]+$/gu, '')
    .trim();

/** Whether these words read as a term to define, not a sentence. */
export function looksLikeTerm(term: string): boolean {
  if (!term || term.length > 40) return false;
  if (JOINERS.test(term)) return false;
  const chinese = /[㐀-鿿]/u.test(term);
  return chinese ? term.length <= 12 : term.split(/\s+/).length <= 4;
}

/** The term a definition is asked for, or null when these words are a thought. */
export function definitionAsked(said: string): string | null {
  const text = strip(said);
  for (const re of ASKING) {
    const m = re.exec(text);
    if (!m) continue;
    const term = strip(m[1]);
    return looksLikeTerm(term) ? term : null;
  }
  return null;
}

/** In the Know tab no asking is needed: the words are the term, tidied. */
export function termOf(said: string): string | null {
  const term = definitionAsked(said) ?? strip(said);
  return term && term.length <= 80 ? term : null;
}
