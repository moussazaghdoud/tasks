import { Bell, BellOff, Clock, Coffee, Moon, Sunrise } from 'lucide-react';
import { addDaysKey, formatTime, toDate, todayKey } from '@/lib/dates';
import { defaultDateOrder, parseWhen } from '@/lib/nlp';
import { remind } from '@/actions/taskActions';
import { useWorkspace } from '@/store/workspace';
import { ListPicker, type PickItem } from './ListPicker';
import type { PickerProps } from './DatePicker';
import { whenLabel } from './DatePicker';

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function parseReminder(q: string): Date | null {
  const s = q.trim().toLowerCase();
  const rel = s.match(/^in\s+(\d+|an?|one|half an)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)$/);
  if (rel) {
    const n = rel[1] === 'half an' ? 0.5 : /^(a|an|one)$/.test(rel[1]) ? 1 : Number(rel[1]);
    const mins = rel[2].startsWith('h') ? n * 60 : n;
    return new Date(Date.now() + mins * 60000);
  }
  const w = parseWhen(s, { dateOrder: defaultDateOrder() });
  if (!w) return null;
  const date = w.date ?? todayKey();
  const d = toDate(date, w.time ?? '09:00');
  return d;
}

export function ReminderPicker({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const task = taskIds.length === 1 ? tasks[taskIds[0]] : undefined;
  const now = new Date();

  const set = (d: Date | null) => {
    remind(taskIds, d);
    onDone();
  };

  const items = (q: string): PickItem[] => {
    const out: PickItem[] = [];
    const parsed = q.trim() ? parseReminder(q) : null;
    if (parsed && parsed > now) {
      out.push({
        id: 'parsed',
        pinned: true,
        label: <span className="font-medium text-ink">{whenLabel(toKeyLocal(parsed), hhmm(parsed), fmt)}</span>,
        text: q,
        icon: <Bell className="size-4 text-accent" />,
        onSelect: () => set(parsed),
      });
    }
    const inHour = new Date(now.getTime() + 60 * 60000);
    inHour.setSeconds(0, 0);
    out.push({ id: 'hour', label: 'In 1 hour', text: 'in 1 hour soon', icon: <Clock className="size-4" />, hint: formatTime(hhmm(inHour), fmt), onSelect: () => set(inHour) });
    if (task?.dueDate && task.dueTime) {
      const at = toDate(task.dueDate, task.dueTime);
      const before = new Date(at.getTime() - 15 * 60000);
      if (before > now) {
        out.push({ id: 'before', label: '15 minutes before', text: 'before due time', icon: <Bell className="size-4" />, hint: formatTime(hhmm(before), fmt), onSelect: () => set(before) });
      }
    }
    const evening = toDate(todayKey(), '18:00');
    if (evening > now) out.push({ id: 'evening', label: 'This evening', text: 'this evening tonight', icon: <Moon className="size-4" />, hint: formatTime('18:00', fmt), onSelect: () => set(evening) });
    const tomorrow = toDate(addDaysKey(todayKey(), 1), '09:00');
    out.push({ id: 'tomorrow', label: 'Tomorrow morning', text: 'tomorrow morning', icon: <Sunrise className="size-4" />, hint: formatTime('09:00', fmt), onSelect: () => set(tomorrow) });
    if (task?.dueDate && task.dueDate > addDaysKey(todayKey(), 1)) {
      const morningOf = toDate(task.dueDate, '09:00');
      out.push({ id: 'dueday', label: 'Morning of the due date', text: 'due day morning', icon: <Coffee className="size-4" />, hint: whenLabel(task.dueDate, '09:00', fmt), onSelect: () => set(morningOf) });
    }
    if (task?.reminderAt) out.push({ id: 'off', label: 'Remove reminder', text: 'remove clear off none', icon: <BellOff className="size-4" />, onSelect: () => set(null) });
    return out;
  };

  return <ListPicker items={items} placeholder="Remind me… “in 20 min”, “fri 9am”" onClose={onDone} onBack={onBack} size={size} leading={<Bell className="size-4 shrink-0 text-ink-4" />} />;
}

function toKeyLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
