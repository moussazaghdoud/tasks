import { FloatingOverlay, FloatingPortal } from '@floating-ui/react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';

/**
 * A bottom sheet that behaves like one: it rises from the edge, you can throw
 * it back down with your thumb, and it sits above the home indicator rather
 * than under it.
 *
 * Everything secondary in the app lives in one of these, which is what keeps
 * the list itself free of controls.
 */
export function Sheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const [dy, setDy] = useState(0);
  const dragging = useRef(false);
  const start = useRef(0);

  useEffect(() => {
    if (open) {
      setDy(0);
      haptic('light');
    }
  }, [open]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className="z-[70] flex animate-fade flex-col justify-end bg-[rgb(24_22_19/0.3)]"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onClick={(e) => e.stopPropagation()}
          style={{
            transform: dy ? `translateY(${dy}px)` : undefined,
            transition: dragging.current ? 'none' : 'transform 240ms var(--ease-out)',
          }}
          className="animate-sheet-up rounded-t-[28px] border-t border-line bg-raised pb-[max(14px,env(safe-area-inset-bottom))] font-display shadow-float"
        >
          {/* The grab area is the whole top strip, not just the bar you can see. */}
          <div
            className="flex h-8 touch-none items-center justify-center"
            onTouchStart={(e) => {
              dragging.current = true;
              start.current = e.touches[0].clientY;
            }}
            onTouchMove={(e) => dragging.current && setDy(Math.max(0, e.touches[0].clientY - start.current))}
            onTouchEnd={() => {
              dragging.current = false;
              if (dy > 100) onClose();
              else setDy(0);
            }}
          >
            <span className="h-[5px] w-10 rounded-full bg-line-strong" />
          </div>
          {children}
        </div>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

/** A row in a sheet. Big enough to hit without looking. */
export function SheetAction({
  icon: Icon,
  label,
  onClick,
  tone,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: 'accent' | 'danger';
  detail?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[58px] w-full items-center gap-4 px-6 text-left text-[17px] transition-colors active:bg-wash-strong',
        tone === 'danger' ? 'text-ember' : tone === 'accent' ? 'text-accent' : 'text-ink',
      )}
    >
      <Icon className={cn('size-[21px] shrink-0', !tone && 'text-ink-3')} strokeWidth={1.8} />
      <span className="flex-1 truncate">{label}</span>
      {detail && <span className="shrink-0 text-[15px] text-ink-4">{detail}</span>}
    </button>
  );
}

export const SheetDivider = () => <div className="mx-6 my-1 h-px bg-line" />;
