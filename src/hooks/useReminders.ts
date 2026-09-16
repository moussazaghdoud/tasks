import { useEffect } from 'react';
import { isNative } from '@/lib/native/platform';
import { ui } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { useToasts } from '@/store/toast';

/**
 * Fires due reminders while the app is open: an in-app notice plus a system
 * notification when permitted. With a backend this becomes a push job.
 */
export function useReminders() {
  const ready = useWorkspace((s) => s.ready);
  useEffect(() => {
    // In the native app iOS delivers reminders itself (see lib/native/
    // notifications.ts), so polling here would announce them twice.
    if (!ready || isNative()) return;
    const check = () => {
      const now = Date.now();
      for (const t of Object.values(ws().tasks)) {
        if (!t.reminderAt || t.reminderFiredAt || t.status === 'done' || t.archivedAt) continue;
        if (new Date(t.reminderAt).getTime() > now) continue;
        ws().markReminderFired(t.id);
        useToasts.getState().push({
          tone: 'reminder',
          message: t.title,
          detail: 'Reminder',
          action: { label: 'Open', run: () => ui().openTask(t.id) },
          secondary: {
            label: 'In 10 min',
            run: () => ws().setReminder([t.id], new Date(Date.now() + 10 * 60000).toISOString()),
          },
        });
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          const n = new Notification(t.title, { body: 'Reminder from Hence', tag: t.id });
          n.onclick = () => {
            window.focus();
            ui().openTask(t.id);
          };
        }
      }
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [ready]);
}
