import { Check } from 'lucide-react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { LANGUAGES, setLang, t, useLang } from './i18n';
import { Sheet } from './Sheet';

/**
 * Settings, which for now means one decision.
 *
 * Laid out as a named section rather than a bare list so the next setting can
 * arrive without the sheet being redesigned around it.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang();

  return (
    <Sheet open={open} onClose={onClose} label={t('settings')}>
      <h2 className="px-6 pt-1 pb-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">{t('settings')}</h2>

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('language')}</p>

      <div className="border-t border-line">
        {LANGUAGES.map((option) => {
          const on = option.id === lang;
          return (
            <button
              key={option.id}
              onClick={() => {
                if (!on) {
                  haptic('medium');
                  setLang(option.id);
                }
              }}
              aria-pressed={on}
              className="flex h-[58px] w-full items-center gap-4 px-6 text-left transition-colors active:bg-wash-strong"
            >
              <span className={cn('flex-1 text-[17px]', on ? 'font-medium text-ink' : 'text-ink-2')}>{option.native}</span>
              {on && <Check className="size-[19px] shrink-0 text-accent" strokeWidth={2.4} />}
            </button>
          );
        })}
      </div>

      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">{t('language_note')}</p>
    </Sheet>
  );
}
