import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { t } from './i18n';
import { setView, type View } from './space';

const TAB_IDS: View[] = ['agenda', 'business', 'private'];

/**
 * The three things the list can be showing.
 *
 * A sliding indicator rather than three separately coloured buttons: one
 * object moves, so the control reads as a single switch and the eye follows
 * the movement instead of comparing colours. The active third is tinted
 * rather than filled with the accent — on this screen the microphone is the
 * one thing allowed to glow.
 *
 * The agenda comes first because what is already committed shapes what else
 * the day can hold.
 */
export function SpaceTabs({ active }: { active: View }) {
  const index = TAB_IDS.indexOf(active);

  return (
    <div role="tablist" aria-label={t('a11y_views')} className="relative flex h-11 rounded-full border border-line bg-sunk p-[3px]">
      {/* The moving third. Width is a third of the track, less the padding. */}
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-accent-soft ring-1 ring-accent/25 transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ width: 'calc(33.333% - 2px)', transform: `translateX(${index * 100}%)` }}
      />
      {TAB_IDS.map((id) => {
        const on = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => {
              if (on) return;
              haptic('light');
              setView(id);
            }}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center rounded-full text-[13.5px] transition-colors duration-200',
              on ? 'font-semibold text-accent' : 'font-medium text-ink-3',
            )}
          >
            {t(id)}
          </button>
        );
      })}
    </div>
  );
}
