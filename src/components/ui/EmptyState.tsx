import type { ReactNode } from 'react';
import { cn } from '@/lib/platform';

/** Calm, typographic empty state. No illustrations, no exclamation marks. */
export function EmptyState({
  title,
  children,
  action,
  className,
  compact,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex animate-fade flex-col items-start', compact ? 'py-6' : 'py-14', className)}>
      <div className="mb-4 h-px w-10 bg-line-strong" aria-hidden />
      <p className={cn('font-serif text-ink-2', compact ? 'text-[20px] leading-7' : 'text-[26px] leading-8')}>{title}</p>
      {children && <div className="mt-2 max-w-[420px] text-ui text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
