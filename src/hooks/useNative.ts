import { useEffect } from 'react';
import { initNative } from '@/lib/native/bridge';
import { initNotifications, syncReminders } from '@/lib/native/notifications';
import { isNative } from '@/lib/native/platform';
import { hashToRoute } from '@/store/ui';
import { ui } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';

/**
 * Native app startup: status bar, splash, keyboard, reminders, deep links and
 * what to do when the app comes back to the foreground. A no-op on the web.
 */
export function useNative(): void {
  const ready = useWorkspace((s) => s.ready);

  useEffect(() => {
    if (!ready || !isNative()) return;

    void initNative(
      // Back in the foreground: the day may have rolled over, and reminders
      // that fired while we were away should be reflected.
      () => {
        void syncReminders();
        document.dispatchEvent(new Event('visibilitychange'));
      },
      // hence://task/<id> or https://…/#/task/<id>
      (url) => {
        const hash = url.includes('#') ? url.slice(url.indexOf('#')) : `#/${url.split('://')[1] ?? ''}`;
        const { route, taskId } = hashToRoute(hash);
        ui().navigate(route);
        if (taskId) ui().openTask(taskId);
      },
    );
    void initNotifications();
  }, [ready]);
}
