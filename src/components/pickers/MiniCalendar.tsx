import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DateKey } from '@/domain/types';
import { addDaysKey, fromKey, startOfWeekKey, todayKey } from '@/lib/dates';
import { cn } from '@/lib/platform';

interface MiniCalendarProps {
  value: DateKey | null;
  onSelect: (date: DateKey) => void;
  weekStartsOn?: 0 | 1;
  /** Dates that have tasks — shown as a faint dot. */
  busy?: ReadonlySet<DateKey>;
  className?: string;
}

export function MiniCalendar({ value, onSelect, weekStartsOn = 1, busy, className }: MiniCalendarProps) {
  const today = todayKey();
  const [month, setMonth] = useState(() => (value ?? today).slice(0, 7));

  const days = useMemo(() => {
    const first = `${month}-01`;
    const start = startOfWeekKey(first, weekStartsOn);
    return Array.from({ length: 42 }, (_, i) => addDaysKey(start, i));
  }, [month, weekStartsOn]);

  const shift = (n: number) => {
    const d = fromKey(`${month}-01`);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const weekdayNames = weekStartsOn === 1 ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const monthLabel = fromKey(`${month}-01`).toLocaleDateString('en-US', {
    month: 'long',
    ...(month.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });
  // Trim a trailing week that belongs entirely to the next month.
  const rows = days.slice(35).every((d) => d.slice(0, 7) !== month) ? days.slice(0, 35) : days;

  return (
    <div className={cn('select-none', className)}>
      <div className="mb-1.5 flex items-center justify-between pl-1">
        <span className="text-ui font-medium text-ink">{monthLabel}</span>
        <div className="flex">
          <button aria-label="Previous month" onClick={() => shift(-1)} className="grid size-7 place-items-center rounded-[6px] text-ink-3 hover:bg-wash-strong hover:text-ink">
            <ChevronLeft className="size-4" />
          </button>
          <button aria-label="Next month" onClick={() => shift(1)} className="grid size-7 place-items-center rounded-[6px] text-ink-3 hover:bg-wash-strong hover:text-ink">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center">
        {weekdayNames.map((w, i) => (
          <span key={i} className="pb-1 text-[10.5px] font-medium text-ink-4">
            {w}
          </span>
        ))}
        {rows.map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const isToday = d === today;
          const selected = d === value;
          const past = d < today;
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              aria-label={fromKey(d).toDateString()}
              aria-pressed={selected}
              className={cn(
                'relative mx-auto grid size-[30px] place-items-center rounded-full text-[12.5px] transition-colors font-num',
                selected
                  ? 'bg-accent font-semibold text-white'
                  : isToday
                    ? 'font-semibold text-accent hover:bg-accent-soft'
                    : inMonth
                      ? past
                        ? 'text-ink-4 hover:bg-wash-strong'
                        : 'text-ink-2 hover:bg-wash-strong'
                      : 'text-ink-4/70 hover:bg-wash-strong',
              )}
            >
              {Number(d.slice(8))}
              {busy?.has(d) && !selected && <span className="absolute bottom-[3px] size-[3px] rounded-full bg-ink-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
