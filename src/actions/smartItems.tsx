import { Bell, CalendarCheck, FolderInput, Repeat, UserPlus, Flag, Hourglass } from 'lucide-react';
import type { ID } from '@/domain/types';
import { ME } from '@/domain/factories';
import { recurrenceLabel } from '@/domain/recurrence';
import { formatDuration } from '@/lib/dates';
import { defaultDateOrder, parseTask, parseWhen } from '@/lib/nlp';
import { ws } from '@/store/workspace';
import { whenLabel } from '@/components/pickers/DatePicker';
import { parseReminder } from '@/components/pickers/ReminderPicker';
import type { PickItem } from '@/components/pickers/ListPicker';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { assignTo, moveTo, remind, repeat, schedule, setPriority } from './taskActions';

/**
 * Natural-language transformations: "fri 3pm", "move rainbow", "assign claire",
 * "remind in 20 min", "every monday", "important". Returned items are pinned
 * to the top of the action menu / palette.
 */
export function smartItems(query: string, ids: ID[], done: () => void): PickItem[] {
  const q = query.trim();
  if (!q || !ids.length) return [];
  const out: PickItem[] = [];
  const state = ws();
  const fmt = state.user.preferences.timeFormat;
  const run = (fn: () => void) => () => {
    fn();
    done();
  };

  // Scheduling: the whole query is a date phrase.
  const when = parseWhen(q.replace(/^(schedule|due|on|for)\s+/i, ''), { dateOrder: defaultDateOrder(), weekStartsOn: state.user.preferences.weekStartsOn });
  if (when?.date && !/^(remind|every)/i.test(q)) {
    out.push({
      id: 'nl-date',
      pinned: true,
      label: (
        <>
          Schedule for <span className="font-medium text-ink">{whenLabel(when.date, when.time, fmt)}</span>
        </>
      ),
      text: q,
      icon: <CalendarCheck className="size-4 text-accent" />,
      onSelect: run(() => schedule(ids, when.date!, when.time ?? undefined)),
    });
  }

  // Move to a project.
  const mv = q.match(/^(?:move(?:\s+to)?|to|#)\s*(.+)$/i);
  if (mv) {
    const name = mv[1].toLowerCase();
    for (const p of Object.values(state.projects).filter((p) => !p.archivedAt && p.name.toLowerCase().startsWith(name)).slice(0, 3)) {
      out.push({
        id: `nl-move-${p.id}`,
        pinned: true,
        label: (
          <>
            Move to <span className="font-medium text-ink">{p.name}</span>
          </>
        ),
        text: q,
        icon: <ProjectGlyph project={p} />,
        onSelect: run(() => moveTo(ids, p.id)),
      });
    }
    if (/^inbox|^no project/.test(name)) {
      out.push({ id: 'nl-move-inbox', pinned: true, label: 'Move out of project', text: q, icon: <FolderInput className="size-4" />, onSelect: run(() => moveTo(ids, null)) });
    }
  }

  // Assign.
  const as = q.match(/^(?:assign(?:\s+to)?|delegate(?:\s+to)?|give\s+to|@)\s*(.+)$/i);
  if (as) {
    const name = as[1].toLowerCase();
    const matches = Object.values(state.people).filter((p) => p.id !== ME && p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(name)));
    for (const p of matches.slice(0, 3)) {
      out.push({
        id: `nl-assign-${p.id}`,
        pinned: true,
        label: (
          <>
            Assign to <span className="font-medium text-ink">{p.name}</span>
          </>
        ),
        text: q,
        icon: <UserPlus className="size-4 text-accent" />,
        onSelect: run(() => assignTo(ids, p.id)),
      });
    }
    if (/^me$|^myself$/.test(name)) out.push({ id: 'nl-assign-me', pinned: true, label: 'Assign to me', text: q, icon: <UserPlus className="size-4" />, onSelect: run(() => assignTo(ids, null)) });
  }

  // Reminder.
  const rm = q.match(/^remind(?:\s+me)?\s+(.+)$/i);
  if (rm) {
    const at = parseReminder(rm[1].replace(/^(at|on)\s+/i, ''));
    if (at && at > new Date()) {
      const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      out.push({
        id: 'nl-remind',
        pinned: true,
        label: (
          <>
            Remind me <span className="font-medium text-ink">{whenLabel(key, time, fmt)}</span>
          </>
        ),
        text: q,
        icon: <Bell className="size-4 text-accent" />,
        onSelect: run(() => remind(ids, at)),
      });
    }
  }

  // Recurrence.
  if (/^(every|repeat|daily|weekly|monthly)/i.test(q)) {
    const r = parseTask(`x ${q.replace(/^repeat\s+/i, '')}`);
    if (r.recurrence) {
      const rule = r.recurrence;
      out.push({
        id: 'nl-repeat',
        pinned: true,
        label: (
          <>
            Repeat <span className="font-medium text-ink">{recurrenceLabel(rule, r.dueDate).toLowerCase()}</span>
          </>
        ),
        text: q,
        icon: <Repeat className="size-4 text-accent" />,
        onSelect: run(() => repeat(ids, rule)),
      });
    }
  }

  // Duration.
  const est = q.match(/^(?:estimate|takes?|~)\s*(.+)$/i);
  if (est) {
    const r = parseTask(`x ${/^\d+$/.test(est[1]) ? `${est[1]} min` : est[1]}`);
    if (r.estimatedMinutes) {
      const m = r.estimatedMinutes;
      out.push({ id: 'nl-est', pinned: true, label: `Estimate ${formatDuration(m)}`, text: q, icon: <Hourglass className="size-4 text-accent" />, onSelect: run(() => ws().setEstimate(ids, m)) });
    }
  }

  // Priority words.
  if (/^(high|important|urgent|p1)$/i.test(q)) {
    out.push({ id: 'nl-imp', pinned: true, label: 'Make important', text: q, icon: <Flag className="size-4 text-ember" />, onSelect: run(() => setPriority(ids, 'important')) });
  } else if (/^(low|p3)$/i.test(q)) {
    out.push({ id: 'nl-low', pinned: true, label: 'Set low priority', text: q, icon: <Flag className="size-4" />, onSelect: run(() => setPriority(ids, 'low')) });
  }

  return out;
}
