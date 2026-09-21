import { CalendarCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/platform';
import { t } from './i18n';
import { calendarConfigured, listToday, useMicrosoft, type Meeting } from './microsoft';

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    setFailed(false);
    void listToday()
      .then((list) => live && setMeetings(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [connected]);

  if (!calendarConfigured() || !connected) {
    return (
      <Empty icon>
        {t('agenda_connect')}
      </Empty>
    );
  }

  if (failed) return <Empty>{t('agenda_failed')}</Empty>;
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
      <p className="text-[15px] leading-[22px] text-ink-3">{children}</p>
    </div>
  );
}
