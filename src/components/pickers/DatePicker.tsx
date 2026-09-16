import { CalendarArrowUp, CalendarCheck, CalendarX, Clock, Moon, Sofa, Sun, Sunrise, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DateKey, ID, TimeKey } from '@/domain/types';
import { addDaysKey, dueLabel, formatTime, fromKey, isWeekend, mediumDate, nextWeekKey, todayKey, weekendKey } from '@/lib/dates';
import { defaultDateOrder, parseWhen } from '@/lib/nlp';
import { useWorkspace } from '@/store/workspace';
import { deferLater, schedule } from '@/actions/taskActions';
import { cn } from '@/lib/platform';
import { ListPicker, type PickItem, type PickerSize } from './ListPicker';
import { MiniCalendar } from './MiniCalendar';

export interface PickerProps {
  taskIds: ID[];
  size: PickerSize;
  onDone: () => void;
  onBack?: () => void;
}

const weekdayShort = (d: DateKey) => fromKey(d).toLocaleDateString('en-US', { weekday: 'short' });

export function whenLabel(date: DateKey, time: TimeKey | null | undefined, fmt: '24h' | '12h') {
  const label = dueLabel(date);
  const withDay = /^(Today|Tomorrow|Yesterday)$/.test(label) || /^[A-Z][a-z]+day$/.test(label) ? label : mediumDate(date);
  return time ? `${withDay} · ${formatTime(time, fmt)}` : withDay;
}

function parseTimeInput(s: string): TimeKey | null | undefined {
  const q = s.trim();
  if (!q) return null;
  const r = parseWhen(q.match(/^\d{1,2}$/) ? `at ${q}` : q);
  return r?.time;
}

