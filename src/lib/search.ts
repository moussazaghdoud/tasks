/**
 * Search & smart-view query language.
 *
 * Free text plus optional filters, written the way people talk:
 *   "board"                       text match
 *   "#ips overdue"                project + state
 *   "@thierry"                    assignee
 *   "completed last week"         completed in the previous calendar week
 *   "important this week"         important, due within 7 days
 *   "no date", "delegated", "mine", "waiting"
 */
import type { DateKey, ID, Person, Project, Task } from '@/domain/types';
import { addDaysKey, startOfWeekKey, toKey, todayKey } from './dates';

export interface QueryFilters {
  text: string[];
  projectId?: ID | null;
  personId?: ID;
  mine?: boolean;
  delegated?: boolean;
  overdue?: boolean;
  important?: boolean;
  noDate?: boolean;
  waiting?: boolean;
  due?: { from: DateKey; to: DateKey };
  completed?: { from: DateKey; to: DateKey } | 'any';
  /** Human-readable summary of what was understood. */
  chips: string[];
}

interface Ctx {
  projects: Project[];
  people: Person[];
  today?: DateKey;
  weekStartsOn?: 0 | 1;
}

type Rule = {
  re: RegExp;
  apply: (f: QueryFilters, m: RegExpMatchArray, ctx: Required<Pick<Ctx, 'today' | 'weekStartsOn'>> & Ctx) => boolean;
};

const range = (from: DateKey, to: DateKey) => ({ from, to });

const RULES: Rule[] = [
  {
    re: /\b(?:completed|done|finished)\s+(today|yesterday|this week|last week|recently|this month)\b/i,
    apply: (f, m, { today, weekStartsOn }) => {
      const w = m[1].toLowerCase();
      const sow = startOfWeekKey(today, weekStartsOn);
      if (w === 'today') f.completed = range(today, today);
      else if (w === 'yesterday') f.completed = range(addDaysKey(today, -1), addDaysKey(today, -1));
      else if (w === 'this week') f.completed = range(sow, today);
      else if (w === 'last week') f.completed = range(addDaysKey(sow, -7), addDaysKey(sow, -1));
      else if (w === 'this month') f.completed = range(today.slice(0, 8) + '01', today);
      else f.completed = range(addDaysKey(today, -7), today);
      f.chips.push(`Completed ${w}`);
      return true;
    },
  },
  {
    re: /\b(?:completed|done|finished)\b/i,
    apply: (f) => {
      if (f.completed) return true;
      f.completed = 'any';
      f.chips.push('Completed');
      return true;
    },
  },
  {
    re: /\bimportant\s+this\s+week\b/i,
    apply: (f, _m, { today }) => {
      f.important = true;
      f.due = range('0000-01-01', addDaysKey(today, 6));
      f.chips.push('Important', 'Due this week');
      return true;
    },
  },
  {
    re: /\b(?:is:)?overdue\b/i,
    apply: (f) => ((f.overdue = true), f.chips.push('Overdue'), true),
  },
  {
    re: /\b(?:no\s+(?:due\s+)?date|undated|unscheduled|no:date)\b/i,
    apply: (f) => ((f.noDate = true), f.chips.push('No date'), true),
  },
  {
    re: /\b(?:is:)?(?:important|priority)\b/i,
    apply: (f) => ((f.important = true), f.chips.push('Important'), true),
  },
  {
    re: /\b(?:is:)?(?:delegated|assigned to others)\b/i,
    apply: (f) => ((f.delegated = true), f.chips.push('Delegated'), true),
  },
  {
    re: /\b(?:assigned to me|mine|is:mine|@me)\b/i,
    apply: (f) => ((f.mine = true), f.chips.push('Assigned to me'), true),
  },
  {
    re: /\b(?:is:)?waiting\b/i,
    apply: (f) => ((f.waiting = true), f.chips.push('Waiting'), true),
  },
  {
    re: /\bdue\s+(today|tomorrow|this week|next week)\b/i,
    apply: (f, m, { today, weekStartsOn }) => {
      const w = m[1].toLowerCase();
      const sow = startOfWeekKey(today, weekStartsOn);
      if (w === 'today') f.due = range('0000-01-01', today);
      else if (w === 'tomorrow') f.due = range(addDaysKey(today, 1), addDaysKey(today, 1));
      else if (w === 'this week') f.due = range('0000-01-01', addDaysKey(sow, 6));
      else f.due = range(addDaysKey(sow, 7), addDaysKey(sow, 13));
      f.chips.push(`Due ${w}`);
      return true;
    },
  },
  {
    re: /(?:^|\s)#([\p{L}\p{N}_-]+)/iu,
    apply: (f, m, { projects }) => {
      const q = m[1].toLowerCase();
      if (q === 'inbox') {
        f.projectId = null;
        f.chips.push('Inbox');
        return true;
      }
      const p = projects.find((x) => x.name.toLowerCase() === q) ?? projects.find((x) => x.name.toLowerCase().startsWith(q));
      if (!p) return false;
      f.projectId = p.id;
      f.chips.push(p.name);
      return true;
    },
  },
  {
    re: /(?:^|\s)@([\p{L}][\p{L}\p{N}_-]*)/iu,
    apply: (f, m, { people }) => {
      const q = m[1].toLowerCase();
      const p = people.find((x) => x.name.toLowerCase().split(/\s+/)[0] === q) ?? people.find((x) => x.name.toLowerCase().startsWith(q));
      if (!p) return false;
      f.personId = p.id;
      f.chips.push(p.name);
      return true;
    },
  },
];

