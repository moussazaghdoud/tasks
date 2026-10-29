import {
  ArrowLeftRight,
  Bell,
  BellOff,
  CalendarClock,
  CalendarPlus,
  Check,
  Copy,
  Flag,
  Mail,
  Pencil,
  Repeat,
  RotateCcw,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { log, ref } from '@/lib/log';
import { copyText, haptic } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { headlineOf, photoUrl } from '@/lib/native/photos';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
import type { Space, Task } from '@/domain/types';
import { Composer } from './Composer';
import { SendSheet } from './SendSheet';
import { Sheet, SheetAction, SheetDivider } from './Sheet';
import { st } from './shareI18n';
import { dayTimeIn, relativeIn, repeatLabel, t, timeIn } from './i18n';
import { spaceOf } from './space';
import { addToCalendar, openEmail, reminderChoices, setReminder, shareThought, toggleDone } from './thoughtActions';

/**
 * Everything you can do with a thought, and nothing you can do to it before
 * you ask. This is the third stage — ACT — and it is the only place where the
 * app admits to being more than a list.
 */
export function ThoughtSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const task = useWorkspace((s) => (taskId ? s.tasks[taskId] : undefined));
  const [remindOpen, setRemindOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setRemindOpen(false);
      setEditOpen(false);
      setSendOpen(false);
    }
  }, [taskId]);

  if (!task) return null;
  const done = task.status === 'done';
  // Named after the words in its photograph: those words are the thought.
  const fromPhoto = isNamedByPhoto(task);
  const important = task.priority === 'important';

  const act = (fn: () => void | Promise<void>) => () => {
    onClose();
    // Let the sheet finish leaving before anything else takes the screen.
    setTimeout(() => void fn(), 180);
  };

  return (
    <>
      <Sheet open={!!taskId && !remindOpen && !editOpen && !sendOpen} onClose={onClose} label={task.title}>
        <ThoughtPhoto name={task.photo} text={task.photoText} onEdit={() => setEditOpen(true)} />
        {/* Tapping the words changes them — in the window they were typed in.
            A thought named by its photograph has its words above instead. */}
        {!fromPhoto && (
          <button
            onClick={() => setEditOpen(true)}
            aria-label={t('act_edit')}
            className="block w-full px-6 pt-1 text-start text-[21px] leading-[29px] font-medium tracking-[-0.015em] whitespace-pre-line text-ink"
          >
            {task.title}
          </button>
        )}
        <p className="px-6 pt-1 pb-4 text-[13px] text-ink-4">{t('captured_at', { when: relativeIn(task.createdAt) })}</p>

        <SheetDivider />

        {done ? (
          <SheetAction
            icon={RotateCcw}
            label={t('act_reopen')}
            onClick={act(() => {
              log('tap', `sheet reopen ${ref(task.id)}`);
              toggleDone(task.id);
            })}
          />
        ) : (
          <SheetAction
            icon={Check}
            label={t('act_done')}
            tone="accent"
            onClick={act(() => {
              log('tap', `sheet done ${ref(task.id)}`);
              toggleDone(task.id);
            })}
          />
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
        {/* To another Hence, through iCloud: the iPhone app only. */}
        {isNative() && <SheetAction icon={Send} label={st('act_send_to')} onClick={() => setSendOpen(true)} />}
        <SheetAction icon={Mail} label={t('act_email')} onClick={act(() => openEmail(task))} />
        <SheetAction icon={CalendarPlus} label={t('act_calendar')} onClick={act(() => addToCalendar(task))} />
        <SheetAction icon={Share2} label={t('act_share')} onClick={act(() => shareThought(task))} />

        <SheetDivider />
        <SheetAction
          icon={Trash2}
          label={t('act_delete')}
          tone="danger"
          onClick={act(() => {
            log('tap', `sheet delete ${ref(task.id)}`);
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

      <SendSheet
        open={sendOpen}
        task={task}
        onClose={() => {
          setSendOpen(false);
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

/**
 * A photograph taken without a word is named after the first words read in
 * it — until someone gives it a name of their own.
 */
function isNamedByPhoto(task: Task): boolean {
  return !!task.photoText?.trim() && task.title === headlineOf(task.photoText);
}

/**
 * The photograph the thought was captured with, at the top where it was, and
 * what the phone read in it: copied in one tap, so a number or an address is
 * never retyped, and corrected with the pencil where it misread.
 */
function ThoughtPhoto({ name, text, onEdit }: { name?: string; text?: string; onEdit: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    void photoUrl(name).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
  }, [name]);
  if (!name) return null;
  return (
    <div className="px-6 pb-3">
      {src && (
        <img
          src={src}
          alt={t('photo_attached')}
          className="max-h-[40dvh] w-full rounded-[18px] border border-line object-cover"
        />
      )}
      {text?.trim() && (
        <div className="mt-3 rounded-[14px] border border-line bg-sunk px-4 pt-2 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-4 uppercase">{t('photo_text')}</p>
            <div className="-me-2 flex items-center">
              <button
                onClick={async () => {
                  if (!(await copyText(text))) return;
                  haptic('light');
                  toast(t('copied'));
                }}
                aria-label={t('copy')}
                className="grid size-9 place-items-center rounded-full text-accent active:bg-wash-strong"
              >
                <Copy className="size-[18px]" strokeWidth={2} />
              </button>
              <button
                onClick={onEdit}
                aria-label={t('act_edit')}
                className="grid size-9 place-items-center rounded-full text-accent active:bg-wash-strong"
              >
                <Pencil className="size-[18px]" strokeWidth={2} />
              </button>
            </div>
          </div>
          <p className="mt-1 max-h-[26dvh] overflow-y-auto text-[15px] leading-[22px] whitespace-pre-line text-ink-2 select-text">
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Change the words — in the same window a thought is typed in, with its
 * note below and Business or Private at the top: changing that moves it.
 */
function EditSheet({ open, task, onClose }: { open: boolean; task: Task; onClose: () => void }) {
  const from = spaceOf(task);
  const fromPhoto = isNamedByPhoto(task);
  return (
    <Composer
      open={open}
      label={fromPhoto ? t('photo_text') : t('act_edit')}
      initialText={fromPhoto ? task.photoText! : task.title}
      initialNotes={task.notes}
      showNotes={!!task.notes?.trim()}
      initialSpace={from}
      onClose={onClose}
      onSave={({ text, notes, space }) => {
        if (!text) return;
        const undo = ws().transact(() => {
          if (fromPhoto) {
            // The words were corrected: the thought keeps being named after them.
            ws().updateTask(task.id, { photoText: text, title: headlineOf(text) || task.title, notes, space });
          } else {
            ws().renameTask(task.id, text);
            ws().updateTask(task.id, { notes, space });
          }
        });
        haptic('success');
        toast(space !== from ? t('moved_to', { space: t(space) }) : t('edit_saved'), { action: { label: t('undo'), run: undo } });
      }}
    />
  );
}

/** What `datetime-local` wants: local wall time, no zone, to the minute. */
function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tomorrowMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Reminders, offered as the four answers people actually give. A date picker
 * is a scheduler's interface; this is a promise not to let you forget.
 */
function RemindSheet({ open, task, onClose }: { open: boolean; task: { id: string; reminderAt: string | null }; onClose: () => void }) {
  const choices = reminderChoices();
  const [picking, setPicking] = useState(false);
  const [when, setWhen] = useState('');

  useEffect(() => {
    if (!open) {
      setPicking(false);
      return;
    }
    // Open on the reminder it already has, or on tomorrow morning — the
    // answer people give most often once the four quick ones do not fit.
    const start = task.reminderAt ? new Date(task.reminderAt) : undefined;
    setWhen(localInput(start ?? tomorrowMorning()));
  }, [open, task.reminderAt]);

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

      {/* For the times the four answers above do not cover: the phone's own
          date and time wheels, which everyone already knows how to use. */}
      {picking ? (
        <div className="animate-fade px-6 pt-2 pb-1">
          <input
            type="datetime-local"
            value={when}
            min={localInput(new Date())}
            autoFocus
            onChange={(e) => setWhen(e.target.value)}
            aria-label={t('remind_pick')}
            className="h-12 w-full rounded-[14px] border border-line bg-sunk px-4 text-[16px] text-ink outline-none focus:border-accent/50"
          />
          <button
            onClick={() => {
              const at = new Date(when);
              // An impossible or past moment is a slip, not an instruction.
              if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
                toast(t('remind_pick_past'));
                return;
              }
              void choose(at);
            }}
            className="mt-2 h-12 w-full rounded-[14px] bg-accent text-[16px] font-semibold text-on-accent"
          >
            {t('remind_pick_confirm')}
          </button>
        </div>
      ) : (
        <SheetAction icon={CalendarClock} label={t('remind_pick')} onClick={() => setPicking(true)} />
      )}
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
