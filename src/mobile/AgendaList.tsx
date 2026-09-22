import { CalendarCheck, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toKey } from '@/lib/dates';
import { haptic } from '@/lib/native/bridge';
import { cn } from '@/lib/platform';
import { localeOf, t } from './i18n';
import {
  calendarConfigured,
  listAgenda,
  onAgendaChanged,
  readAgendaCache,
  refreshAccount,
  useMicrosoft,
  writeAgendaCache,
  type Meeting,
} from './microsoft';

/** How far ahead the agenda reads: today and the six days after it. */
const DAYS = 7;
/** How often an agenda left open reads the calendar again. */
const REFRESH_MS = 2 * 60_000;

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
  const [loading, setLoading] = useState(false);
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

  // A meeting added in Outlook while this screen stays open would otherwise
  // wait for the next visit. Every two minutes is cheap, and only while the
  // agenda is actually being looked at.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setAttempt((n) => n + 1);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // An event Hence just created. Graph can take a moment to list a new event,
  // so the read waits briefly rather than fetching the week without it.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onAgendaChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setAttempt((n) => n + 1), 1500);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!checked) void refreshAccount();
  }, [checked]);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    setFailure(null);
    setLoading(true);
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
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [connected, attempt]);

  const pull = usePullToRefresh(() => setAttempt((n) => n + 1), loading);

  if (!calendarConfigured() || (checked && !connected)) {
    return <Empty icon>{t('agenda_connect')}</Empty>;
  }

  const body = (): React.ReactNode => {
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
  };

  return (
    <div {...pull.handlers} className="min-h-full">
      <PullIndicator distance={pull.distance} spinning={pull.pulled && loading} />
      {body()}
    </div>
  );
}

/** How far to pull, in points after damping, before letting go reloads. */
const PULL_TRIGGER = 60;

/**
 * Pull down from the top to read the calendar again — the gesture every
 * iPhone list has taught, so it needs no button and no explanation.
 *
 * Only a pull that starts with the list already at the top counts; otherwise
 * scrolling back up would reload the week on the way.
 */
function usePullToRefresh(onRefresh: () => void, busy: boolean) {
  const [distance, setDistance] = useState(0);
  const [pulled, setPulled] = useState(false);
  const from = useRef<number | null>(null);
  const reached = useRef(0);

  // The spinner belongs to a pull, not to the quiet reloads in the
  // background: it stops when the read it asked for ends.
  useEffect(() => {
    if (!busy) setPulled(false);
  }, [busy]);

  const atTop = (el: HTMLElement) => (el.closest('main')?.scrollTop ?? 0) <= 0;

  return {
    distance,
    pulled,
    handlers: {
      onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
        from.current = atTop(e.currentTarget) ? e.touches[0].clientY : null;
        reached.current = 0;
      },
      onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
        if (from.current === null) return;
        // Halved, so the indicator trails the finger the way iOS's does.
        const next = Math.min(PULL_TRIGGER * 1.5, Math.max(0, (e.touches[0].clientY - from.current) * 0.5));
        if (next >= PULL_TRIGGER && reached.current < PULL_TRIGGER) haptic('light');
        reached.current = next;
        setDistance(next);
      },
      onTouchEnd: () => {
        if (reached.current >= PULL_TRIGGER) {
          setPulled(true);
          onRefresh();
        }
        from.current = null;
        reached.current = 0;
        setDistance(0);
      },
    },
  };
}

function PullIndicator({ distance, spinning }: { distance: number; spinning: boolean }) {
  const height = spinning ? 40 : distance;
  if (!height) return null;
  return (
    <div aria-hidden className="flex items-end justify-center overflow-hidden pb-2" style={{ height }}>
      <RefreshCw
        className={cn('size-[18px] text-ink-3', spinning && 'animate-spin text-accent')}
        style={spinning ? undefined : { transform: `rotate(${distance * 4}deg)`, opacity: Math.min(1, distance / PULL_TRIGGER) }}
        strokeWidth={2}
      />
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
