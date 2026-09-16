/**
 * On-device fallback for when Claude isn't configured or reachable.
 * Deterministic and fast: strips spoken filler, splits obvious lists, and
 * reuses the composer's natural-language parser for dates, times and priority.
 */
import { defaultDateOrder, parseTask, type NamedRef } from '@/lib/nlp';
import type { VoiceTaskDraft } from './types';

const LEAD = /^(?:\s*(?:ok(?:ay)?|so|well|right|alright|um+|uh+|erm|hmm+|euh+|alors|bon|donc|ben|bah|voilà|hey)\b[,.]?\s*)+/i;
const INTENT =
  /^(?:(?:i|we)\s+(?:really\s+|also\s+)?(?:need|have|want|should|must|ought|gotta|got)\s+to|(?:i|we)(?:'m| am| are)\s+(?:going|supposed)\s+to|i'll|i will|let's|let me|remind me to|reminder to|don'?t forget to|do not forget to|note to self:?|make sure (?:to|that i|i)|il faut (?:que (?:je |j'|on )?)?|il faudrait (?:que (?:je |j'|on )?)?|je dois|je vais|on doit|n'oublie pas de|ne pas oublier de|rappelle[- ]moi de|penser à|pense à)\s*/i;
const INLINE_FILLER = /\b(?:um+|uh+|erm|euh+|hmm+)\b[,]?\s*/gi;
const TRAILING = /[\s,]*(?:please|thanks|thank you|merci|s'il te plaît|ok(?:ay)?|that's it|c'est tout)[.!]*\s*$/i;
const URGENT = /[,.;]?\s*(?:(?:it'?s|it is|this is|that'?s|that is|c'est)\s+(?:really\s+|very\s+|très\s+|super\s+)?(?:urgent|important|critical|a priority|prioritaire)|asap|as soon as possible|au plus vite)\b[.!]?/i;
const SPLIT = /(?<=[.!?])\s+|\s*;\s*|,?\s+(?:and also|also|and then|et aussi|ensuite|puis)\s+/i;

function clean(text: string): string {
  let t = text.replace(/[’‘]/g, "'").replace(INLINE_FILLER, '').trim();
  t = t.replace(LEAD, '').replace(INTENT, '').replace(TRAILING, '').trim();
  return t.replace(/[.!]+$/, '').trim();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Speech engines often lowercase names: restore known people and projects. */
function properNames(text: string, ctx: { projects: NamedRef[]; people: NamedRef[] }): string {
  const names = new Set<string>();
  for (const p of ctx.people) p.name.split(/\s+/).forEach((w) => w.length > 2 && names.add(w));
  for (const p of ctx.projects) p.name.split(/\s+/).forEach((w) => w.length > 1 && names.add(w));
  let out = text;
  for (const n of names) {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, 'giu'), n);
  }
  return out;
}

export function localAnalyze(transcript: string, ctx: { projects: NamedRef[]; people: NamedRef[]; today?: string }): VoiceTaskDraft[] {
  // Only capitalize people's names; project words like "People" stay as spoken.
  transcript = properNames(transcript, { people: ctx.people, projects: ctx.projects.filter((p) => p.name === p.name.toUpperCase()) });
  const parts = transcript
    .split(SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 2);
  const chunks = parts.length > 1 ? parts : [transcript];

  const drafts: VoiceTaskDraft[] = [];
  for (const chunk of chunks) {
    let text = clean(chunk);
    let important = false;
    if (URGENT.test(text)) {
      important = true;
      text = text.replace(URGENT, '').trim();
    }

    // "… for the IPS project", "on Rainbow" — file it and drop the phrase.
    let project: string | null = null;
    for (const p of ctx.projects) {
      const name = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phrase = new RegExp(`\\s*\\b(?:for|on|in|pour|sur)\\s+(?:the\\s+|le\\s+|la\\s+|projet\\s+)?${name}(?:\\s+project)?\\b`, 'i');
      if (phrase.test(text)) {
        project = p.name;
        text = text.replace(phrase, '').trim();
        break;
      }
      // A bare mention only counts when capitalized, so "hire people" isn't filed under "People".
      if (!project && new RegExp(`\\b${name}\\b`).test(text)) project = p.name;
    }

    const r = parseTask(text, { projects: ctx.projects, people: ctx.people, today: ctx.today, dateOrder: defaultDateOrder() });
    let title = r.title.trim() || text;
    let notes = '';
    if (title.length > 90) {
      const cut = title.search(/,\s|\s(?:because|so that|since|parce que|car|pour que)\s/i);
      if (cut > 12) {
        notes = cap(title.slice(cut).replace(/^,\s*/, '').trim());
        title = title.slice(0, cut).trim();
      }
    }
    if (!title) continue;

    drafts.push({
      title: cap(title),
      notes,
      dueDate: r.dueDate ?? null,
      dueTime: r.dueTime ?? null,
      priority: important ? 'important' : (r.priority ?? 'normal'),
      project: r.projectId ? (ctx.projects.find((p) => p.id === r.projectId)?.name ?? project) : project,
      assignee: r.personId ? (ctx.people.find((p) => p.id === r.personId)?.name ?? null) : null,
      subtasks: [],
      recurrence: r.recurrence ?? null,
      estimatedMinutes: r.estimatedMinutes ?? null,
    });
  }
  return drafts.slice(0, 10);
}
