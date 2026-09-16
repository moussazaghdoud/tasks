import { cn, keyLabel } from '@/lib/platform';

export function Kbd({ combo, className, subtle }: { combo: string; className?: string; subtle?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keyLabel(combo).map((k, i) => (
        <kbd
          key={i}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] px-1 font-sans text-[10.5px] font-medium leading-none',
            subtle ? 'text-ink-3' : 'bg-wash-strong text-ink-2 shadow-[inset_0_-1px_0_rgb(29_28_26/0.08)]',
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
