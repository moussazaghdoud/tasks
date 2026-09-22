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

/** How far ahead the agenda reads: today and the six days after it. */
const DAYS = 7;

/**
 * One tone per day, by distance from today. Spelled out as whole class names
 * rather than assembled at runtime: Tailwind only keeps the colours a class
 * actually names, and a computed name is invisible to it.
 *
 * Today is the neutral card with the accent — it is where you are. Every
 * later day gets its own hue, so the eye finds where one day stops without
 * reading a heading.
 */
const TONES = [
  { ink: 'text-accent', card: 'border-line bg-sunk' },
  { ink: 'text-tomorrow', card: 'border-tomorrow/25 bg-tomorrow-soft' },
  { ink: 'text-day-2', card: 'border-day-2/25 bg-day-2-soft' },
  { ink: 'text-day-3', card: 'border-day-3/25 bg-day-3-soft' },
  { ink: 'text-day-4', card: 'border-day-4/25 bg-day-4-soft' },
  { ink: 'text-day-5', card: 'border-day-5/25 bg-day-5-soft' },
  { ink: 'text-day-6', card: 'border-day-6/25 bg-day-6-soft' },
] as const;

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
 * The week ahead, starting from now.
 *
 * Only what is still ahead of you: a meeting that has ended is of no use on
 * a screen you look at to know what comes next. One that has started but not
 * finished stays, marked as happening now — you are probably in it.
 *
 * Today and tomorrow always appear, because "nothing left today" is worth
 * knowing. Later days appear only when they hold something; a run of empty
 * Saturdays would be noise. Read-only on purpose: meetings belong to Outlook.
 */
export function AgendaList() {
  const { connected, checked } = useMicrosoft();
  // Start from the copy on the phone, so the week is there the moment the
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
    // Deliberately not clearing what is on screen: the stored week stays up
    // while the fresh one loads, rather than flashing to a spinner.
    void listAgenda(DAYS)
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
  // stored week to fall back on, it becomes a quiet line instead.
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

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const days = Array.from({ length: DAYS }, (_, offset) => {
    const date = new Date(midnight);
    date.setDate(midnight.getDate() + offset);
    const key = toKey(date);
    const items = meetings.filter(
      (m) =>
        toKey(new Date(m.start)) === key &&
        // Today keeps only what is still ahead. All-day items have no
        // remaining part, so they stay until midnight.
        (offset > 0 || m.allDay || new Date(m.end).getTime() > now),
    );
    return { offset, date, items };
  });

  if (days.every((d) => !d.items.length)) return <Empty>{t('agenda_empty')}</Empty>;

  const longDate = (d: Date) => d.toLocaleDateString(localeOf(), { day: 'numeric', month: 'long' });
  const weekday = (d: Date) => {
    const name = d.toLocaleDateString(localeOf(), { weekday: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  };

  return (
    <div className="pt-1">
      {days.map(({ offset, date, items }) => {
        // Beyond tomorrow, an empty day is left out rather than announced.
        if (offset > 1 && !items.length) return null;
        const tone = TONES[offset];
        const label = offset === 0 ? t('agenda_today_header') : offset === 1 ? t('agenda_tomorrow_header') : weekday(date);
        const detail = offset === 0 ? undefined : offset === 1 ? `${weekday(date)} ${longDate(date)}` : longDate(date);

        return (
          <section key={offset}>
            <DayHeading label={label} detail={detail} ink={tone.ink} first={offset === 0} />
            {items.length ? (
              <ul>
                {items.map((m, i) => (
                  <MeetingRow key={`${offset}-${m.start}-${i}`} meeting={m} now={now} today={offset === 0} tone={tone} />
                ))}
              </ul>
            ) : (
              <p className="px-2 pb-3 text-[14px] text-ink-4">
                {offset === 0 ? t('agenda_nothing_left') : t('agenda_nothing_tomorrow')}
              </p>
            )}
          </section>
        );
      })}

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

function DayHeading({ label, detail, ink, first }: { label: string; detail?: string; ink: string; first: boolean }) {
  return (
    <div className={cn('flex items-baseline gap-2 px-2 pb-2.5', first ? 'pt-1' : 'pt-6')}>
      <span className={cn('text-[11px] font-semibold tracking-[0.16em] uppercase', ink)}>{label}</span>
      {detail && <span className="truncate text-[12px] text-ink-4">{detail}</span>}
    </div>
  );
}

function MeetingRow({
  meeting,
  now,
  today,
  tone,
}: {
  meeting: Meeting;
  now: number;
  today: boolean;
  tone: (typeof TONES)[number];
}) {
  const start = new Date(meeting.start).getTime();
  const end = new Date(meeting.end).getTime();
  const happening = today && !meeting.allDay && start <= now && now < end;
  const length = duration(meeting.start, meeting.end);

  return (
    <li className={cn('mb-2 flex items-start gap-3.5 rounded-[15px] border px-4 py-3.5', tone.card, happening && 'border-accent/40')}>
      <span className={cn('w-[52px] shrink-0 pt-[1px] text-[13px] font-semibold tabular-nums', tone.ink)}>
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
