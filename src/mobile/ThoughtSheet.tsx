import { Bell, BellOff, CalendarPlus, Check, Flag, Mail, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { relativeTime } from '@/lib/dates';
import { haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { toggleComplete } from '@/actions/taskActions';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
import { Sheet, SheetAction, SheetDivider } from './Sheet';
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
        <p className="px-6 pt-1 pb-4 text-[13px] text-ink-4">Captured {relativeTime(task.createdAt)}</p>

        <SheetDivider />

        {done ? (
          <SheetAction icon={RotateCcw} label="Not done after all" onClick={act(() => toggleComplete(task.id))} />
        ) : (
          <SheetAction icon={Check} label="Done" tone="accent" onClick={act(() => toggleComplete(task.id))} />
        )}

        <SheetAction
          icon={Flag}
          label={important ? 'Not important' : 'Important'}
          tone={important ? undefined : 'danger'}
          onClick={act(() => {
            ws().toggleImportant([task.id]);
            haptic('medium');
            toast(important ? 'No longer important' : 'Marked important');
          })}
        />
        <SheetAction
          icon={task.reminderAt ? BellOff : Bell}
          label={task.reminderAt ? 'Change reminder' : 'Remind me'}
          detail={task.reminderAt ? new Date(task.reminderAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : undefined}
          onClick={() => setRemindOpen(true)}
        />
        <SheetAction icon={Mail} label="Turn into email" onClick={act(() => openEmail(task))} />
        <SheetAction icon={CalendarPlus} label="Add to calendar" onClick={act(() => addToCalendar(task))} />
        <SheetAction icon={Share2} label="Share" onClick={act(() => shareThought(task))} />

        <SheetDivider />
        <SheetAction
          icon={Trash2}
          label="Delete"
          tone="danger"
          onClick={act(() => {
            const undo = ws().transact(() => ws().remove([task.id]));
            haptic('light');
            toast('Deleted', { action: { label: 'Undo', run: undo } });
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
      aria-label="Thought"
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
        ? `Reminder ${at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
        : 'Reminder set — allow notifications to be told',
    );
  };

  return (
    <Sheet open={open} onClose={onClose} label="Remind me">
      <p className="px-6 pb-2 text-[13px] font-medium tracking-[0.06em] text-ink-4 uppercase">Remind me</p>
      {choices.map((c) => (
        <SheetAction
          key={c.label}
          icon={Bell}
          label={c.label}
          detail={c.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          onClick={() => void choose(c.at)}
        />
      ))}
      {task.reminderAt && (
        <>
          <SheetDivider />
          <SheetAction
            icon={BellOff}
            label="Remove reminder"
            tone="danger"
            onClick={() => {
              onClose();
              setReminder(task.id, null);
              toast('Reminder removed');
            }}
          />
        </>
      )}
    </Sheet>
  );
}
