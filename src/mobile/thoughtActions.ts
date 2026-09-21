/**
 * What you can do with a thought once you've caught it.
 *
 * Each of these hands off to something the phone already does well — Mail, the
 * calendar, the share sheet — rather than rebuilding it here. Capture stays
 * the app's job; acting belongs to the tools you already use.
 */
import type { Task } from '@/domain/types';
import { todayKey } from '@/lib/dates';
import { exportFile } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { t } from './i18n';
import { calendarConfigured, createEvent, isConnected } from './microsoft';

/** Text the person can act on: the thought, plus whatever context we captured. */
function body(task: Task): string {
  const lines = [task.notes?.trim()].filter(Boolean) as string[];
  const steps = task.subtasks.filter((s) => !s.done).map((s) => `• ${s.title}`);
  if (steps.length) lines.push(steps.join('\n'));
  return lines.join('\n\n');
}

/**
 * Hand the thought to Mail with the subject and body filled in.
 *
 * `mailto:` is deliberate: it opens the account the person already uses, with
 * their signature, and nothing leaves the device until they press send.
 */
export function openEmail(task: Task): void {
  const url = `mailto:?subject=${encodeURIComponent(task.title)}&body=${encodeURIComponent(body(task))}`;
  window.location.href = url;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
/** ICS escapes commas, semicolons and newlines; unescaped ones break the file. */
const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

/**
 * Build a single-event calendar file and pass it to the share sheet, where
 * "Add to Calendar" is one tap. No calendar permission is requested, and
 * nothing is written to a calendar behind the person's back.
 */
export async function addToCalendar(task: Task): Promise<void> {
  // Connected to Outlook, the event goes straight in. Otherwise fall through
  // to the file and the share sheet, which needs no account at all.
  if (calendarConfigured()) {
    try {
      if (await isConnected()) {
        await createEvent(task);
        toast(t('added_to_calendar'));
        return;
      }
    } catch {
      // Fall through to the share sheet rather than leave the person stuck.
    }
  }

  const date = task.dueDate ?? todayKey();
  const allDay = !task.dueTime;
  let when: string;
  if (allDay) {
    const compact = date.replace(/-/g, '');
    when = `DTSTART;VALUE=DATE:${compact}\nDTEND;VALUE=DATE:${compact}`;
  } else {
    const startsAt = new Date(`${date}T${task.dueTime}:00`);
    const endsAt = new Date(startsAt.getTime() + (task.estimatedMinutes ?? 60) * 60_000);
    when = `DTSTART:${stamp(startsAt)}\nDTEND:${stamp(endsAt)}`;
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hence//Capture//EN',
    'BEGIN:VEVENT',
    `UID:${task.id}@hence`,
    `DTSTAMP:${stamp(new Date())}`,
    when,
    `SUMMARY:${esc(task.title)}`,
    body(task) ? `DESCRIPTION:${esc(body(task))}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\n');

  await exportFile(`${task.title.slice(0, 40).replace(/[^\w ]+/g, '') || 'event'}.ics`, ics, 'text/calendar');
}

/** The system share sheet, so a thought can go anywhere the phone can send it. */
export async function shareThought(task: Task): Promise<void> {
  const text = [task.title, body(task)].filter(Boolean).join('\n\n');
  try {
    if (isNative()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text, title: task.title, dialogTitle: 'Share' });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text, title: task.title });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    // A dismissed share sheet is not a failure worth reporting.
  }
}

/** Reminder presets, resolved against the current time rather than a fixed clock. */
export interface ReminderChoice {
  /** Dictionary key, so the label follows the chosen language. */
  key: 'remind_hour' | 'remind_evening' | 'remind_tomorrow' | 'remind_next_week';
  at: Date;
}

export function reminderChoices(now = new Date()): ReminderChoice[] {
  const out: ReminderChoice[] = [];
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };

  const inAnHour = new Date(now.getTime() + 60 * 60_000);
  out.push({ key: 'remind_hour', at: inAnHour });

  const evening = at(0, 18);
  if (evening > now) out.push({ key: 'remind_evening', at: evening });

  out.push({ key: 'remind_tomorrow', at: at(1, 9) });
  out.push({ key: 'remind_next_week', at: at(7, 9) });
  return out;
}

export function setReminder(taskId: string, at: Date | null): void {
  ws().setReminder([taskId], at ? at.toISOString() : null);
}
