import { Bell, CalendarDays, Ellipsis, Flag, Hourglass, Inbox, Moon, Repeat, UserPlus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ME } from '@/domain/factories';
import type { Task } from '@/domain/types';
import { recurrenceLabel } from '@/domain/recurrence';
import { formatDuration } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { anchorFromElement, ui, type PickerKind } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { Avatar } from '@/components/ui/Avatar';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { Tooltip } from '@/components/ui/Tooltip';
import { whenLabel } from '@/components/pickers/DatePicker';

function Prop({
  icon,
  label,
  set,
  kind,
  task,
  tone,
  shortcut,
  hint,
}: {
  icon: ReactNode;
  label: ReactNode;
  set: boolean;
  kind: PickerKind;
  task: Task;
  tone?: 'ember';
  shortcut?: string;
  hint: string;
}) {
  return (
    <Tooltip label={hint} shortcut={shortcut}>
      <button
        onClick={(e) => ui().openPicker({ kind, taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
        className={cn(
          'inline-flex h-7 max-w-full items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] font-medium transition-colors',
          set ? 'bg-wash-strong text-ink-2 hover:bg-sunk hover:text-ink' : 'text-ink-3 hover:bg-wash-strong hover:text-ink-2',
          tone === 'ember' && set && 'text-ember hover:text-ember',
        )}
      >
        <span className="flex shrink-0 items-center">{icon}</span>
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
        icon={task.deferred && !task.dueDate ? <Moon className="size-3.5" /> : <CalendarDays className={cn('size-3.5', overdue && 'text-ember')} />}
        label={task.dueDate ? <span className={cn(overdue && 'text-ember')}>{whenLabel(task.dueDate, task.dueTime, fmt)}</span> : task.deferred ? 'Later' : 'Schedule'}
        hint="Schedule"
        shortcut="d"
      />
      <Prop
        task={task}
        kind="remind"
        set={!!reminder}
        icon={<Bell className="size-3.5" />}
        label={reminder ? reminder.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Remind'}
        hint="Remind me"
        shortcut="r"
      />
      <Prop
        task={task}
        kind="priority"
        set={task.priority !== 'normal'}
        tone={task.priority === 'important' ? 'ember' : undefined}
        icon={<Flag className="size-3.5" fill={task.priority === 'important' ? 'currentColor' : 'none'} />}
        label={task.priority === 'important' ? 'Important' : task.priority === 'low' ? 'Low' : 'Priority'}
        hint="Priority"
        shortcut="p"
      />
      <Prop
        task={task}
        kind="project"
        set={!!project}
        icon={project ? <ProjectGlyph project={project} size={13} /> : <Inbox className="size-3.5" />}
        label={project ? project.name : 'Project'}
        hint="Move to project"
        shortcut="m"
      />
      <Prop
        task={task}
        kind="assign"
        set={!!assignee}
        icon={assignee ? <Avatar person={assignee} size={16} /> : <UserPlus className="size-3.5" />}
        label={assignee ? assignee.name : 'Assign'}
        hint="Assign"
        shortcut="a"
      />
      {task.recurrence && (
        <Prop task={task} kind="repeat" set icon={<Repeat className="size-3.5" />} label={recurrenceLabel(task.recurrence, task.dueDate)} hint="Repeat" />
      )}
      {task.estimatedMinutes && (
        <Prop task={task} kind="estimate" set icon={<Hourglass className="size-3.5" />} label={formatDuration(task.estimatedMinutes)} hint="Estimate" />
      )}
      <Tooltip label="More" shortcut=".">
        <button
          aria-label="More actions"
          onClick={(e) => ui().openPicker({ kind: 'actions', taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
          className="grid size-7 place-items-center rounded-[7px] text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink-2"
        >
          <Ellipsis className="size-4" />
        </button>
      </Tooltip>
    </div>
  );
}