export function parseQuery(q: string, ctx: Ctx): QueryFilters {
  const full = { ...ctx, today: ctx.today ?? todayKey(), weekStartsOn: ctx.weekStartsOn ?? 1 };
  const f: QueryFilters = { text: [], chips: [] };
  let rest = ` ${q} `;
  for (const rule of RULES) {
    const m = rest.match(rule.re);
    if (m && rule.apply(f, m, full)) rest = rest.replace(m[0], ' ');
  }
  f.text = rest
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return f;
}

export function hasFilters(f: QueryFilters) {
  return f.chips.length > 0;
}

function haystack(t: Task, projects: Record<ID, Project>, people: Record<ID, Person>) {
  return [
    t.title,
    t.notes,
    ...t.subtasks.map((s) => s.title),
    ...t.links.map((l) => l.title),
    t.projectId ? projects[t.projectId]?.name : '',
    t.assigneeId ? people[t.assigneeId]?.name : '',
  ]
    .join('\n')
    .toLowerCase();
}

export function matchesQuery(
  t: Task,
  f: QueryFilters,
  ctx: { projects: Record<ID, Project>; people: Record<ID, Person>; me: ID; today?: DateKey },
): boolean {
  if (t.archivedAt) return false;
  const today = ctx.today ?? todayKey();
  const done = t.status === 'done';

  if (f.completed) {
    if (!done || !t.completedAt) return false;
    if (f.completed !== 'any') {
      const day = toKey(new Date(t.completedAt));
      if (day < f.completed.from || day > f.completed.to) return false;
    }
  } else if (done && !f.text.length) {
    return false;
  }
  if (f.overdue && (done || !t.dueDate || t.dueDate >= today)) return false;
  if (f.important && t.priority !== 'important') return false;
  if (f.noDate && t.dueDate) return false;
  if (f.waiting && t.status !== 'waiting') return false;
  if (f.due && (!t.dueDate || t.dueDate < f.due.from || t.dueDate > f.due.to)) return false;
  if (f.projectId !== undefined && t.projectId !== f.projectId) return false;
  if (f.personId && (t.assigneeId ?? ctx.me) !== f.personId) return false;
  if (f.mine && t.assigneeId && t.assigneeId !== ctx.me) return false;
  if (f.delegated && (!t.assigneeId || t.assigneeId === ctx.me)) return false;
  if (f.text.length) {
    const hay = haystack(t, ctx.projects, ctx.people);
    if (!f.text.every((w) => hay.includes(w))) return false;
  }
  return true;
}

/**
 * Relevance of a task title for the palette. 0 = no match.
 * Every word must appear; prefix > word start > inside a word.
 * (No subsequence "fuzzy" matching: it surfaced more noise than typos fixed.)
 */
export function scoreTitle(title: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = title.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  let score = 0;
  for (const w of q.split(/\s+/)) {
    const idx = t.indexOf(w);
    if (idx < 0) return 0;
    const wordStart = idx === 0 || /[\s\-_/("“]/.test(t[idx - 1]);
    score += wordStart ? 20 : 8;
  }
  return Math.min(79, score);
}
