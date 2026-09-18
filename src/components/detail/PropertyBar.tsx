import { Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';
import { ME } from '@/domain/factories';
import type { Task } from '@/domain/types';
import { recurrenceLabel } from '@/domain/recurrence';
import { formatDuration } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { anchorFromElement, ui, type PickerKind } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { Tooltip } from '@/components/ui/Tooltip';
import { whenLabel } from '@/components/pickers/DatePicker';

/**
 * One fact about the task, and a way to change it.
 *
 * Only properties that have a value appear. An empty "Remind", "Assign" and
 * "Schedule" sitting on every task is scaffolding: it fills the panel with
 * things you are not doing. Setting them from scratch is what the "…" menu is
 * for, which carries every one of these pickers.
 */
function Prop({
  label,
  set,
  kind,
  task,
  tone,
  shortcut,
  hint,
}: {
  label: ReactNode;
  set: boolean;
  kind: PickerKind;
  task: Task;
  tone?: 'ember';
  shortcut?: string;
  hint: string;
}) {
  if (!set) return null;
  return (
    <Tooltip label={hint} shortcut={shortcut}>
      <button
        onClick={(e) => ui().openPicker({ kind, taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
        className={cn(
          'inline-flex h-8 max-w-full items-center rounded-[8px] bg-wash-strong px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink max-md:h-9',
          tone === 'ember' && 'text-ember hover:text-ember',
        )}
      >
        <span className="truncate">{label}</span>
      </button>
    </Tooltip>
  );
}

/** Contextual properties. Unset ones are quiet invitations; set ones read like facts. */
export function PropertyBar({ task }: { task: Task }) {
  const project = useWorkspace((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  const assignee = useWorkspace((s) => (task.assigneeId && task.assigneeId !== ME ? s.people[task.assigneeId] : undefined));
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const today = useToday();
  const overdue = task.status !== 'done' && task.dueDate && task.dueDate < today;
  const reminder = task.reminderAt && !task.reminderFiredAt ? new Date(task.reminderAt) : null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Prop
        task={task}
        kind="date"
        set={!!task.dueDate || task.deferred}
        tone={overdue ? 'ember' : undefined}
        label={task.dueDate ? whenLabel(task.dueDate, task.dueTime, fmt) : 'Later'}
        hint="Schedule"
        shortcut="d"
      />
      <Prop
        task={task}
        kind="remind"
        set={!!reminder}
        label={reminder ? reminder.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
        hint="Remind me"
        shortcut="r"
      />
      <Prop
        task={task}
        kind="priority"
        set={task.priority !== 'normal'}
        tone={task.priority === 'important' ? 'ember' : undefined}
        label={task.priority === 'important' ? 'Important' : 'Low'}
        hint="Priority"
        shortcut="p"
      />
      <Prop task={task} kind="project" set={!!project} label={project?.name ?? ''} hint="Move to project" shortcut="m" />
      <Prop task={task} kind="assign" set={!!assignee} label={assignee?.name ?? ''} hint="Assign" shortcut="a" />
      {task.recurrence && <Prop task={task} kind="repeat" set label={recurrenceLabel(task.recurrence, task.dueDate)} hint="Repeat" />}
      {!!task.estimatedMinutes && <Prop task={task} kind="estimate" set label={formatDuration(task.estimatedMinutes)} hint="Estimate" />}
      <Tooltip label="More" shortcut=".">
        <button
          aria-label="More actions"
          onClick={(e) => ui().openPicker({ kind: 'actions', taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
          className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink-2 max-md:size-9"
        >
          <Ellipsis className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
