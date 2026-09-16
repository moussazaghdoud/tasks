import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { DateKey } from '@/domain/types';
import { markFresh } from '@/lib/fresh';
import { cn } from '@/lib/platform';
import { useUpcomingGroups, type DayGroup } from '@/store/selectors';
import { useUi } from '@/store/ui';
import { ws } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { TaskList } from '@/components/tasks/TaskList';
import { fieldsFromParse, useParsedInput } from '@/components/tasks/parsedInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRegisterVisible, ViewHeader } from './ViewHeader';

function QuickAdd({ date, onDone }: { date: DateKey; onDone: () => void }) {
  const [value, setValue] = useState('');
  const { result, reset } = useParsedInput(value);
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => {
    if (!result.title.trim()) return onDone();
    const [t] = ws().addTasks([{ dueDate: date, ...fieldsFromParse(result), title: result.title, placement: 'bottom' }]);
    markFresh([t.id]);
    setValue('');
    reset();
  };
  return (
    <div className="flex h-10 animate-fade items-center gap-2 pl-[9px]">
      <span className="grid size-[26px] place-items-center">
        <span className="size-[18px] rounded-full border-[1.5px] border-dashed border-ink-4" />
      </span>
      <input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => !value && onDone()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="Add a task for this day"
        className="h-8 flex-1 bg-transparent text-task outline-none"
      />
    </div>
  );
}

function Group({ group }: { group: DayGroup }) {
  const [adding, setAdding] = useState(false);
  const dragging = useUi((s) => s.dragging);
  const empty = group.tasks.length === 0;
  const weekend = group.date ? [0, 6].includes(new Date(group.date + 'T00:00').getDay()) : false;

  return (
    <section className={cn('group/day', empty && !dragging && !adding ? 'mt-1' : 'mt-6')}>
      <div className="flex h-8 items-center gap-2.5 pl-1">
        <h2 className={cn('text-[14px] font-semibold tracking-[-0.005em]', empty ? 'text-ink-4' : 'text-ink')}>{group.title}</h2>
        {group.subtitle && <span className={cn('text-meta', empty ? 'text-ink-4' : 'text-ink-3')}>{group.subtitle}</span>}
        {empty && !dragging && <span className="text-meta text-ink-4">{weekend ? '· weekend' : ''}</span>}
        <span className="h-px flex-1 bg-line" />
        {group.date && (
          <button
            onClick={() => setAdding(true)}
            aria-label={`Add a task on ${group.title}`}
            className="grid size-7 place-items-center rounded-[7px] text-ink-4 opacity-0 transition hover:bg-wash-strong hover:text-ink group-hover/day:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      {(!empty || dragging) && (
        <TaskList
          listId={`day:${group.key}`}
          tasks={group.tasks}
          date={group.date}
          ctx={{ impliedDate: group.date }}
          empty={dragging ? <div className="flex h-10 items-center rounded-row border border-dashed border-line-strong pl-4 text-meta text-ink-3">Drop to schedule</div> : null}
        />
      )}
      {adding && group.date && <QuickAdd date={group.date} onDone={() => setAdding(false)} />}
    </section>
  );
}

export function UpcomingView() {
  const groups = useUpcomingGroups();
  const today = useToday();
  useRegisterVisible(useMemo(() => groups.flatMap((g) => g.tasks.map((t) => t.id)), [groups]));
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <div>
      <ViewHeader title="Upcoming" subtitle="The week ahead, day by day. Drag a task onto another day to move it." />
      <TaskComposer isVisibleHere={(t) => !!t.dueDate && t.dueDate > today} placeholder="Plan something — “Board prep thursday 10am”" />
      <div className="mt-4">
        {groups.map((g) => (
          <Group key={g.key} group={g} />
        ))}
      </div>
      {total === 0 && (
        <EmptyState title="Nothing scheduled ahead." className="!pt-8">
          Add a date to anything — type “tomorrow”, “friday 3pm” or “in two weeks” when you write it.
        </EmptyState>
      )}
    </div>
  );
}
