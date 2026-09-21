import { CalendarCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/platform';
import { t } from './i18n';
import { calendarConfigured, listToday, refreshAccount, useMicrosoft, type Meeting } from './microsoft';

/** "1 h", "30 min", "1 h 30" — the shortest thing that is still exact. */
function duration(start: string, end: string): string {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Today, from the calendar you already keep.
 *
 * Read-only on purpose. These are not thoughts you captured and they are not
 * yours to tick off here — the meeting belongs to Outlook. It sits first
 * because what is already committed shapes what else the day can hold.
 */
export function AgendaList() {
  const { connected } = useMicrosoft();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    setFailure(null);
    setMeetings(null);
    void listToday()
      .then((list) => live && setMeetings(list))
      .catch((error: { message?: string; code?: string }) => {
        if (!live) return;
        // Keep Microsoft’s own words: "could not reach" alone cannot tell a
        // missing permission from a company policy from a dead connection.
        setFailure(error?.message || '');
        // If the connection itself is gone, let Settings and this screen
        // both find out, so the prompt to reconnect appears.
        if (error?.code === 'not_connected') void refreshAccount();
      });
    return () => {
      live = false;
    };
  }, [connected, attempt]);

  if (!calendarConfigured() || !connected) {
    return (
      <Empty icon>
        {t('agenda_connect')}
      </Empty>
    );
  }

  if (failure !== null) {
    return (
      <Empty>
        {t('agenda_failed')}
        {failure && <span className="mt-2 block text-[12px] leading-[17px] text-ink-4 select-text">{failure}</span>}
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-4 h-10 rounded-full border border-line px-5 text-[14px] font-medium text-accent active:bg-wash-strong"
        >
          {t('retry')}
        </button>
      </Empty>
    );
  }
  if (meetings === null) return <Empty>{t('agenda_loading')}</Empty>;
  if (meetings.length === 0) return <Empty>{t('agenda_empty')}</Empty>;

  const now = Date.now();

  return (
    <ul className="pt-1">
      {meetings.map((meeting, i) => {
        const over = new Date(meeting.end).getTime() < now;
        const length = duration(meeting.start, meeting.end);
        return (
          <li
            key={`${meeting.start}-${i}`}
            className={cn(
              'mb-2 flex items-start gap-3.5 rounded-[15px] border border-line bg-sunk px-4 py-3.5',
              over && 'opacity-45',
            )}
          >
            <span className="w-[52px] shrink-0 pt-[1px] text-[13px] font-semibold tabular-nums text-accent">
              {meeting.allDay ? t('agenda_all_day') : clock(meeting.start)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-[21px] tracking-[-0.01em] text-ink">{meeting.subject}</span>
              {!meeting.allDay && length && (
                <span className="mt-1 block text-[12px] text-ink-3 tabular-nums">{length}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ children, icon }: { children: React.ReactNode; icon?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 pt-24 text-center">
      {icon && <CalendarCheck className="size-7 text-ink-4" strokeWidth={1.6} />}
      <div className="text-[15px] leading-[22px] text-ink-3">{children}</div>
    </div>
  );
}
