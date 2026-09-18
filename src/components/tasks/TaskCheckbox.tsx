import { cn } from '@/lib/platform';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  label: string;
  muted?: boolean;
  className?: string;
  /** Enlarge the tap area on phones without redrawing the circle any larger. */
  touch?: boolean;
}

/** The square you can hit, per drawn size. The circle itself never changes. */
const HIT: Record<number, string> = {
  15: 'size-[23px]',
  18: 'size-[26px]',
  20: 'size-[28px]',
};

/** Circle that draws its check. The only color it ever takes is the accent. */
export function TaskCheckbox({ checked, onToggle, size = 18, label, muted, className, touch }: TaskCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Reopen “${label}”` : `Complete “${label}”`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={cn(
        'group/check relative grid shrink-0 place-items-center rounded-full outline-offset-1',
        HIT[size] ?? 'size-[26px]',
        // Full height, but not full width: a 44px-wide target would take the
        // space the title needs, and in a list it is the vertical span you miss.
        touch && 'max-md:h-11 max-md:w-9',
        className,
      )}
    >
      <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden className="overflow-visible">
        <circle
          cx="9"
          cy="9"
          r="8"
          className={cn(
            'transition-[fill,stroke] duration-150',
            checked
              ? 'fill-accent stroke-accent'
              : cn('fill-transparent group-hover/check:stroke-accent', muted ? 'stroke-ink-4/70' : 'stroke-ink-4'),
          )}
          strokeWidth="1.5"
        />
        <path
          d="M5.4 9.3 L7.9 11.7 L12.6 6.6"
          fill="none"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className={cn(
            'transition-[stroke-dashoffset,opacity] duration-200 ease-out',
            checked
              ? 'stroke-white opacity-100 [stroke-dashoffset:0]'
              : 'stroke-accent opacity-0 [stroke-dashoffset:1] group-hover/check:opacity-60 group-hover/check:[stroke-dashoffset:0]',
          )}
          style={{ strokeDasharray: 1 }}
        />
      </svg>
    </button>
  );
}
