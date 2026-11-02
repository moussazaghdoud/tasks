import { CalendarX, Check, CircleHelp, Clock, Mail, Users, X, XCircle } from 'lucide-react';
import { confirmAction, haptic } from '@/lib/native/bridge';
import { cn } from '@/lib/platform';
import { toast } from '@/store/toast';
import { nameOf, others } from './attendees';
import { answerable, respondToMeeting, type Attendee, type Meeting, type MeetingAction } from './calendar';
import { dayTimeIn, t, timeIn } from './i18n';
import { Sheet, SheetAction, SheetDivider } from './Sheet';

/**
 * The few things worth doing with a meeting without opening the calendar:
 * call it off when it is yours, say no when it is someone else's, or write
 * to whoever called it. Everything else belongs to the calendar itself.
 */
export function MeetingSheet({
  meeting,
  open,
  onClose,
  onGone,
}: {
  /** Kept after closing, so the sheet can slide away with its content. */
  meeting: Meeting | null;
  open: boolean;
  onClose: () => void;
  /** The meeting was cancelled or declined: take it off the screen. */
  onGone: (m: Meeting) => void;
}) {
  if (!meeting) return null;
  const m = meeting;
  const organizer = m.organizerName || m.organizerEmail;
  const clock = (iso: string) => timeIn(new Date(iso));

  const answer = async (action: MeetingAction) => {
    const ok = await confirmAction(
      t(action === 'cancel' ? 'meeting_cancel_confirm' : 'meeting_decline_confirm', { subject: m.subject }),
      t(action === 'cancel' ? 'meeting_cancel' : 'meeting_decline'),
      { ok: t(action === 'cancel' ? 'meeting_cancel' : 'meeting_decline'), cancel: t('cancel') },
    );
    if (!ok) return;
    onClose();
    try {
      // A decline goes with a short apology, in the language the app speaks.
      await respondToMeeting(m, action, action === 'decline' ? t('meeting_decline_message') : undefined);
      haptic('success');
      onGone(m);
      toast(t(action === 'cancel' ? 'meeting_cancelled' : 'meeting_declined'));
    } catch (error) {
      toast(`${t('meeting_failed')} ${(error as { message?: string })?.message ?? ''}`.trim());
    }
  };

  const write = () => {
    if (!m.organizerEmail) return;
    onClose();
    const subject = encodeURIComponent(`${t('meeting_mail_subject')} ${m.subject}`);
    window.location.href = `mailto:${encodeURIComponent(m.organizerEmail)}?subject=${subject}`;
  };

  const people = others(m.attendees);
  // Everyone who is still coming, the organiser included, without you.
  const everyone = [
    ...(m.isOrganizer || !m.organizerEmail ? [] : [m.organizerEmail]),
    ...people.filter((p) => p.response !== 'declined' && p.email).map((p) => p.email),
  ];
  const writeAll = () => {
    onClose();
    const subject = encodeURIComponent(`${t('meeting_mail_subject')} ${m.subject}`);
    window.location.href = `mailto:${everyone.map(encodeURIComponent).join(',')}?subject=${subject}`;
  };

  return (
    <Sheet open={open} onClose={onClose} label={m.subject}>
      <div className="px-6 pb-4">
        <h2 className="text-[21px] leading-[29px] font-medium tracking-[-0.015em] text-ink">{m.subject}</h2>
        <p className="mt-1 text-[13px] text-ink-4">
          {m.allDay ? t('agenda_all_day') : `${dayTimeIn(new Date(m.start))} – ${clock(m.end)}`}
        </p>
        <p className="mt-1 text-[13px] text-ink-3">
          {m.isOrganizer ? t('meeting_yours') : organizer ? t('meeting_organized_by', { name: organizer }) : ''}
        </p>
        {/* Who else is coming, and what they said. */}
        {people.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-ink-4 uppercase">
              {t('meeting_attendees', { n: people.length })}
            </p>
            <ul className="mt-2 max-h-[30dvh] space-y-1.5 overflow-y-auto">
              {people.map((p) => (
                <li key={p.email || p.name} className="flex items-center gap-2.5 text-[14px]">
                  <ResponseMark response={p.response} />
                  <span className={cn('min-w-0 flex-1 truncate', p.response === 'declined' ? 'text-ink-4 line-through' : 'text-ink-2')}>
                    {nameOf(p)}
                    {p.optional && <span className="text-ink-4"> · {t('meeting_optional')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <SheetDivider />

      {!answerable(m) ? (
        // Stored by an older build without the ids an answer needs.
        <p className="px-6 py-4 text-[14px] text-ink-3">{t('meeting_refresh')}</p>
      ) : m.isOrganizer ? (
        <SheetAction icon={CalendarX} label={t('meeting_cancel')} tone="danger" onClick={() => void answer('cancel')} />
      ) : (
        <>
          <SheetAction icon={XCircle} label={t('meeting_decline')} tone="danger" onClick={() => void answer('decline')} />
          {m.organizerEmail && (
            <SheetAction icon={Mail} label={t('meeting_write')} detail={organizer} onClick={write} />
          )}
        </>
      )}
      {/* Everyone at once: the organiser and every attendee still coming. */}
      {everyone.length > 1 && <SheetAction icon={Users} label={t('meeting_write_all')} onClick={writeAll} />}
    </Sheet>
  );
}

/** What an attendee said, as a small round mark: yes, maybe, not yet, no. */
function ResponseMark({ response }: { response: Attendee['response'] }) {
  const look = {
    accepted: { Icon: Check, cls: 'bg-accent-soft text-accent', label: t('meeting_accepted') },
    tentative: { Icon: CircleHelp, cls: 'bg-wash-strong text-ink-3', label: t('meeting_tentative') },
    none: { Icon: Clock, cls: 'bg-wash-strong text-ink-4', label: t('meeting_no_answer') },
    declined: { Icon: X, cls: 'bg-ember-soft text-ember', label: t('meeting_declined_by') },
  }[response];
  return (
    <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', look.cls)} role="img" aria-label={look.label}>
      <look.Icon className="size-3" strokeWidth={2.6} />
    </span>
  );
}
