/**
 * Reminders in the native app.
 *
 * On the web a reminder can only fire while the tab is open. iOS local
 * notifications are scheduled with the system, so they arrive when the app is
 * closed — this is genuinely supported (unlike background processing, which
 * iOS does not guarantee and we don't rely on).
 */
import { LocalNotifications, type PendingLocalNotificationSchema } from '@capacitor/local-notifications';
import type { Task } from '@/domain/types';
import { ui } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { isNative } from './platform';

/** iOS notification ids are 32-bit ints; task ids are strings. */
function notificationId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) hash = (hash * 31 + taskId.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_000_000_000;
}

const dueReminders = (): Task[] =>
  Object.values(ws().tasks).filter(
    (t) => t.reminderAt && !t.reminderFiredAt && t.status !== 'done' && !t.archivedAt && new Date(t.reminderAt) > new Date(),
  );

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) return true;
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

/** Make the scheduled notifications match the tasks that carry a reminder. */
export async function syncReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    const wanted = dueReminders();
    if (wanted.length > 0 && !(await ensureNotificationPermission())) return;

    const pending: PendingLocalNotificationSchema[] = (await LocalNotifications.getPending()).notifications;
    const wantedIds = new Set(wanted.map((t) => notificationId(t.id)));
    const pendingIds = new Set(pending.map((n) => n.id));

    const stale = pending.filter((n) => !wantedIds.has(n.id));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((n) => ({ id: n.id })) });

    const toSchedule = wanted.filter((t) => !pendingIds.has(notificationId(t.id)));
    if (toSchedule.length) {
      await LocalNotifications.schedule({
        notifications: toSchedule.map((t) => ({
          id: notificationId(t.id),
          title: t.title,
          body: t.notes.trim() ? t.notes.trim().slice(0, 120) : 'Reminder',
          schedule: { at: new Date(t.reminderAt!), allowWhileIdle: true },
          extra: { taskId: t.id },
        })),
      });
    }
  } catch (error) {
    console.warn('[hence] could not sync reminders', error);
  }
}

/** Keep the schedule in step with edits, and open the task when one is tapped. */
export async function initNotifications(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const taskId = event.notification.extra?.taskId as string | undefined;
    if (taskId && ws().tasks[taskId]) ui().openTask(taskId);
  });

  let timer: ReturnType<typeof setTimeout> | null = null;
  useWorkspace.subscribe((state, prev) => {
    if (state.tasks === prev.tasks) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncReminders(), 600);
  });

  await syncReminders();
}
