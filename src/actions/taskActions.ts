/**
 * Every user-facing task operation goes through here, so the row buttons,
 * the action menu, keyboard shortcuts and the command palette behave
 * identically (same toasts, same undo).
 */
import type { DateKey, ID, Priority, RecurrenceRule, Task, TimeKey } from '@/domain/types';
import { describeNext } from '@/domain/recurrence';
import { dueLabel, formatTime, todayKey } from '@/lib/dates';
import { copyText, haptic } from '@/lib/native/bridge';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { isNative } from '@/lib/native/platform';
import { toast } from '@/store/toast';
import { ui } from '@/store/ui';
import { ws } from '@/store/workspace';

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : `${n} ${many}`);
const subject = (ids: ID[]) => {
  if (ids.length === 1) {
    const t = ws().tasks[ids[0]];
    return t ? `“${t.title.length > 42 ? t.title.slice(0, 40) + '…' : t.title}”` : 'Task';
  }
  return `${ids.length} tasks`;
};

function withUndo(fn: () => void, message: string, detail?: string) {
  const undo = ws().transact(fn);
  toast(message, { detail, action: { label: 'Undo', run: undo } });
}

// ---- completion with animation ----------------------------------------------

type Animator = () => Promise<void>;
const animators = new Map<ID, Animator>();

/** Rows register an animation that plays before the task leaves the list. */
export function registerCompletionAnimator(id: ID, fn: Animator) {
  animators.set(id, fn);
  return () => {
    if (animators.get(id) === fn) animators.delete(id);
  };
}

export async function completeTasks(ids: ID[]) {
  const open = ids.filter((id) => ws().tasks[id] && ws().tasks[id].status !== 'done');
  if (!open.length) return;
  haptic('success');
  await Promise.all(open.map((id) => animators.get(id)?.() ?? Promise.resolve()));
  let spawned: Task[] = [];
  const undo = ws().transact(() => {
    spawned = ws().complete(open).spawned;
  });
  const s = ui();
  if (s.selection.length) s.setSelection(s.selection.filter((id) => !open.includes(id)));
  const next = spawned[0];
  toast(open.length === 1 ? 'Completed' : `${open.length} tasks completed`, {
    detail: next ? `Repeats — next ${dueLabel(next.dueDate!).toLowerCase()}` : open.length === 1 ? ws().tasks[open[0]]?.title : undefined,
    action: { label: 'Undo', run: undo },
  });
}

export function toggleComplete(id: ID) {
  const t = ws().tasks[id];
  if (!t) return;
  if (t.status === 'done') ws().reopen([id]);
  else void completeTasks([id]);
}

// ---- scheduling ---------------------------------------------------------------

export function schedule(ids: ID[], date: DateKey | null, time?: TimeKey | null) {
  if (!ids.length) return;
  const fmt = ws().user.preferences.timeFormat;
  withUndo(
    () => ws().setDue(ids, date, time),
    date ? `${subject(ids)} → ${dueLabel(date)}${time ? ` ${formatTime(time, fmt)}` : ''}` : `${subject(ids)} — date removed`,
  );
}

export function deferLater(ids: ID[]) {
  if (!ids.length) return;
  withUndo(() => ws().defer(ids), `${subject(ids)} → Later`);
}

export function setPriority(ids: ID[], p: Priority) {
  ws().setPriority(ids, p);
}

export function toggleImportant(ids: ID[]) {
  ws().toggleImportant(ids);
}

export function moveTo(ids: ID[], projectId: ID | null) {
  if (!ids.length) return;
  const name = projectId ? ws().projects[projectId]?.name : 'Inbox';
  withUndo(() => ws().moveToProject(ids, projectId), `${subject(ids)} → ${name}`);
}

export function assignTo(ids: ID[], personId: ID | null) {
  ws().assign(ids, personId);
}

export function remind(ids: ID[], at: Date | null) {
  ws().setReminder(ids, at ? at.toISOString() : null);
  if (!at) return;
  toast('Reminder set', {
    detail: at.toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
  });
  if (isNative()) {
    // iOS delivers this even when the app is closed, once permission is given.
    void ensureNotificationPermission().then((granted) => {
      if (!granted) toast('Notifications are off', { detail: 'Turn them on for Hence in iOS Settings to get reminders.' });
    });
  } else if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function repeat(ids: ID[], rule: RecurrenceRule | null) {
  ws().setRecurrence(ids, rule);
  if (rule && ids.length === 1) {
    const t = ws().tasks[ids[0]];
    if (t?.dueDate) toast('Repeats', { detail: `Next after this one: ${describeNext(rule, t.dueDate).toLowerCase()}` });
  }
}

export function archiveTasks(ids: ID[]) {
  if (!ids.length) return;
  closeIfOpen(ids);
  withUndo(() => ws().archive(ids), `${subject(ids)} archived`);
}

export function deleteTasks(ids: ID[]) {
  if (!ids.length) return;
  closeIfOpen(ids);
  withUndo(() => ws().remove(ids), `${plural(ids.length, 'Task', 'tasks')} deleted`);
}

export function duplicateTask(id: ID) {
  const copy = ws().duplicate(id);
  if (copy) {
    toast('Duplicated', { detail: copy.title });
    ui().setCursor(copy.id);
  }
}

export async function copyTaskLink(id: ID) {
  const url = isNative() ? `hence://task/${id}` : `${window.location.origin}${window.location.pathname}#/task/${id}`;
  if (await copyText(url)) toast('Link copied');
  else toast('Could not copy link', { detail: url });
}

export function openDetail(id: ID, section?: 'notes' | 'subtask' | 'link' | 'title') {
  ui().openTask(id);
  if (section) requestAnimationFrame(() => ui().focusPanel(section));
}

function closeIfOpen(ids: ID[]) {
  const s = ui();
  if (s.openTaskId && ids.includes(s.openTaskId)) s.openTask(null);
  if (s.focusTaskId && ids.includes(s.focusTaskId)) s.stopFocus();
  if (s.selection.length) s.setSelection(s.selection.filter((x) => !ids.includes(x)));
}

export function undoLast() {
  if (!ws().undo()) toast('Nothing to undo');
  else toast('Undone');
}

export const isToday = (t: Task) => t.dueDate === todayKey();
