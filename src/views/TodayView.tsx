import { ChevronDown, Crosshair, Keyboard, Sun } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { addDaysKey, greeting, longDate, toKey } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { byDateThenPosition, byPosition, useLiveTasks } from '@/store/selectors';
import { toast } from '@/store/toast';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { useMinute, useToday } from '@/hooks/useToday';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { CompletedSection, TaskList } from '@/components/tasks/TaskList';
import { VoiceButton } from '@/components/voice/VoiceButton';
import { Kbd } from '@/components/ui/Kbd';
import { useRegisterVisible } from './ViewHeader';

const SHOWN = 3;

/**
 * Home: one thing to do (speak), and the next three things to act on.
 * Everything else — the rest of today, what's coming, what's done — waits
 * behind "More".
 */
export function TodayView() {
  const tasks = useLiveTasks();
  const today = useToday();
  const name = useWorkspace((s) => s.user.name);
  const [expanded, setExpanded] = useState(false);
  const [typing, setTyping] = useState(false);
  useMinute();

  // "N" (or the palette's New task) reveals the writing field on this screen.
  const focusTick = useUi((s) => s.composerFocusTick);
  const tickAtMount = useRef(focusTick);
  useEffect(() => {
    if (focusTick !== tickAtMount.current) setTyping(true);
  }, [focusTick]);

  const { open, overdue, soon, completed } = useMemo(() => {
    const live = tasks.filter((t) => t.status !== 'done');
    const open = live.filter((t) => t.dueDate && t.dueDate <= today).sort(byPosition);
    const horizon = addDaysKey(today, 7);
    const soon = live
      .filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= horizon)
      .sort(byDateThenPosition);
    const completedToday = tasks.filter((t) => t.status === 'done' && t.completedAt && toKey(new Date(t.completedAt)) === today);
    return { open, overdue: open.filter((t) => t.dueDate! < today), soon, completed: completedToday };
  }, [tasks, today]);

  // Fill the three rows from today first, then from what's coming next.
  const filler = open.length < SHOWN ? soon.slice(0, SHOWN - open.length) : [];
  const head: Task[] = [...open.slice(0, SHOWN), ...filler];
  const restToday = open.slice(SHOWN);
  const restSoon = soon.filter((t) => !filler.includes(t)).slice(0, 6);
  const rest = [...restToday, ...restSoon];
  const shown = expanded ? [...head, ...rest] : head;

  useRegisterVisible(useMemo(() => shown.map((t) => t.id), [shown]));

  const moreLabel = restToday.length
    ? `${restToday.length} more today`
    : restSoon.length
      ? `${restSoon.length} coming up`
      : '';

  const moveOverdue = () => {
    const ids = overdue.map((t) => t.id);
    const undo = ws().transact(() => ws().setDue(ids, today));
    toast(`${ids.length === 1 ? 'Task' : `${ids.length} tasks`} moved to today`, { action: { label: 'Undo', run: undo } });
  };

  return (
    <div className={cn('flex flex-col', !expanded && 'justify-center min-h-[calc(100dvh-190px)] md:min-h-[calc(100dvh-124px)]')}>
      <header className="text-center">
        <p className="label-caps !text-ink-4">{longDate(today)}</p>
        <h1 className="mt-1.5 font-serif text-[32px] leading-10 tracking-[-0.01em] text-ink max-md:text-[28px] max-md:leading-9">
          {greeting()}
          {name ? `, ${name.split(' ')[0]}` : ''}.
        </h1>
      </header>

      <div className="mt-8 flex flex-col items-center">
        <VoiceButton variant="hero" />
        <p className="mt-3.5 text-ui text-ink-3">Speak a task</p>
        {!typing && (
          <button
            onClick={() => setTyping(true)}
            className="mt-1 inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-meta text-ink-4 transition-colors hover:bg-wash-strong hover:text-ink-2"
          >
            <Keyboard className="size-3.5" /> or type
            <Kbd combo="n" subtle />
          </button>
        )}
      </div>

      {typing && (
        <div className="mx-auto mt-5 w-full max-w-[560px] animate-rise">
          <TaskComposer
            autoFocus
            defaults={{ fields: { dueDate: today }, chip: { id: 'ctx-today', icon: <Sun className="size-3.5" />, label: 'Today' } }}
            isVisibleHere={(t) => !!t.dueDate && t.dueDate <= today}
            onCreated={() => setExpanded(true)}
          />
        </div>
      )}

      <div className="mt-10 max-md:mt-8">
        {shown.length > 0 ? (
          <TaskList listId="today" tasks={shown} ctx={{ impliedDate: today, quiet: true }} />
        ) : (
          <p className="text-center text-ui text-ink-3">
            {completed.length ? 'Everything planned for today is done.' : 'Nothing planned. Say what needs doing.'}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {(rest.length > 0 || expanded) && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-ui font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink"
          >
            {expanded ? 'Show less' : 'More'}
            {!expanded && moreLabel && <span className="text-ink-4">· {moreLabel}</span>}
            <ChevronDown className={cn('size-4 transition-transform duration-200', expanded && 'rotate-180')} />
          </button>
        )}
        {expanded && open.length > 0 && (
          <button
            onClick={() => ui().startFocus((open.find((t) => t.priority === 'important') ?? open[0]).id)}
            className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-ui font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink"
          >
            <Crosshair className="size-4" /> Focus
          </button>
        )}
      </div>

      {expanded && (
        <div className="animate-fade">
          {overdue.length > 0 && (
            <p className="mt-2 text-center text-meta text-ink-3">
              {overdue.length === 1 ? 'One task was' : `${overdue.length} tasks were`} due earlier.{' '}
              <button onClick={moveOverdue} className="font-medium text-ink-2 underline decoration-line-strong underline-offset-[3px] hover:decoration-ink-3">
                Move to today
              </button>
              {restSoon.length > 0 && (
                <>
                  {' · '}
                  <button onClick={() => ui().navigate({ name: 'upcoming' })} className="font-medium text-ink-2 underline decoration-line-strong underline-offset-[3px] hover:decoration-ink-3">
                    See the week
                  </button>
                </>
              )}
            </p>
          )}
          <div className="mx-auto max-w-[680px]">
            <CompletedSection listId="today-done" tasks={completed} label="Done today" ctx={{ impliedDate: today }} />
          </div>
        </div>
      )}
    </div>
  );
}
