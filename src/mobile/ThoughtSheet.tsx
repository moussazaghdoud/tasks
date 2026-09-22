import { ArrowLeftRight, Bell, BellOff, CalendarPlus, Check, Flag, Mail, Pencil, Repeat, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { toggleComplete } from '@/actions/taskActions';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
import type { Space } from '@/domain/types';
import { Sheet, SheetAction, SheetDivider } from './Sheet';
import { dayTimeIn, relativeIn, repeatLabel, t, timeIn } from './i18n';
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
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setRemindOpen(false);
      setEditOpen(false);
    }
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
      <Sheet open={!!taskId && !remindOpen && !editOpen} onClose={onClose} label={task.title}>
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
        <SheetAction icon={Pencil} label={t('act_edit')} onClick={() => setEditOpen(true)} />
        <SheetAction
          icon={task.reminderAt ? BellOff : Bell}
          label={task.reminderAt ? t('act_change_remind') : t('act_remind')}
          detail={task.reminderAt ? dayTimeIn(new Date(task.reminderAt)) : undefined}
          onClick={() => setRemindOpen(true)}
        />
        {task.recurrence && (
          <SheetAction
            icon={Repeat}
            label={t('act_stop_repeat')}
            detail={repeatLabel(task.recurrence.freq)}
            onClick={act(() => {
              const undo = ws().transact(() => ws().setRecurrence([task.id], null));
              haptic('light');
              toast(t('stopped_repeat'), { action: { label: t('undo'), run: undo } });
            })}
          />
        )}
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

      <EditSheet
        open={editOpen}
        task={task}
        onClose={() => {
          setEditOpen(false);
          onClose();
        }}
      />

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
 * Change the words.
 *
 * Dictation gets a name wrong, or the thought turns out to be about something
 * slightly different. The thought's own line has always been editable where it
 * sits, but nothing said so; this is the same edit with a door on it — Cancel
 * and Save where iOS puts them, and the keyboard already open.
 */
function EditSheet({
  open,
  task,
  onClose,
}: {
  open: boolean;
  task: { id: string; title: string; notes: string };
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const field = useRef<HTMLTextAreaElement>(null);

  // Start from what the thought says now, every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setNotes(task.notes);
    // The caret goes to the end: people come here to correct the tail of a
    // sentence far more often than the head of it.
    const id = setTimeout(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 120);
    return () => clearTimeout(id);
  }, [open, task.title, task.notes]);

  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  const clean = title.trim();
  const changed = clean !== task.title.trim() || notes.trim() !== task.notes.trim();

  const save = () => {
    if (!clean) return;
    const undo = ws().transact(() => {
      ws().renameTask(task.id, clean);
      ws().updateTask(task.id, { notes: notes.trim() });
    });
    haptic('success');
    onClose();
    toast(t('edit_saved'), { action: { label: t('undo'), run: undo } });
  };

  return (
    <Sheet open={open} onClose={onClose} label={t('act_edit')}>
      <div className="flex items-center gap-3 px-6 pt-1 pb-3">
        <button onClick={onClose} className="-ml-2 h-11 shrink-0 px-2 text-[17px] text-ink-3 active:opacity-60">
          {t('cancel')}
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-ink">{t('act_edit')}</h2>
        <button
          onClick={save}
          disabled={!clean || !changed}
          className="-mr-2 h-11 shrink-0 px-2 text-[17px] font-semibold text-accent transition-opacity active:opacity-60 disabled:opacity-30"
        >
          {t('save')}
        </button>
      </div>

      <div className="px-5 pb-4">
        <textarea
          ref={(el) => {
            field.current = el;
            grow(el);
          }}
          value={title}
          rows={1}
          aria-label={t('a11y_thought')}
          onChange={(e) => {
            setTitle(e.target.value.replace(/\n/g, ' '));
            grow(e.currentTarget);
          }}
          className="w-full resize-none rounded-[16px] border border-line bg-sunk px-4 py-3 text-[17px] leading-[24px] text-ink outline-none focus:border-accent/50"
        />
        <textarea
          value={notes}
          rows={2}
          placeholder={t('edit_note_placeholder')}
          aria-label={t('edit_note_placeholder')}
          onChange={(e) => {
            setNotes(e.target.value);
            grow(e.currentTarget);
          }}
          ref={grow}
          className="mt-2.5 w-full resize-none rounded-[16px] border border-line bg-sunk px-4 py-3 text-[15px] leading-[22px] text-ink-2 outline-none placeholder:text-ink-4 focus:border-accent/50"
        />
      </div>
    </Sheet>
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
