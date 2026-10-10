import { Bell, Check, CheckCheck, Repeat, Send, Trash2, UserCheck } from 'lucide-react';
import { usePro } from '@/lib/pro/store';
import { personOf } from '@/lib/share/people';
import { st } from './shareI18n';
import { memo, useEffect, useState } from 'react';
import type { Task } from '@/domain/types';
import { isFresh } from '@/lib/fresh';
import { photoUrl } from '@/lib/native/photos';
import { isNative } from '@/lib/native/platform';
import { cn } from '@/lib/platform';
import { registerCompletionAnimator, toggleComplete } from '@/actions/taskActions';
import { haptic } from '@/lib/native/bridge';
import { toast } from '@/store/toast';
import { ws } from '@/store/workspace';
import { ACTION_WIDTH, useSwipe } from '@/hooks/useSwipe';
import { isRtl, relativeIn, repeatLabel, t, timeIn } from './i18n';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A thought's photograph, once the file system says where it is.
 *
 * Resolving the path is asynchronous, so the row renders without it and the
 * picture arrives a frame later — better than holding the whole list back for
 * a file that is already on the device.
 */
function PhotoThumb({ name, reading }: { name?: string; reading: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    void photoUrl(name).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [name]);
  if (!name || !src) return null;
  return (
    <span className="relative mb-2.5 block overflow-hidden rounded-[11px] border border-line">
      <img src={src} alt={t('photo_attached')} loading="lazy" className="block h-[104px] w-full object-cover" />
      {/* Its words are still being read: the same scan as while capturing. */}
      {reading && (
        <span
          aria-hidden
          className="absolute inset-x-0 h-[2px] -translate-y-1/2 animate-scan bg-accent shadow-[0_0_10px_3px_var(--color-accent)]"
        />
      )}
    </span>
  );
}

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
/**
 * A thought sent to others and kept here. To whom it went; then, on Pro,
 * what came back: who took it, and who finished it — the last word wins.
 */
function DelegatedLine({ delegated }: { delegated: NonNullable<Task['delegated']> }) {
  const pro = usePro();
  if (pro && delegated.doneBy) {
    return (
      <span className="flex items-center gap-1.5 text-accent">
        <CheckCheck className="size-3" strokeWidth={2.4} />
        {st('done_by', { name: delegated.doneBy.name || st('someone') })}
      </span>
    );
  }
  if (pro && delegated.takenBy) {
    return (
      <span className="flex items-center gap-1.5 text-tomorrow">
        <UserCheck className="size-3" strokeWidth={2.1} />
        {st('taken_by', { name: delegated.takenBy.name || st('someone') })}
      </span>
    );
  }
  const names = delegated.team
    ? st('team_label', { name: delegated.team })
    : delegated.to.map((p) => p.name || st('someone')).join(', ');
  return (
    <span className="flex items-center gap-1.5 text-ink-3">
      <Send className="size-3" strokeWidth={2.1} />
      {st('sent_label', { names })}
    </span>
  );
}

