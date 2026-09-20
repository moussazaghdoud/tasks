import type { Space } from '@/domain/types';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { setSpace } from './space';

const TABS: Array<{ id: Space; label: string }> = [
  { id: 'business', label: 'Business' },
  { id: 'private', label: 'Private' },
];

/**
 * Switching between the two halves of your life.
 *
 * A sliding indicator rather than two separately coloured buttons: one object
 * moves, so the control reads as a single switch and the eye follows the
 * movement instead of comparing two colours. The active half is tinted rather
 * than filled with mint — on this screen the microphone is the one thing
 * allowed to glow, and a second bright object would fight it.
 */
export function SpaceTabs({ active, counts }: { active: Space; counts: Record<Space, number> }) {
  const index = TABS.findIndex((t) => t.id === active);

  return (
    <div
      role="tablist"
      aria-label="Space"
      className="relative flex h-11 rounded-full border border-line bg-sunk p-[3px]"
    >
      {/* The moving half. Width is half the track, less the padding either side. */}
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-accent-soft ring-1 ring-accent/25 transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ width: 'calc(50% - 3px)', transform: `translateX(${index * 100}%)` }}
      />
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={on}
            onClick={() => {
              if (on) return;
              haptic('light');
              setSpace(tab.id);
            }}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center gap-2 rounded-full text-[14px] transition-colors duration-200',
              on ? 'font-semibold text-accent' : 'font-medium text-ink-3',
            )}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span className={cn('text-[12px] font-medium tabular-nums', on ? 'text-accent/70' : 'text-ink-4')}>
                {counts[tab.id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
