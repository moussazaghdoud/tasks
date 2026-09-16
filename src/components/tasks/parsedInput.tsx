import { AtSign, CalendarDays, Flag, Hash, Hourglass, Link2, Repeat, X } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { Person, Project, Task } from '@/domain/types';
import { recurrenceLabel } from '@/domain/recurrence';
import { formatDuration } from '@/lib/dates';
import { defaultDateOrder, hostOf, parseTask, type ParseResult, type TokenKind } from '@/lib/nlp';
import { cn } from '@/lib/platform';
import { usePeople, useProjects } from '@/store/selectors';
import { useWorkspace, ws } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { whenLabel } from '@/components/pickers/DatePicker';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { Avatar } from '@/components/ui/Avatar';

/**
 * @param baseline Text whose detections should be ignored from the start —
 * when editing an existing title, words the user already kept as text stay text.
 */
export function useParsedInput(text: string, baseline?: string) {
  const projects = useProjects();
  const people = usePeople();
  const weekStartsOn = useWorkspace((s) => s.user.preferences.weekStartsOn);
  const today = useToday();
  const [ignore, setIgnore] = useState<Set<string>>(() =>
    baseline ? new Set(parseTask(baseline, { today, projects, people, dateOrder: defaultDateOrder() }).tokens.map((t) => t.key)) : new Set(),
  );

  const result = useMemo(
    () =>
      parseTask(text, {
        today,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        people: people.map((p) => ({ id: p.id, name: p.name })),
        ignore,
        dateOrder: defaultDateOrder(),
        weekStartsOn,
      }),
    [text, projects, people, ignore, today, weekStartsOn],
  );

  const dismiss = useCallback(
    (kinds: TokenKind[]) =>
      setIgnore((prev) => {
        const next = new Set(prev);
        for (const t of result.tokens) if (kinds.includes(t.kind)) next.add(t.key);
        return next;
      }),
    [result.tokens],
  );
  const reset = useCallback(() => setIgnore(new Set()), []);

  return { result, dismiss, reset };
}

/** Convert a parse result into task fields, creating a project / person if the user named a new one. */
export function fieldsFromParse(r: ParseResult): Partial<Task> {
  const fields: Partial<Task> = {};
  if (r.dueDate) {
    fields.dueDate = r.dueDate;
    fields.dueTime = r.dueTime ?? null;
  }
  if (r.priority) fields.priority = r.priority;
  if (r.projectId) fields.projectId = r.projectId;
  else if (r.newProjectName) fields.projectId = ws().addProject({ name: r.newProjectName }).id;
  if (r.personId) fields.assigneeId = r.personId === 'me' ? null : r.personId;
  else if (r.newPersonName) fields.assigneeId = ws().addPerson(r.newPersonName).id;
  if (r.recurrence) fields.recurrence = r.recurrence;
  if (r.estimatedMinutes) fields.estimatedMinutes = r.estimatedMinutes;
  return fields;
}

export interface ChipSpec {
  id: string;
  icon: ReactNode;
  label: ReactNode;
  kinds: TokenKind[];
  tone: 'detected' | 'default';
}

export function chipsFromParse(
  r: ParseResult,
  fmt: '24h' | '12h',
  projectsById: Record<string, Project>,
  peopleById: Record<string, Person>,
): ChipSpec[] {
  const chips: ChipSpec[] = [];
  const has = (k: TokenKind) => r.tokens.some((t) => t.kind === k);
  if (has('date') || has('time')) {
    chips.push({
      id: 'when',
      icon: <CalendarDays className="size-3.5" />,
      label: r.dueDate ? whenLabel(r.dueDate, r.dueTime, fmt) : 'Today',
      kinds: ['date', 'time'],
      tone: 'detected',
    });
  }
  if (has('recurrence') && r.recurrence) {
    chips.push({ id: 'repeat', icon: <Repeat className="size-3.5" />, label: recurrenceLabel(r.recurrence, r.dueDate), kinds: ['recurrence'], tone: 'detected' });
  }
  if (has('priority') && r.priority) {
    chips.push({
      id: 'priority',
      icon: <Flag className={cn('size-3.5', r.priority === 'important' && 'text-ember')} />,
      label: r.priority === 'important' ? 'Important' : r.priority === 'low' ? 'Low priority' : 'Normal',
      kinds: ['priority'],
      tone: 'detected',
    });
  }
  if (has('project')) {
    const p = r.projectId ? projectsById[r.projectId] : null;
    chips.push({
      id: 'project',
      icon: p ? <ProjectGlyph project={p} size={12} /> : <Hash className="size-3.5" />,
      label: p ? p.name : `New project “${r.newProjectName}”`,
      kinds: ['project'],
      tone: 'detected',
    });
  }
  if (has('person')) {
    const p = r.personId ? peopleById[r.personId] : null;
    chips.push({
      id: 'person',
      icon: p ? <Avatar person={p} size={14} /> : <AtSign className="size-3.5" />,
      label: p ? (p.id === 'me' ? 'Me' : p.name) : `${r.newPersonName} (new)`,
      kinds: ['person'],
      tone: 'detected',
    });
  }
  if (has('duration') && r.estimatedMinutes) {
    chips.push({ id: 'duration', icon: <Hourglass className="size-3.5" />, label: formatDuration(r.estimatedMinutes), kinds: ['duration'], tone: 'detected' });
  }
  if (r.links.length) {
    chips.push({ id: 'link', icon: <Link2 className="size-3.5" />, label: r.links.map(hostOf).join(', '), kinds: ['link'], tone: 'detected' });
  }
  return chips;
}

export function Chip({ spec, onDismiss, compact }: { spec: ChipSpec; onDismiss: () => void; compact?: boolean }) {
  return (
    <span
      className={cn(
        'group/chip inline-flex animate-pop items-center gap-1.5 rounded-[6px] pr-1 pl-2 text-[12.5px] leading-none font-medium whitespace-nowrap',
        compact ? 'h-[22px]' : 'h-6',
        spec.tone === 'detected' ? 'bg-accent-wash text-accent-ink' : 'bg-wash-strong text-ink-2',
      )}
    >
      <span className="flex items-center opacity-80">{spec.icon}</span>
      {spec.label}
      <button
        type="button"
        aria-label={spec.tone === 'detected' ? 'Keep as text' : 'Remove'}
        title={spec.tone === 'detected' ? 'Keep these words in the title' : 'Remove'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onDismiss}
        className="grid size-4 place-items-center rounded-[4px] opacity-50 transition-opacity hover:bg-black/5 hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
