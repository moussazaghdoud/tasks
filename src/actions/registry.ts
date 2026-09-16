import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CircleDot,
  Copy,
  Crosshair,
  Flag,
  FolderInput,
  Hourglass,
  Link,
  Link2,
  ListChecks,
  Moon,
  NotebookPen,
  Repeat,
  RotateCcw,
  Sun,
  Sunrise,
  Trash2,
  UserPlus,
  CalendarArrowUp,
  type LucideIcon,
} from 'lucide-react';
import type { ID, Task } from '@/domain/types';
import { addDaysKey, nextWeekKey, todayKey } from '@/lib/dates';
import { ui, type PickerKind } from '@/store/ui';
import { ws } from '@/store/workspace';
import {
  archiveTasks,
  completeTasks,
  copyTaskLink,
  deferLater,
  deleteTasks,
  duplicateTask,
  openDetail,
  schedule,
  toggleImportant,
} from './taskActions';

export interface TaskActionDef {
  id: string;
  label: (tasks: Task[]) => string;
  icon: LucideIcon;
  /** Extra words the menu and palette should match. */
  keywords: string;
  shortcut?: string;
  section: 'When' | 'Organize' | 'Work' | 'Manage';
  picker?: PickerKind;
  /** Only meaningful for a single task. */
  single?: boolean;
  visible?: (tasks: Task[]) => boolean;
  run?: (ids: ID[]) => void;
  danger?: boolean;
}

const one = (tasks: Task[]) => tasks.length === 1;
const allDone = (tasks: Task[]) => tasks.every((t) => t.status === 'done');

export const TASK_ACTIONS: TaskActionDef[] = [
  {
    id: 'today',
    label: () => 'Today',
    icon: Sun,
    keywords: 'do today now schedule',
    shortcut: 't',
    section: 'When',
    visible: (ts) => !ts.every((t) => t.dueDate === todayKey()),
    run: (ids) => schedule(ids, todayKey(), null),
  },
  {
    id: 'tomorrow',
    label: () => 'Tomorrow',
    icon: Sunrise,
    keywords: 'schedule tomorrow postpone',
    section: 'When',
    visible: (ts) => !ts.every((t) => t.dueDate === addDaysKey(todayKey(), 1)),
    run: (ids) => schedule(ids, addDaysKey(todayKey(), 1), null),
  },
  {
    id: 'nextweek',
    label: () => 'Next week',
    icon: CalendarArrowUp,
    keywords: 'schedule next week postpone monday',
    section: 'When',
    run: (ids) => schedule(ids, nextWeekKey(todayKey(), ws().user.preferences.weekStartsOn), null),
  },
  { id: 'schedule', label: () => 'Schedule…', icon: CalendarDays, keywords: 'date due deadline when pick calendar', shortcut: 'd', section: 'When', picker: 'date' },
  {
    id: 'later',
    label: () => 'Later',
    icon: Moon,
    keywords: 'someday defer backlog no date',
    shortcut: 'l',
    section: 'When',
    visible: (ts) => !ts.every((t) => t.deferred && !t.dueDate),
    run: (ids) => deferLater(ids),
  },
  { id: 'remind', label: () => 'Remind me…', icon: Bell, keywords: 'reminder alert notify alarm', shortcut: 'r', section: 'When', picker: 'remind' },
  { id: 'repeat', label: () => 'Repeat…', icon: Repeat, keywords: 'recurring every daily weekly monthly recurrence', section: 'When', picker: 'repeat' },

  {
    id: 'important',
    label: (ts) => (ts.every((t) => t.priority === 'important') ? 'Remove importance' : 'Make important'),
    icon: Flag,
    keywords: 'important priority urgent flag star',
    shortcut: 'i',
    section: 'Organize',
    run: (ids) => toggleImportant(ids),
  },
  { id: 'priority', label: () => 'Priority…', icon: CircleDot, keywords: 'priority important normal low', shortcut: 'p', section: 'Organize', picker: 'priority' },
  { id: 'move', label: () => 'Move to…', icon: FolderInput, keywords: 'project move file inbox', shortcut: 'm', section: 'Organize', picker: 'project' },
  { id: 'assign', label: () => 'Assign…', icon: UserPlus, keywords: 'assign delegate owner person give', shortcut: 'a', section: 'Organize', picker: 'assign' },
  { id: 'status', label: () => 'Status…', icon: CircleDot, keywords: 'status progress waiting blocked open', section: 'Organize', picker: 'status' },
  { id: 'estimate', label: () => 'Estimate…', icon: Hourglass, keywords: 'duration estimate time minutes hours', section: 'Organize', picker: 'estimate' },

  { id: 'note', label: () => 'Add note', icon: NotebookPen, keywords: 'note notes description details comment', single: true, section: 'Work', run: (ids) => openDetail(ids[0], 'notes') },
  { id: 'subtask', label: () => 'Add subtask', icon: ListChecks, keywords: 'subtask checklist step', single: true, section: 'Work', run: (ids) => openDetail(ids[0], 'subtask') },
  { id: 'attach', label: () => 'Attach link', icon: Link2, keywords: 'attach link url file document', single: true, section: 'Work', run: (ids) => openDetail(ids[0], 'link') },
  { id: 'focus', label: () => 'Focus on this', icon: Crosshair, keywords: 'focus mode timer work start', shortcut: 'f', single: true, section: 'Work', run: (ids) => ui().startFocus(ids[0]) },

  {
    id: 'complete',
    label: (ts) => (allDone(ts) ? 'Reopen' : 'Complete'),
    icon: Check,
    keywords: 'complete done finish check close reopen',
    shortcut: 'mod+enter',
    section: 'Manage',
    run: (ids) => {
      const tasks = ids.map((id) => ws().tasks[id]).filter(Boolean);
      if (allDone(tasks)) ws().reopen(ids);
      else void completeTasks(ids);
    },
  },
  { id: 'duplicate', label: () => 'Duplicate', icon: Copy, keywords: 'duplicate copy clone', single: true, section: 'Manage', run: (ids) => duplicateTask(ids[0]) },
  { id: 'copylink', label: () => 'Copy link', icon: Link, keywords: 'copy link url share', single: true, section: 'Manage', run: (ids) => void copyTaskLink(ids[0]) },
  { id: 'archive', label: () => 'Archive', icon: Archive, keywords: 'archive hide', section: 'Manage', run: (ids) => archiveTasks(ids) },
  { id: 'delete', label: () => 'Delete', icon: Trash2, keywords: 'delete remove trash', shortcut: 'backspace', section: 'Manage', danger: true, run: (ids) => deleteTasks(ids) },
];

export const RESTORE_ACTION: TaskActionDef = {
  id: 'reopen',
  label: () => 'Reopen',
  icon: RotateCcw,
  keywords: 'reopen undo',
  section: 'Manage',
};

export function actionsFor(tasks: Task[]): TaskActionDef[] {
  return TASK_ACTIONS.filter((a) => (!a.single || one(tasks)) && (!a.visible || a.visible(tasks)));
}

export function runAction(action: TaskActionDef, ids: ID[], anchorEl?: Element | null) {
  if (action.picker) {
    const rect = anchorEl?.getBoundingClientRect();
    ui().openPicker({
      kind: action.picker,
      taskIds: ids,
      anchor: rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : { x: window.innerWidth / 2 - 150, y: 140, width: 0, height: 0 },
    });
    return;
  }
  action.run?.(ids);
}