export const ThoughtRow = memo(function ThoughtRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const done = task.status === 'done';
  const important = task.priority === 'important';
  const [completing, setCompleting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // Dropped once the entry has played: the animation holds its last frame,
  // and that frame's `transform` would pin the row against every swipe.
  const [enter, setEnter] = useState(() => isFresh(task.id));
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

  // Mirrored in Arabic: complete toward the end of the line, delete from it.
  const rtl = isRtl();
  const swipe = useSwipe({ enabled: !done, flip: rtl, onRight: () => toggleComplete(task.id) });

  const remove = () => {
    swipe.close();
    const undo = ws().transact(() => ws().remove([task.id]));
    haptic('medium');
    toast(t('deleted'), { action: { label: t('undo'), run: undo } });
  };

  const checked = done || completing;

  return (
    <div className="collapse-row" data-collapsed={collapsed}>
      <div className="relative mb-2">
        {/* Completing is a throw: what it will do, shown while you pull. */}
        {swipe.dx > 0 && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-start rounded-[15px] px-6 text-on-accent',
              swipe.armed ? 'bg-accent' : 'bg-accent/40',
            )}
          >
            <Check className="size-[22px]" strokeWidth={2.4} />
          </div>
        )}

        {/* Deleting is a button, behind the row, waiting to be pressed. */}
        {swipe.dx < 0 && (
          <div className="absolute inset-y-0 end-0 flex items-stretch overflow-hidden rounded-[15px]">
            <button
              onClick={remove}
              aria-label={t('act_delete')}
              style={{ width: ACTION_WIDTH }}
              className="flex flex-col items-center justify-center gap-1 bg-ember text-white active:brightness-90"
            >
              <Trash2 className="size-[21px]" strokeWidth={2.1} />
              <span className="text-[11px] font-semibold tracking-[0.04em]">{t('act_delete')}</span>
            </button>
          </div>
        )}

        <div
          onTouchStart={swipe.handlers.onTouchStart}
          onTouchMove={swipe.handlers.onTouchMove}
          onTouchEnd={swipe.handlers.onTouchEnd}
          onTouchCancel={swipe.handlers.onTouchCancel}
          onAnimationEnd={(e) => e.target === e.currentTarget && setEnter(false)}
          style={{
            transform: swipe.dx ? `translateX(${rtl ? -swipe.dx : swipe.dx}px)` : undefined,
            // Only the snap back or open is animated; a finger drag must not
            // lag behind the finger.
            transition: swipe.open || !swipe.dx ? 'transform 180ms var(--ease-out)' : undefined,
            touchAction: 'pan-y',
          }}
          // thought-card, thought-title, thought-check: what a look (looks.css) re-dresses.
          data-important={important && !checked}
          data-shared={!!task.sharedBy}
          className={cn(
            'thought-card relative flex items-start gap-3.5 rounded-[15px] border px-4 py-3.5 transition-colors duration-200',
            // Important thoughts carry the red themselves rather than wearing a
            // badge: the card, its edge and the words all shift together, so it
            // reads from across the room without adding anything to the row.
            // One someone sent is indigo the same way: it is theirs, handed over.
            important && !checked
              ? 'border-ember/45 bg-ember-soft'
              : task.sharedBy && !checked
                ? 'border-tomorrow/40 bg-tomorrow-soft'
                : 'border-line bg-sunk',
            checked && 'opacity-55',
            enter && 'animate-enter',
          )}
        >
          <button
            onClick={() => toggleComplete(task.id)}
            role="checkbox"
            aria-checked={checked}
            aria-label={checked ? t('a11y_reopen', { title: task.title }) : t('a11y_complete', { title: task.title })}
            className="-my-2 -ms-1.5 grid h-11 w-9 shrink-0 place-items-center rounded-full"
          >
            <span
              className={cn(
                'thought-check grid size-[19px] place-items-center rounded-full border-[1.5px] transition-colors duration-200',
                checked ? 'border-accent bg-accent' : important ? 'border-ember/70' : 'border-line-strong',
              )}
            >
              <Check
                className={cn('size-[11px] text-on-accent transition-opacity duration-150', checked ? 'opacity-100' : 'opacity-0')}
                strokeWidth={3.2}
              />
            </span>
          </button>

          {/* With Delete showing, a tap puts the row back rather than opening
              the menu: the first tap after a swipe is almost always a
              change of mind. */}
          <button onClick={() => (swipe.open ? swipe.close() : onOpen())} className="min-w-0 flex-1 text-start">
            {/* The photograph, small: enough to recognise which whiteboard,
                not so much that the list becomes a gallery. */}
            <PhotoThumb name={task.photo} reading={isNative() && task.photoText === undefined} />
            <span
              className={cn(
                // pre-line: a dictated "new line" shows as one.
                'thought-title block text-[15px] leading-[21px] tracking-[-0.01em] whitespace-pre-line transition-colors duration-200',
                checked ? 'text-ink-3 line-through' : important ? 'font-medium text-ember' : 'text-ink',
              )}
            >
              {task.title}
            </span>
            {!done && (task.reminderAt || task.recurrence || task.sharedBy || task.delegated) && (
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.045em] uppercase">
                {task.sharedBy && (
                  <span className="flex items-center gap-1.5 text-tomorrow">
                    <Send className="size-3" strokeWidth={2.1} />
                    {st('from_person', { name: personOf(task.sharedBy.id)?.name || task.sharedBy.name || st('someone') })}
                  </span>
                )}
                {/* Sent to a team, and someone else took it: no need to do it twice. */}
                {task.sharedBy?.takenBy && (
                  <span className="flex items-center gap-1.5 text-ember">
                    <UserCheck className="size-3" strokeWidth={2.1} />
                    {st('taken_by', { name: task.sharedBy.takenBy.name || st('someone') })}
                  </span>
                )}
                {/* Delegated and kept here: to whom, then what came back (Pro). */}
                {task.delegated && <DelegatedLine delegated={task.delegated} />}
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
