import { FloatingOverlay, FloatingPortal } from '@floating-ui/react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { t } from './i18n';

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
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
  /** Shown in a bar with a Done button — for a sheet you read, not one you pick from. */
  title?: string;
}) {
  const [dy, setDy] = useState(0);
  const [keyboard, setKeyboard] = useState(0);
  const dragging = useRef(false);
  const start = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDy(0);
      haptic('light');
    }
  }, [open]);

  /**
   * Lift the sheet clear of the on-screen keyboard.
   *
   * In the native app the web view itself shrinks, so this measures zero and
   * costs nothing. In a browser or an installed PWA nothing resizes, and
   * without this the field you opened the keyboard to type into sits behind
   * it — which is exactly the bug this fixes.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const update = () => setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKeyboard(0);
    };
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
            paddingBottom: keyboard ? keyboard + 14 : undefined,
          }}
          // Never taller than most of the screen: a sheet that reaches the
          // status bar has swallowed the screen, and the way out goes with it.
          className="flex max-h-[86dvh] animate-sheet-up flex-col rounded-t-[28px] border-t border-line bg-raised pb-[max(14px,env(safe-area-inset-bottom))] font-display shadow-float"
          // A drag starting anywhere on the sheet closes it, as long as the
          // content is scrolled to the top — the same rule iOS uses, so a
          // sheet that is scrolled down scrolls rather than closing.
          onTouchStart={(e) => {
            const target = e.target as HTMLElement;
            const grip = !!target.closest('[data-sheet-grip]');
            // A drag across a text field is someone selecting words, not
            // throwing the sheet away.
            const field = !!target.closest('input, textarea, [contenteditable="true"]');
            dragging.current = grip || (!field && (scroller.current?.scrollTop ?? 0) <= 0);
            start.current = e.touches[0].clientY;
          }}
          onTouchMove={(e) => dragging.current && setDy(Math.max(0, e.touches[0].clientY - start.current))}
          onTouchEnd={() => {
            dragging.current = false;
            if (dy > 100) onClose();
            else setDy(0);
          }}
        >
          {/* The grab area is the whole top strip, not just the bar you can see. */}
          <div data-sheet-grip className="flex h-8 shrink-0 touch-none items-center justify-center">
            <span className="h-[5px] w-10 rounded-full bg-line-strong" />
          </div>

          {/* Title left, Done right: the bar every iOS sheet you read has, and
              the one control that is always reachable however long the
              content gets. */}
          {title && (
            <div className="flex shrink-0 items-center gap-3 px-6 pt-1 pb-3">
              <h2 className="min-w-0 flex-1 truncate text-[21px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
              <button
                onClick={onClose}
                className="-mr-2 h-11 shrink-0 px-2 text-[17px] font-semibold text-accent active:opacity-60"
              >
                {t('done_sheet')}
              </button>
            </div>
          )}

          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {children}
          </div>
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
