import { Bell, Check, Ellipsis, Repeat } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import type { Task } from '@/domain/types';
import { isFresh } from '@/lib/fresh';
import { cn } from '@/lib/platform';
import { registerCompletionAnimator, toggleComplete } from '@/actions/taskActions';
import { useSwipe } from '@/hooks/useSwipe';
import { relativeIn, repeatLabel, t, timeIn } from './i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A short, human reminder time: "18:00", "Tomorrow 09:00". */
function reminderLabel(iso: string): string {
  const at = new Date(iso);
  const time = timeIn(at);
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return t('tomorrow_at', { time });
  if (days < 0) return relativeIn(iso);
  return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/**
 * One captured thought.
 *
 * The sentence is the whole row. No priority flag, no project chip, no date
 * badge, no hover actions — a thought is not a record to administer. The only
 * thing allowed to appear beneath it is a reminder, because that is a promise
 * the app made to interrupt you later, and you should be able to see it.
 */
export const ThoughtRow = memo(function ThoughtRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const done = task.status === 'done';
  const important = task.priority === 'important';
  const [completing, setCompleting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [enter] = useState(() => isFresh(task.id));
  const overdue = !!task.reminderAt && !task.reminderFiredAt && new Date(task.reminderAt) < new Date();

  useEffect(() => {
    if (done) return;
    return registerCompletionAnimator(task.id, async () => {
      setCompleting(true);
      await wait(340);
      setCollapsed(true);
      await wait(180);
    });
  }, [task.id, done]);

  const swipe = useSwipe({
    enabled: !done,
    onRight: () => toggleComplete(task.id),
    onLeft: onOpen,
  });

  const checked = done || completing;

  return (
    <div className="collapse-row" data-collapsed={collapsed}>
      <div className="relative mb-2">
        {/* What the swipe is about to do, revealed underneath the row. */}
        {swipe.dx !== 0 && (
          <div
            className={cn(
              'absolute inset-0 flex items-center rounded-[15px] px-6',
              swipe.dx > 0 ? 'justify-start text-on-accent' : 'justify-end text-ink',
              swipe.dx > 0 ? (swipe.armed ? 'bg-accent' : 'bg-accent/40') : swipe.armed ? 'bg-line-strong' : 'bg-line',
            )}
          >
            {swipe.dx > 0 ? <Check className="size-[22px]" strokeWidth={2.4} /> : <Ellipsis className="size-[22px]" />}
          </div>
        )}

        <div
          onTouchStart={swipe.handlers.onTouchStart}
          onTouchMove={swipe.handlers.onTouchMove}
          onTouchEnd={swipe.handlers.onTouchEnd}
          onTouchCancel={swipe.handlers.onTouchCancel}
          style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined, touchAction: 'pan-y' }}
          className={cn(
            'flex items-start gap-3.5 rounded-[15px] border px-4 py-3.5 transition-colors duration-200',
            // Important thoughts carry the red themselves rather than wearing a
            // badge: the card, its edge and the words all shift together, so it
            // reads from across the room without adding anything to the row.
            important && !checked ? 'border-ember/45 bg-ember-soft' : 'border-line bg-sunk',
            checked && 'opacity-55',
            enter && 'animate-enter',
          )}
        >
          <button
            onClick={() => toggleComplete(task.id)}
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? t('a11y_reopen', { title: task.title }) : t('a11y_complete', { title: task.title })}
            className="-my-2 -ml-1.5 grid h-11 w-9 shrink-0 place-items-center rounded-full"
          >
            <span
              className={cn(
                'grid size-[19px] place-items-center rounded-full border-[1.5px] transition-colors duration-200',
                checked ? 'border-accent bg-accent' : important ? 'border-ember/70' : 'border-line-strong',
              )}
            >
              <Check
                className={cn('size-[11px] text-on-accent transition-opacity duration-150', checked ? 'opacity-100' : 'opacity-0')}
                strokeWidth={3.2}
              />
            </span>
          </button>

          <button onClick={onOpen} className="min-w-0 flex-1 text-left">
            <span
              className={cn(
                'block text-[15px] leading-[21px] tracking-[-0.01em] transition-colors duration-200',
                checked ? 'text-ink-3 line-through' : important ? 'font-medium text-ember' : 'text-ink',
              )}
            >
              {task.title}
            </span>
            {!done && (task.reminderAt || task.recurrence) && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.045em] uppercase">
                {task.reminderAt && (
                  <span className={cn('flex items-center gap-1.5', overdue ? 'text-ember' : 'text-accent')}>
                    <Bell className="size-3" strokeWidth={2.1} />
                    {reminderLabel(task.reminderAt)}
                  </span>
                )}
                {/* A repeating thought comes back when it is completed. Without
                    saying so, that looks like a task that refuses to go away. */}
                {task.recurrence && (
                  <span className="flex items-center gap-1.5 text-ink-3">
                    <Repeat className="size-3" strokeWidth={2.1} />
                    {repeatLabel(task.recurrence.freq)}
                  </span>
                )}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
