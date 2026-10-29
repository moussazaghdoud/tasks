import type { Task } from '@/domain/types';
import { log, logText, ref } from '@/lib/log';
import { exportFile } from '@/lib/native/bridge';
import { isFounder, isPro, isTester, triesFree } from '@/lib/pro/store';
import { readVersion } from '@/lib/version';
import { useWorkspace } from '@/store/workspace';
import { backdrop } from './backdrop';
import { currentLang } from './i18n';
import { currentLook } from './look';
import { spaceOf } from './space';
import { currentTheme } from './theme';

/**
 * What goes into the diary on its own: every change to a thought, whatever
 * caused it — a tap, a swipe, a voice command, iCloud, someone's message —
 * plus the app's errors and its comings and goings.
 *
 * Watching the store rather than each button means nothing is missed: a
 * thought cannot change without passing through here.
 */
let started = false;

export function startDiagnostics(): void {
  if (started) return;
  started = true;

  const tasks = Object.values(useWorkspace.getState().tasks);
  log('app', `launch · ${tasks.length} thoughts · ${summary(tasks)}`);
  void readVersion().then((v) => log('app', `version ${v}`));

  useWorkspace.subscribe((now, before) => {
    if (!before.ready || now.tasks === before.tasks) return;
    const changes: string[] = [];
    for (const [id, task] of Object.entries(now.tasks)) {
      const was = before.tasks[id];
      if (!was) changes.push(`created ${ref(id)} · ${describe(task)}`);
      else if (was !== task) changes.push(...differences(was, task));
    }
    for (const id of Object.keys(before.tasks)) {
      if (!now.tasks[id]) changes.push(`removed ${ref(id)} · was ${before.tasks[id].status}`);
    }
    // Many at once is an import or a restore; one line says what happened.
    if (changes.length > 25) log('thought', `${changes.length} changes at once (import or restore)`);
    else for (const change of changes) log('thought', change);
  });

  window.addEventListener('error', (e) => log('error', `${e.message} @ ${e.filename?.split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => log('error', `unhandled: ${reason(e.reason)}`));
  document.addEventListener('visibilitychange', () => log('app', document.visibilityState === 'visible' ? 'foreground' : 'background'));
}

export function differences(was: Task, task: Task): string[] {
  const out: string[] = [];
  const id = ref(task.id);
  if (was.status !== task.status) out.push(task.status === 'done' ? `done ${id}` : `reopened ${id} · ${task.status}`);
  if (spaceOf(was) !== spaceOf(task)) out.push(`moved ${id} → ${spaceOf(task)}`);
  if (was.priority !== task.priority) out.push(`priority ${id} → ${task.priority}`);
  if (was.reminderAt !== task.reminderAt) out.push(`reminder ${id} → ${task.reminderAt ?? 'none'}`);
  if (!was.archivedAt && task.archivedAt) out.push(`archived ${id}`);
  if (was.title !== task.title) out.push(`edited ${id}`);
  return out;
}

/** What a new thought is, never what it says. */
export function describe(task: Task): string {
  return [
    spaceOf(task),
    task.status,
    task.photo && 'photo',
    task.reminderAt && 'reminder',
    task.recurrence && `repeats ${task.recurrence.freq}`,
    task.sharedBy && 'received',
    task.priority === 'important' && 'important',
  ]
    .filter(Boolean)
    .join(' ');
}

function summary(tasks: Task[]): string {
  const count = (space: string, done: boolean) =>
    tasks.filter((t) => spaceOf(t) === space && !t.archivedAt && (t.status === 'done') === done).length;
  return `business ${count('business', false)} open/${count('business', true)} done, private ${count('private', false)} open/${count('private', true)} done`;
}

function reason(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value && 'message' in value) return String((value as { message: unknown }).message);
  return String(value);
}

/** The diary, with what the phone and the app were, through the share sheet. */
export async function sendDiagnostics(): Promise<void> {
  const tasks = Object.values(useWorkspace.getState().tasks);
  const header = [
    'Hence diagnostics',
    `version ${await readVersion()}`,
    `created ${new Date().toISOString()} · zone ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
    `device ${navigator.userAgent}`,
    `language ${currentLang()} · look ${currentLook()} · theme ${currentTheme()} · background ${backdrop().kind}`,
    `pro ${isPro()} · founder ${isFounder()} · tester ${isTester()} · tries free ${triesFree()}`,
    `thoughts ${tasks.length} · ${summary(tasks)}`,
  ];
  log('app', 'diagnostics sent');
  await exportFile(`Hence diagnostics ${new Date().toISOString().slice(0, 16).replace(':', 'h')}.txt`, logText(header), 'text/plain');
}
