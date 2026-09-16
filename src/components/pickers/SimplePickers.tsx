import { CircleCheck, CircleDashed, CircleDot, Hourglass, Pause, Repeat, X } from 'lucide-react';
import type { RecurrenceRule, TaskStatus } from '@/domain/types';
import { recurrenceLabel } from '@/domain/recurrence';
import { formatDuration, fromKey, todayKey } from '@/lib/dates';
import { parseTask } from '@/lib/nlp';
import { repeat } from '@/actions/taskActions';
import { useWorkspace, ws } from '@/store/workspace';
import { ListPicker, type PickItem } from './ListPicker';
import type { PickerProps } from './DatePicker';

const sameRule = (a: RecurrenceRule | null | undefined, b: RecurrenceRule | null) =>
  !!a && !!b && a.freq === b.freq && a.interval === b.interval;

export function RepeatPicker({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const task = taskIds.length === 1 ? tasks[taskIds[0]] : undefined;
  const anchor = task?.dueDate ?? todayKey();
  const weekday = fromKey(anchor).toLocaleDateString('en-US', { weekday: 'long' });

  const pick = (rule: RecurrenceRule | null) => () => {
    repeat(taskIds, rule);
    onDone();
  };

  const items = (q: string): PickItem[] => {
    const out: PickItem[] = [];
    if (q.trim()) {
      const r = parseTask(`x ${/^every|daily|weekly|monthly/i.test(q.trim()) ? q : `every ${q}`}`);
      if (r.recurrence) {
        const rule = r.recurrence;
        out.push({
          id: 'parsed',
          pinned: true,
          label: <span className="font-medium text-ink">{recurrenceLabel(rule, r.dueDate ?? anchor)}</span>,
          text: q,
          icon: <Repeat className="size-4 text-accent" />,
          onSelect: () => {
            repeat(taskIds, rule);
            if (r.dueDate && r.dueDate !== todayKey()) ws().setDue(taskIds, r.dueDate);
            onDone();
          },
        });
      }
    }
    const presets: Array<[string, RecurrenceRule, string]> = [
      ['Every day', { freq: 'daily', interval: 1 }, 'daily every day'],
      ['Every weekday', { freq: 'weekdays', interval: 1 }, 'weekdays work days'],
      [`Every ${weekday}`, { freq: 'weekly', interval: 1 }, 'weekly every week'],
      [`Every other ${weekday}`, { freq: 'weekly', interval: 2 }, 'biweekly every 2 weeks'],
      ['Every month', { freq: 'monthly', interval: 1 }, 'monthly every month'],
      ['Every year', { freq: 'yearly', interval: 1 }, 'yearly annually'],
    ];
    for (const [label, rule, text] of presets) {
      out.push({ id: `${rule.freq}${rule.interval}`, label, text: `${label} ${text}`, icon: <Repeat className="size-4" />, selected: sameRule(task?.recurrence, rule), onSelect: pick(rule) });
    }
    if (task?.recurrence) out.push({ id: 'none', label: 'Don’t repeat', text: 'none stop never', icon: <X className="size-4" />, onSelect: pick(null) });
    return out;
  };

  return <ListPicker items={items} placeholder="Repeat… “every 2 weeks”" onClose={onDone} onBack={onBack} size={size} leading={<Repeat className="size-4 shrink-0 text-ink-4" />} />;
}

export function EstimatePicker({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const current = taskIds.length === 1 ? tasks[taskIds[0]]?.estimatedMinutes : undefined;
  const pick = (m: number | null) => () => {
    ws().setEstimate(taskIds, m);
    onDone();
  };
  const items = (q: string): PickItem[] => {
    const out: PickItem[] = [];
    const r = q.trim() ? parseTask(`x ${/^\d+$/.test(q.trim()) ? `${q.trim()} min` : q}`) : null;
    if (r?.estimatedMinutes) {
      out.push({ id: 'parsed', pinned: true, label: <span className="font-medium text-ink">{formatDuration(r.estimatedMinutes)}</span>, text: q, icon: <Hourglass className="size-4 text-accent" />, onSelect: pick(r.estimatedMinutes) });
    }
    for (const m of [15, 30, 45, 60, 90, 120, 180]) {
      out.push({ id: `m${m}`, label: formatDuration(m), text: `${m} min ${formatDuration(m)}`, icon: <Hourglass className="size-4" />, selected: current === m, onSelect: pick(m) });
    }
    if (current) out.push({ id: 'none', label: 'No estimate', text: 'clear remove none', icon: <X className="size-4" />, onSelect: pick(null) });
    return out;
  };
  return <ListPicker items={items} placeholder="How long? “40 min”, “1.5h”" onClose={onDone} onBack={onBack} size={size} leading={<Hourglass className="size-4 shrink-0 text-ink-4" />} />;
}

export const STATUS_META: Record<TaskStatus, { label: string; icon: typeof CircleDot }> = {
  open: { label: 'Open', icon: CircleDashed },
  in_progress: { label: 'In progress', icon: CircleDot },
  waiting: { label: 'Waiting', icon: Pause },
  done: { label: 'Done', icon: CircleCheck },
};

export function StatusPicker({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const current = taskIds.length === 1 ? tasks[taskIds[0]]?.status : undefined;
  const items: PickItem[] = (Object.keys(STATUS_META) as TaskStatus[]).map((s) => {
    const Icon = STATUS_META[s].icon;
    return {
      id: s,
      label: STATUS_META[s].label,
      text: `${STATUS_META[s].label} ${s === 'waiting' ? 'blocked on hold' : ''}`,
      icon: <Icon className="size-4" />,
      hint: s === 'waiting' ? 'On someone else' : undefined,
      selected: current === s,
      onSelect: () => {
        ws().setStatus(taskIds, s);
        onDone();
      },
    };
  });
  return <ListPicker items={items} placeholder="Status" onClose={onDone} onBack={onBack} size={size} />;
}
