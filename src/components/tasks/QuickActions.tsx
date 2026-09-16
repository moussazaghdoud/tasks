import { CalendarDays, Ellipsis, Flag } from 'lucide-react';
import type { Task } from '@/domain/types';
import { addDaysKey, nextWeekKey, todayKey } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { anchorFromElement, ui } from '@/store/ui';
import { schedule, toggleImportant } from '@/actions/taskActions';
import { useWorkspace } from '@/store/workspace';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Actions that sit right after the task's sentence. The two date buttons adapt:
 * a task already due today offers Tomorrow / Next week instead of Today.
 */
export function QuickActions({ task, visible }: { task: Task; visible: boolean }) {
  const weekStartsOn = useWorkspace((s) => s.user.preferences.weekStartsOn);
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const nextWeek = nextWeekKey(today, weekStartsOn);

  const due = task.dueDate ?? '';
  const dateOptions: Array<{ label: string; date: string; hint: string; shortcut?: string }> =
    due && due <= today
      ? [
          ...(due < today ? [{ label: 'Today', date: today, hint: 'Do it today', shortcut: 't' }] : []),
          { label: 'Tomorrow', date: tomorrow, hint: 'Move to tomorrow' },
          ...(due === today ? [{ label: 'Next week', date: nextWeek, hint: 'Move to next week' }] : []),
        ]
      : due === tomorrow
        ? [
            { label: 'Today', date: today, hint: 'Do it today', shortcut: 't' },
            { label: 'Next week', date: nextWeek, hint: 'Move to next week' },
          ]
        : [
            { label: 'Today', date: today, hint: 'Do it today', shortcut: 't' },
            { label: 'Tomorrow', date: tomorrow, hint: 'Do it tomorrow' },
          ];

  const important = task.priority === 'important';
  const btn =
    'inline-flex h-[26px] items-center rounded-[6px] text-[12.5px] font-medium text-ink-3 transition-colors duration-100 hover:bg-wash-strong hover:text-ink';

  return (
    <div
      // Out of the layout until the row is hovered or focused, so the
      // actions never cost the title any width at rest.
      className={cn(
        'shrink-0 animate-fade items-center gap-0.5 pl-2 max-md:!hidden',
        visible ? 'flex' : 'hidden group-hover/row:flex group-focus-within/row:flex',
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {dateOptions.map((o) => (
        <Tooltip key={o.label} label={o.hint} shortcut={o.shortcut}>
          <button className={cn(btn, 'px-2')} onClick={() => schedule([task.id], o.date, null)}>
            {o.label}
          </button>
        </Tooltip>
      ))}
      <Tooltip label="Schedule" shortcut="d">
        <button
          aria-label="Schedule"
          className={cn(btn, 'w-[26px] justify-center')}
          onClick={(e) => ui().openPicker({ kind: 'date', taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
        >
          <CalendarDays className="size-[15px]" />
        </button>
      </Tooltip>
      <Tooltip label={important ? 'Remove importance' : 'Make important'} shortcut="i">
        <button
          aria-label={important ? 'Remove importance' : 'Make important'}
          aria-pressed={important}
          className={cn(btn, 'w-[26px] justify-center', important && 'text-ember hover:text-ember')}
          onClick={() => toggleImportant([task.id])}
        >
          <Flag className="size-[15px]" fill={important ? 'currentColor' : 'none'} />
        </button>
      </Tooltip>
      <Tooltip label="More actions" shortcut=".">
        <button
          aria-label="More actions"
          className={cn(btn, 'w-[26px] justify-center')}
          onClick={(e) => ui().openPicker({ kind: 'actions', taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
        >
          <Ellipsis className="size-[16px]" />
        </button>
      </Tooltip>
    </div>
  );
}
