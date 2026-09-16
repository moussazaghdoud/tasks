import { useEffect, type ReactNode } from 'react';
import type { ID } from '@/domain/types';
import { cn } from '@/lib/platform';
import { useUi } from '@/store/ui';

export function ViewHeader({ title, subtitle, icon, actions, className }: { title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn('mb-6 flex items-end gap-4 max-md:mb-5', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-3 font-serif text-[34px] leading-[40px] tracking-[-0.01em] text-ink max-md:text-[30px] max-md:leading-9">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <div className="mt-1 text-ui text-ink-3">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5 pb-1">{actions}</div>}
    </header>
  );
}

/** Tell the keyboard layer which rows are on screen, in order. */
export function useRegisterVisible(ids: ID[]) {
  const setVisibleIds = useUi((s) => s.setVisibleIds);
  const key = ids.join('|');
  useEffect(() => {
    setVisibleIds(key ? key.split('|') : []);
  }, [key, setVisibleIds]);
}

export function HeaderButton({ children, onClick, primary, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-ui font-medium transition-colors',
        primary ? 'bg-accent text-white hover:bg-accent-hover' : 'text-ink-2 hover:bg-wash-strong hover:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
