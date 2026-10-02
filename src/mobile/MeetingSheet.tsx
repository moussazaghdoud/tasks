import { CalendarX, Mail, XCircle } from 'lucide-react';
import { confirmAction, haptic } from '@/lib/native/bridge';
import { toast } from '@/store/toast';
import { answerable, respondToMeeting, type Meeting, type MeetingAction } from './calendar';
import { dayTimeIn, localeOf, t } from './i18n';
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
  const clock = (iso: string) => new Date(iso).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' });

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
    </Sheet>
  );
}
