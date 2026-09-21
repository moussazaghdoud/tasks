import { CalendarCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toKey } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { localeOf, t } from './i18n';
import {
  calendarConfigured,
  listAgenda,
  readAgendaCache,
  refreshAccount,
  useMicrosoft,
  writeAgendaCache,
  type Meeting,
} from './microsoft';

/** "1 h", "30 min", "1 h 30" — the shortest thing that is still exact. */
function duration(start: string, end: string): string {
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m}` : `${h} h`;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' });

/**
 * What is left of today, then tomorrow.
 *
 * Only what is still ahead of you: a meeting that has ended is of no use on
 * a screen you look at to know what comes next. One that has started but not
 * finished stays, marked as happening now — you are probably in it.
 *
 * Tomorrow follows directly, in its own colour, so the eye knows where one
 * day stops without reading a heading. Read-only on purpose: meetings belong
 * to Outlook, not to a list you tick off here.
 */
export function AgendaList() {
  const { connected, checked } = useMicrosoft();
  // Start from the copy on the phone, so the day is there the moment the
  // app opens; the network only has to confirm it.
  const [meetings, setMeetings] = useState<Meeting[] | null>(() => readAgendaCache()?.meetings ?? null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => readAgendaCache()?.at ?? null);
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Re-evaluated each minute, so a meeting leaves the list when it ends
  // rather than when you next reopen the tab.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Coming back to the app is when the day has most likely moved on: read
  // the clock and the calendar again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!checked) void refreshAccount();
  }, [checked]);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    setFailure(null);
    // Deliberately not clearing what is on screen: the stored day stays up
    // while the fresh one loads, rather than flashing to a spinner.
    void listAgenda(2)
      .then((list) => {
        if (!live) return;
        setMeetings(list);
        setUpdatedAt(Date.now());
        writeAgendaCache(list);
      })
      .catch((error: { message?: string; code?: string }) => {
        if (!live) return;
        // Keep Microsoft's own words: "could not reach" alone cannot tell a
        // missing permission from a company policy from a dead connection.
        setFailure(error?.message || '');
        if (error?.code === 'not_connected') void refreshAccount();
      });
    return () => {
      live = false;
    };
  }, [connected, attempt]);

  if (!calendarConfigured() || (checked && !connected)) {
    return <Empty icon>{t('agenda_connect')}</Empty>;
  }

  // Only a failure with nothing to show is worth a whole screen. With a
  // stored day to fall back on, it becomes a quiet line instead.
  if (failure !== null && !meetings) {
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

  const todayKey = toKey(new Date(now));
  const tomorrowKey = toKey(new Date(new Date(now).setHours(24, 0, 0, 0)));

  // All-day items have no "remaining" part of the day, so they stay all day.
  const today = meetings.filter(
    (m) => toKey(new Date(m.start)) === todayKey && (m.allDay || new Date(m.end).getTime() > now),
  );
  const tomorrow = meetings.filter((m) => toKey(new Date(m.start)) === tomorrowKey);

  if (!today.length && !tomorrow.length) return <Empty>{t('agenda_empty')}</Empty>;

  const tomorrowLabel = new Date(new Date(now).setHours(24, 0, 0, 0)).toLocaleDateString(localeOf(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="pt-1">
      <DayHeading label={t('agenda_today_header')} />
      {today.length ? (
        <ul>
          {today.map((m, i) => (
            <MeetingRow key={`t-${m.start}-${i}`} meeting={m} now={now} />
          ))}
        </ul>
      ) : (
        <p className="px-2 pb-3 text-[14px] text-ink-4">{t('agenda_nothing_left')}</p>
      )}

      <DayHeading label={t('agenda_tomorrow_header')} detail={tomorrowLabel} tomorrow />
      {tomorrow.length ? (
        <ul>
          {tomorrow.map((m, i) => (
            <MeetingRow key={`n-${m.start}-${i}`} meeting={m} now={now} tomorrow />
          ))}
        </ul>
      ) : (
        <p className="px-2 pb-3 text-[14px] text-ink-4">{t('agenda_nothing_tomorrow')}</p>
      )}

      {/* Say when the calendar last answered, but only when it did not just
          now: a timestamp on every screen is noise. */}
      {failure !== null && updatedAt && (
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mx-auto mt-4 block text-center text-[12px] text-ink-4 active:text-ink-3"
        >
          {t('agenda_stale', { time: clock(new Date(updatedAt).toISOString()) })}
        </button>
      )}
    </div>
  );
}

function DayHeading({ label, detail, tomorrow }: { label: string; detail?: string; tomorrow?: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2 px-2 pb-2.5', tomorrow ? 'pt-6' : 'pt-1')}>
      <span
        className={cn(
          'text-[11px] font-semibold tracking-[0.16em] uppercase',
          tomorrow ? 'text-tomorrow' : 'text-accent',
        )}
      >
        {label}
      </span>
      {detail && <span className="truncate text-[12px] text-ink-4">{detail}</span>}
    </div>
  );
}

function MeetingRow({ meeting, now, tomorrow }: { meeting: Meeting; now: number; tomorrow?: boolean }) {
  const start = new Date(meeting.start).getTime();
  const end = new Date(meeting.end).getTime();
  const happening = !tomorrow && !meeting.allDay && start <= now && now < end;
  const length = duration(meeting.start, meeting.end);

  return (
    <li
      className={cn(
        'mb-2 flex items-start gap-3.5 rounded-[15px] border px-4 py-3.5',
        tomorrow ? 'border-tomorrow/25 bg-tomorrow-soft' : 'border-line bg-sunk',
        happening && 'border-accent/40',
      )}
    >
      <span
        className={cn(
          'w-[52px] shrink-0 pt-[1px] text-[13px] font-semibold tabular-nums',
          tomorrow ? 'text-tomorrow' : 'text-accent',
        )}
      >
        {meeting.allDay ? t('agenda_all_day') : happening ? t('agenda_now') : clock(meeting.start)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-[21px] tracking-[-0.01em] text-ink">{meeting.subject}</span>
        {!meeting.allDay && length && (
          <span className="mt-1 block text-[12px] text-ink-3 tabular-nums">
            {happening ? `${clock(meeting.start)} – ${clock(meeting.end)}` : length}
          </span>
        )}
      </span>
    </li>
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
