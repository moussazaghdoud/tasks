import { Bell, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToasts, type Toast } from '@/store/toast';
import { cn } from '@/lib/platform';

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const started = useRef(Date.now());

  useEffect(() => {
    if (t.tone === 'reminder' || paused) return;
    started.current = Date.now();
    const timer = setTimeout(() => dismiss(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, t.id, t.tone, dismiss]);

  const run = (fn: () => void) => {
    fn();
    dismiss(t.id);
  };

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex max-w-[min(92vw,460px)] animate-toast items-center gap-3 rounded-[10px] py-2 pr-2 pl-3.5 text-ui shadow-float',
        t.tone === 'reminder' ? 'bg-raised text-ink' : 'bg-[#26241f] text-[#f4f1ea]',
      )}
    >
      {t.tone === 'reminder' && <Bell className="size-4 shrink-0 text-accent" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{t.message}</p>
        {t.detail && <p className={cn('truncate text-meta', t.tone === 'reminder' ? 'text-ink-3' : 'text-white/55')}>{t.detail}</p>}
      </div>
      {t.secondary && (
        <button
          onClick={() => run(t.secondary!.run)}
          className={cn(
            'shrink-0 rounded-[6px] px-2 py-1 font-medium transition-colors',
            t.tone === 'reminder' ? 'text-ink-2 hover:bg-wash-strong' : 'text-white/70 hover:bg-white/10 hover:text-white',
          )}
        >
          {t.secondary.label}
        </button>
      )}
      {t.action && (
        <button
          onClick={() => run(t.action!.run)}
          className={cn(
            'shrink-0 rounded-[6px] px-2 py-1 font-medium transition-colors',
            t.tone === 'reminder' ? 'text-accent hover:bg-accent-soft' : 'text-[#9fd3cf] hover:bg-white/10',
          )}
        >
          {t.action.label}
        </button>
      )}
      <button
        aria-label="Dismiss"
        onClick={() => dismiss(t.id)}
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-[6px] transition-colors',
          t.tone === 'reminder' ? 'text-ink-3 hover:bg-wash-strong' : 'text-white/40 hover:bg-white/10 hover:text-white/80',
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[104px] z-[90] flex flex-col items-center gap-2 px-4 max-md:bottom-[calc(76px+env(safe-area-inset-bottom))]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
