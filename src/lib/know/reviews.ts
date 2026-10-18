import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from '@/lib/native/platform';
import { kt } from '@/mobile/knowI18n';
import { definitions, dueNow } from './store';

/**
 * One quiet morning reminder when terms are due — at nine, never more than
 * one a day — so what was looked up in a meeting is seen again until it is
 * known. Only when notifications are already allowed: reviews never ask for
 * the permission themselves.
 */

const NOTICE_ID = 990_001;
const HOUR = 9;

/** The next nine o'clock at which at least one term will be due, and how many. */
export function nextReviewNotice(now = new Date()): { at: Date; count: number } | null {
  const all = definitions();
  if (!all.length) return null;
  for (let day = 0; day < 70; day++) {
    const at = new Date(now);
    at.setDate(now.getDate() + day);
    at.setHours(HOUR, 0, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    const count = dueNow(at, all).length;
    if (count) return { at, count };
  }
  return null;
}

export async function scheduleReviewNotice(): Promise<void> {
  if (!isNative()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    await LocalNotifications.cancel({ notifications: [{ id: NOTICE_ID }] });
    if (display !== 'granted') return;
    const next = nextReviewNotice();
    if (!next) return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTICE_ID,
          title: 'Hence',
          body: next.count === 1 ? kt('review_notice_one') : kt('review_notice_many', { n: next.count }),
          schedule: { at: next.at },
          extra: { route: 'know' },
        },
      ],
    });
  } catch {
    /* a missed reminder; the tab still shows what is due */
  }
}
