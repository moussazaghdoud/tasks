import { Bell, Link2, ListChecks, NotebookText, Pause, Repeat } from 'lucide-react';
import { ME } from '@/domain/factories';
import type { DateKey, Task } from '@/domain/types';
import { dueLabelShort, formatTime } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { useWorkspace } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { Avatar } from '@/components/ui/Avatar';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';

export interface MetaContext {
  /** Hide the project label (inside a project view). */
  hideProject?: boolean;
  /** Hide the date when it equals this (e.g. inside a day group). */
  impliedDate?: DateKey;
  /** Home: keep only what tells you what this is and when — no counters or icons. */
  quiet?: boolean;
}

/**
 * Right-hand metadata. Only what adds information in this context — the
 * date is dropped when the view already implies it, "Normal" priority is
 * never shown. As the row narrows (container queries), labels give way
 * before the title does: names collapse to avatars and glyphs, then icons go.
 */
export function TaskMetadata({ task, ctx, className }: { task: Task; ctx: MetaContext; className?: string }) {
  const project = useWorkspace((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const assignee = useWorkspace((s) => (task.assigneeId && task.assigneeId !== ME ? s.people[task.assigneeId] : undefined));
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const today = useToday();
  const done = task.status === 'done';

  const subDone = task.subtasks.filter((s) => s.done).length;
  const overdue = !done && task.dueDate && task.dueDate < today;
  const showDate = task.dueDate && (task.dueDate !== ctx.impliedDate || overdue);
  const reminderPending = task.reminderAt && !task.reminderFiredAt && !done;

  return (
    <div className={cn('flex shrink-0 items-center gap-3 text-meta text-ink-3', className)}>
      {task.status === 'waiting' && !done && (
        <span className="inline-flex items-center gap-1" title="Waiting">
          <Pause className="size-3" strokeWidth={2.25} />
          <span className="@max-[640px]:hidden">Waiting</span>
        </span>
      )}
      {task.status === 'in_progress' && !done && (
        <span className="inline-flex items-center gap-1.5" title="In progress">
          <span className="size-[7px] rounded-full border-[1.5px] border-accent bg-[linear-gradient(90deg,var(--color-accent)_50%,transparent_50%)]" />
          <span className="@max-[640px]:hidden">In progress</span>
        </span>
      )}
      {task.subtasks.length > 0 && !ctx.quiet && (
        <span className="inline-flex items-center gap-1 font-num" title={`${subDone} of ${task.subtasks.length} subtasks done`}>
          <ListChecks className="size-3.5" />
          {subDone}/{task.subtasks.length}
        </span>
      )}
      {(task.notes.trim() || task.links.length > 0 || task.recurrence || reminderPending) && !ctx.quiet && (
        <span className="inline-flex items-center gap-1.5 text-ink-4 @max-[480px]:hidden">
          {task.notes.trim() && <NotebookText className="size-3.5" aria-label="Has notes" />}
          {task.links.length > 0 && <Link2 className="size-3.5" aria-label="Has links" />}
          {task.recurrence && <Repeat className="size-3.5" aria-label="Repeats" />}
          {reminderPending && <Bell className="size-3.5" aria-label="Reminder set" />}
        </span>
      )}
      {assignee && (
        <span className="inline-flex items-center gap-1.5" title={`Assigned to ${assignee.name}`}>
          <Avatar person={assignee} size={18} />
          <span className="@max-[600px]:hidden">{assignee.name.split(' ')[0]}</span>
        </span>
      )}
      {project && !ctx.hideProject && (
        <span className="inline-flex max-w-[120px] items-center gap-1.5 @max-[440px]:hidden" title={project.name}>
          <ProjectGlyph project={project} size={12} />
          <span className="truncate @max-[540px]:hidden">{project.name}</span>
        </span>
      )}
      {(showDate || task.dueTime) && (
        <span className={cn('inline-flex min-w-0 items-center gap-1 font-num whitespace-nowrap', overdue && 'text-ember', !overdue && task.dueDate === today && 'text-ink-2')}>
          {showDate && <span>{dueLabelShort(task.dueDate!, today)}</span>}
          {task.dueTime && <span className={cn(showDate && 'text-ink-3', overdue && 'text-ember/80')}>{formatTime(task.dueTime, fmt)}</span>}
        </span>
      )}
    </div>
  );
}