export function DatePicker({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const prefs = useWorkspace((s) => s.user.preferences);
  const first = tasks[taskIds[0]];
  const current = taskIds.length === 1 ? first?.dueDate ?? null : null;
  const [time, setTime] = useState<TimeKey | null>(taskIds.length === 1 ? first?.dueTime ?? null : null);
  const [timeText, setTimeText] = useState(time ? formatTime(time, prefs.timeFormat) : '');
  const [timeError, setTimeError] = useState(false);
  const today = todayKey();

  const busy = useMemo(() => {
    const s = new Set<DateKey>();
    for (const t of Object.values(tasks)) if (t.dueDate && t.status !== 'done' && !t.archivedAt) s.add(t.dueDate);
    return s;
  }, [tasks]);

  const apply = (date: DateKey | null, t: TimeKey | null = time) => {
    schedule(taskIds, date, date ? t : null);
    onDone();
  };

  const items = (q: string): PickItem[] => {
    const out: PickItem[] = [];
    const parsed = parseWhen(q, { dateOrder: defaultDateOrder(), weekStartsOn: prefs.weekStartsOn });
    if (parsed?.date) {
      out.push({
        id: 'parsed',
        pinned: true,
        label: <span className="font-medium text-ink">{whenLabel(parsed.date, parsed.time ?? time, prefs.timeFormat)}</span>,
        text: q,
        icon: <CalendarCheck className="size-4 text-accent" />,
        hint: parsed.date !== today ? mediumDate(parsed.date) : undefined,
        onSelect: () => apply(parsed.date!, parsed.time ?? time),
      });
    }
    const tomorrow = addDaysKey(today, 1);
    const weekend = weekendKey(today);
    const nextWeek = nextWeekKey(today, prefs.weekStartsOn);
    out.push(
      { id: 'today', label: 'Today', text: 'today now', icon: <Sun className="size-4" />, hint: weekdayShort(today), selected: current === today, onSelect: () => apply(today) },
      { id: 'tomorrow', label: 'Tomorrow', text: 'tomorrow', icon: <Sunrise className="size-4" />, hint: weekdayShort(tomorrow), selected: current === tomorrow, onSelect: () => apply(tomorrow) },
    );
    if (!isWeekend(today) && weekend !== tomorrow) {
      out.push({ id: 'weekend', label: 'This weekend', text: 'this weekend saturday', icon: <Sofa className="size-4" />, hint: weekdayShort(weekend), selected: current === weekend, onSelect: () => apply(weekend) });
    }
    out.push(
      { id: 'nextweek', label: 'Next week', text: 'next week monday', icon: <CalendarArrowUp className="size-4" />, hint: mediumDate(nextWeek), selected: current === nextWeek, onSelect: () => apply(nextWeek) },
      {
        id: 'later',
        label: 'Later',
        text: 'later someday no date defer',
        icon: <Moon className="size-4" />,
        hint: 'No date',
        selected: taskIds.length === 1 && !!first?.deferred && !first.dueDate,
        onSelect: () => {
          deferLater(taskIds);
          onDone();
        },
      },
    );
    if (current) {
      out.push({ id: 'clear', label: 'Remove date', text: 'remove clear no date none', icon: <CalendarX className="size-4" />, onSelect: () => apply(null) });
    }
    return out;
  };

  const commitTime = (value: string) => {
    const parsed = parseTimeInput(value);
    if (parsed === undefined) {
      setTimeError(true);
      return false;
    }
    setTimeError(false);
    setTime(parsed);
    setTimeText(parsed ? formatTime(parsed, prefs.timeFormat) : '');
    return parsed;
  };

  const big = size === 'palette';
  // Palette: calendar below the list. Popover: calendar beside it, which keeps
  // the popover short enough to open below the task instead of covering it.
  const calendar = (
    <div
      className={cn(
        big
          ? 'grid gap-4 border-t border-line p-4 sm:grid-cols-[1fr_auto] sm:gap-6'
          : 'w-[252px] border-l border-line p-3 max-sm:w-full max-sm:border-t max-sm:border-l-0',
      )}
    >
      <MiniCalendar value={current} onSelect={(d) => apply(d)} weekStartsOn={prefs.weekStartsOn} busy={busy} className={big ? '' : 'mb-2.5'} />
      <div className={cn(big && 'self-start sm:w-[200px]')}>
        <label className={cn('flex h-9 items-center gap-2 rounded-[8px] px-2.5 transition-shadow', timeError ? 'shadow-[inset_0_0_0_1px_var(--color-ember)]' : 'bg-wash focus-within:bg-transparent focus-within:shadow-[inset_0_0_0_1px_var(--color-line-strong)]')}>
          <Clock className="size-4 shrink-0 text-ink-3" />
          <input
            value={timeText}
            onChange={(e) => {
              setTimeText(e.target.value);
              setTimeError(false);
            }}
            onBlur={(e) => commitTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const t = commitTime(timeText);
                if (t !== false) apply(current ?? today, t);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                (onBack ?? onDone)();
              }
            }}
            placeholder="Add time — 14:00, 3pm"
            className="min-w-0 flex-1 bg-transparent text-ui outline-none"
            aria-label="Time"
          />
          {time && (
            <button
              aria-label="Remove time"
              onClick={() => {
                setTime(null);
                setTimeText('');
                if (current) schedule(taskIds, current, null);
              }}
              className="grid size-5 place-items-center rounded-[4px] text-ink-3 hover:bg-wash-strong"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {big && <p className="mt-2 px-1 text-meta text-ink-3 max-sm:hidden">Or type anything — “fri 3pm”, “sep 30”, “in 2 weeks”.</p>}
      </div>
    </div>
  );

  const list = (
    <ListPicker
      items={items}
      placeholder={big ? 'Schedule — type a date, e.g. “fri 3pm”' : 'Type a date — fri, sep 30…'}
      onClose={onDone}
      onBack={onBack}
      size={size}
      footer={big ? calendar : undefined}
      widthClass="w-[268px] max-sm:w-full"
      leading={<CalendarCheck className={cn('shrink-0 text-ink-4', big ? 'size-[18px]' : 'size-4')} />}
    />
  );
  if (big) return list;
  return (
    <div className="flex max-w-[calc(100vw-24px)] max-sm:w-[320px] max-sm:flex-col">
      {list}
      {calendar}
    </div>
  );
}
