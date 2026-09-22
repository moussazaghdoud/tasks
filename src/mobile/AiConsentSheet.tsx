import { Sparkles } from 'lucide-react';
import { t } from './i18n';
import { Sheet } from './Sheet';

/**
 * Asking before a note leaves the phone.
 *
 * Shown once, at the first capture, with both answers equally easy — the
 * point is a real choice, not a speed bump in front of "Allow". Declining
 * still captures the note; it is simply read on the device instead, the same
 * as when there is no connection.
 */
export function AiConsentSheet({
  open,
  onChoose,
}: {
  open: boolean;
  /** `null` when the sheet was dismissed without an answer. */
  onChoose: (allow: boolean | null) => void;
}) {
  return (
    // Dismissing without choosing counts as "not this time": the note is
    // kept on the device and the question comes back next time.
    <Sheet open={open} onClose={() => onChoose(null)} label={t('ai_title')}>
      <div className="px-6 pb-2">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles className="size-[22px]" strokeWidth={1.8} />
        </span>
        <h2 className="mt-4 text-[21px] leading-7 font-semibold tracking-[-0.02em] text-ink">{t('ai_title')}</h2>
        <p className="mt-2.5 text-[15px] leading-[22px] text-ink-2">{t('ai_body')}</p>
        <p className="mt-2.5 text-[13px] leading-[19px] text-ink-3">{t('ai_detail')}</p>

        <button
          onClick={() => onChoose(true)}
          className="mt-6 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-on-accent transition-transform active:scale-[0.985]"
        >
          {t('ai_allow')}
        </button>
        <button
          onClick={() => onChoose(false)}
          className="mt-2 h-14 w-full rounded-[18px] border border-line text-[16px] font-medium text-ink transition-colors active:bg-wash-strong"
        >
          {t('ai_decline')}
        </button>
        <p className="mt-3 text-center text-[12.5px] text-ink-4">{t('ai_change_later')}</p>
      </div>
    </Sheet>
  );
}
