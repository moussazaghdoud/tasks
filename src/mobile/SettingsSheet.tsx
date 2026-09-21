import { Check, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { LANGUAGES, setLang, t, useLang } from './i18n';
import { Sheet } from './Sheet';
import { setTheme, useTheme, type Theme } from './theme';

const THEMES: Array<{ id: Theme; icon: typeof Sun; label: 'theme_dark' | 'theme_light' }> = [
  { id: 'dark', icon: Moon, label: 'theme_dark' },
  { id: 'light', icon: Sun, label: 'theme_light' },
];

/**
 * Settings.
 *
 * Grouped into named sections rather than one flat list, so the next setting
 * arrives without the sheet being redesigned around it.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang();
  const theme = useTheme();

  return (
    <Sheet open={open} onClose={onClose} label={t('settings')}>
      <h2 className="px-6 pt-1 pb-4 text-[21px] font-semibold tracking-[-0.02em] text-ink">{t('settings')}</h2>

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('appearance')}</p>

      {/* Two halves of one control, so the choice reads at a glance rather
          than as a list you have to compare. */}
      <div className="mx-6 mb-5 flex h-11 rounded-full border border-line bg-sunk p-[3px]">
        {THEMES.map(({ id, icon: Icon, label }) => {
          const on = id === theme;
          return (
            <button
              key={id}
              onClick={() => {
                if (on) return;
                haptic('light');
                setTheme(id);
              }}
              aria-pressed={on}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-full text-[14px] transition-colors',
                on ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent/25' : 'font-medium text-ink-3',
              )}
            >
              <Icon className="size-[17px]" strokeWidth={1.9} />
              {t(label)}
            </button>
          );
        })}
      </div>

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
