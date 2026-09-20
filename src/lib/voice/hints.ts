/**
 * The words the recogniser is about to hear.
 *
 * Dictation is good at ordinary language and poor at names — which is most of
 * what gets spoken into this app: "Thierry" becomes "Terry", "Bosch" becomes
 * "Bosh", "IPS" becomes "I P S". Apple accepts a vocabulary of expected terms
 * per request, and it is the single largest accuracy win available to us,
 * because we already know exactly who and what this person talks about.
 */
import { ME } from '@/domain/factories';
import { ws } from '@/store/workspace';

/** Apple caps what it will usefully take; past this it stops helping. */
const LIMIT = 100;

/** Words worth teaching: capitalised mid-sentence, or all-caps initialisms. */
export function properNouns(text: string): string[] {
  const out: string[] = [];
  const words = text.split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length < 2) continue;
    const isAcronym = w.length <= 5 && w === w.toUpperCase() && /\p{Lu}/u.test(w);
    // Skip the first word of the title: it is capitalised by convention.
    const isName = i > 0 && /^\p{Lu}\p{Ll}+/u.test(w);
    if (isAcronym || isName) out.push(w);
  }
  return out;
}

export function speechHints(): string[] {
  const s = ws();
  const seen = new Set<string>();
  const add = (word: string | undefined) => {
    const w = word?.trim();
    if (!w || w.length < 2 || seen.size >= LIMIT) return;
    const key = w.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hints.push(w);
  };
  const hints: string[] = [];

  // People first — the most frequently spoken and the most often misheard.
  for (const p of Object.values(s.people)) {
    if (p.id === ME) continue;
    add(p.name);
    const [first] = p.name.split(/\s+/);
    add(first);
  }

  for (const p of Object.values(s.projects)) {
    if (p.archivedAt) continue;
    add(p.name);
  }

  // Then whatever else this person's own thoughts are full of.
  for (const t of Object.values(s.tasks)) {
    if (t.archivedAt || t.status === 'done') continue;
    for (const w of properNouns(t.title)) add(w);
    if (seen.size >= LIMIT) break;
  }

  return hints;
}
