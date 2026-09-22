import { ArrowLeftRight, Bell, BellOff, CalendarPlus, Check, Flag, Mail, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { toggleComplete } from '@/actions/taskActions';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
import type { Space } from '@/domain/types';
import { Sheet, SheetAction, SheetDivider } from './Sheet';
import { dayTimeIn, relativeIn, t, timeIn } from './i18n';
import { spaceOf } from './space';
import { addToCalendar, openEmail, reminderChoices, setReminder, shareThought } from './thoughtActions';

/**
 * Everything you can do with a thought, and nothing you can do to it before
 * you ask. This is the third stage — ACT — and it is the only place where the
 * app admits to being more than a list.
 */
export function ThoughtSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const task = useWorkspace((s) => (taskId ? s.tasks[taskId] : undefined));
  const [remindOpen, setRemindOpen] = useState(false);

  useEffect(() => {
    if (!taskId) setRemindOpen(false);
  }, [taskId]);

  if (!task) return null;
  const done = task.status === 'done';
  const important = task.priority === 'important';

  const act = (fn: () => void | Promise<void>) => () => {
    onClose();
    // Let the sheet finish leaving before anything else takes the screen.
    setTimeout(() => void fn(), 180);
  };

  return (
    <>
      <Sheet open={!!taskId && !remindOpen} onClose={onClose} label={task.title}>
        <ThoughtTitle key={task.id} id={task.id} title={task.title} />
        <p className="px-6 pt-1 pb-4 text-[13px] text-ink-4">{t('captured_at', { when: relativeIn(task.createdAt) })}</p>

        <SheetDivider />

        {done ? (
          <SheetAction icon={RotateCcw} label={t('act_reopen')} onClick={act(() => toggleComplete(task.id))} />
        ) : (
          <SheetAction icon={Check} label={t('act_done')} tone="accent" onClick={act(() => toggleComplete(task.id))} />
        )}

        <SheetAction
          icon={Flag}
          label={important ? t('act_not_important') : t('act_important')}
          tone={important ? undefined : 'danger'}
          onClick={act(() => {
            ws().toggleImportant([task.id]);
            haptic('medium');
            toast(important ? t('unmarked_important') : t('marked_important'));
          })}
        />
        <SheetAction
          icon={task.reminderAt ? BellOff : Bell}
          label={task.reminderAt ? t('act_change_remind') : t('act_remind')}
          detail={task.reminderAt ? dayTimeIn(new Date(task.reminderAt)) : undefined}
          onClick={() => setRemindOpen(true)}
        />
        <SheetAction
          icon={ArrowLeftRight}
          label={spaceOf(task) === 'business' ? t('act_move_private') : t('act_move_business')}
          onClick={act(() => {
            const to: Space = spaceOf(task) === 'business' ? 'private' : 'business';
            const undo = ws().transact(() => ws().updateTask(task.id, { space: to }));
            haptic('medium');
            toast(t('moved_to', { space: t(to) }), { action: { label: t('undo'), run: undo } });
          })}
        />
        <SheetAction icon={Mail} label={t('act_email')} onClick={act(() => openEmail(task))} />
        <SheetAction icon={CalendarPlus} label={t('act_calendar')} onClick={act(() => addToCalendar(task))} />
        <SheetAction icon={Share2} label={t('act_share')} onClick={act(() => shareThought(task))} />

        <SheetDivider />
        <SheetAction
          icon={Trash2}
          label={t('act_delete')}
          tone="danger"
          onClick={act(() => {
            const undo = ws().transact(() => ws().remove([task.id]));
            haptic('light');
            toast(t('deleted'), { action: { label: t('undo'), run: undo } });
          })}
        />
      </Sheet>

      <RemindSheet
        open={remindOpen}
        task={task}
        onClose={() => {
          setRemindOpen(false);
          onClose();
        }}
      />
    </>
  );
}

/** The thought itself, editable in place — no separate edit screen. */
function ThoughtTitle({ id, title }: { id: string; title: string }) {
  const [value, setValue] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setValue(title), [title]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      aria-label={t('a11y_thought')}
      rows={1}
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => (value.trim() ? ws().renameTask(id, value.trim()) : setValue(title))}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full resize-none bg-transparent px-6 pt-1 text-[21px] leading-[29px] font-medium tracking-[-0.015em] text-ink outline-none"
    />
  );
}

/**
 * Reminders, offered as the four answers people actually give. A date picker
 * is a scheduler's interface; this is a promise not to let you forget.
 */
function RemindSheet({ open, task, onClose }: { open: boolean; task: { id: string; reminderAt: string | null }; onClose: () => void }) {
  const choices = reminderChoices();

  const choose = async (at: Date) => {
    onClose();
    const allowed = await ensureNotificationPermission();
    setReminder(task.id, at);
    haptic('success');
    toast(
      allowed
        ? t('reminder_set', { when: dayTimeIn(at) })
        : t('reminder_set_no_perm'),
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label={t('remind_title')}>
      <p className="px-6 pb-2 text-[13px] font-medium tracking-[0.06em] text-ink-4 uppercase">{t('remind_title')}</p>
      {choices.map((c) => (
        <SheetAction
          key={c.key}
          icon={Bell}
          label={t(c.key)}
          detail={timeIn(c.at)}
          onClick={() => void choose(c.at)}
        />
      ))}
      {task.reminderAt && (
        <>
          <SheetDivider />
          <SheetAction
            icon={BellOff}
            label={t('remind_remove')}
            tone="danger"
            onClick={() => {
              onClose();
              setReminder(task.id, null);
              toast(t('reminder_removed'));
            }}
          />
        </>
      )}
    </Sheet>
  );
}
