import { Bell, Check, Ellipsis } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import type { Task } from '@/domain/types';
import { relativeTime } from '@/lib/dates';
import { isFresh } from '@/lib/fresh';
import { cn } from '@/lib/platform';
import { registerCompletionAnimator, toggleComplete } from '@/actions/taskActions';
import { useSwipe } from '@/hooks/useSwipe';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A short, human reminder time: "18:00", "Tomorrow 09:00". */
function reminderLabel(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 0) return `${relativeTime(iso)}`;
  return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`;
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
      <div className="relative">
        {/* What the swipe is about to do, revealed underneath the row. */}
        {swipe.dx !== 0 && (
          <div
            className={cn(
              'absolute inset-0 flex items-center rounded-[14px] px-6 text-white',
              swipe.dx > 0 ? 'justify-start' : 'justify-end',
              swipe.dx > 0 ? (swipe.armed ? 'bg-accent' : 'bg-accent/45') : swipe.armed ? 'bg-ink-2' : 'bg-ink-3/50',
            )}
          >
            {swipe.dx > 0 ? <Check className="size-[22px]" /> : <Ellipsis className="size-[22px]" />}
          </div>
        )}

        <div
          onTouchStart={swipe.handlers.onTouchStart}
          onTouchMove={swipe.handlers.onTouchMove}
          onTouchEnd={swipe.handlers.onTouchEnd}
          onTouchCancel={swipe.handlers.onTouchCancel}
          style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined, touchAction: 'pan-y' }}
          className={cn('flex items-start gap-3.5 rounded-[14px] py-3.5', swipe.dx !== 0 && 'bg-paper', enter && 'animate-enter')}
        >
          <button
            onClick={() => toggleComplete(task.id)}
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? `Reopen ${task.title}` : `Complete ${task.title}`}
            className="-my-1.5 -ml-1 grid h-11 w-10 shrink-0 place-items-center rounded-full"
          >
            <span
              className={cn(
                'grid size-[23px] place-items-center rounded-full border-[1.5px] transition-colors duration-200',
                checked ? 'border-accent bg-accent' : 'border-ink-4',
              )}
            >
              <Check
                className={cn('size-[13px] text-white transition-opacity duration-150', checked ? 'opacity-100' : 'opacity-0')}
                strokeWidth={3}
              />
            </span>
          </button>

          <button onClick={onOpen} className="min-w-0 flex-1 text-left">
            <span
              className={cn(
                'block text-[17px] leading-[25px] tracking-[-0.011em] transition-colors duration-200',
                checked ? 'text-ink-4 line-through' : 'text-ink',
              )}
            >
              {task.title}
            </span>
            {task.reminderAt && !done && (
              <span className={cn('mt-1 flex items-center gap-1.5 text-[13px]', overdue ? 'text-ember' : 'text-ink-3')}>
                <Bell className="size-3.5" strokeWidth={1.9} />
                {reminderLabel(task.reminderAt)}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
