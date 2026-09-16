import { FloatingFocusManager, FloatingOverlay, FloatingPortal, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/platform';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  align?: 'top' | 'center';
  /** Esc is handled by the child (e.g. palette steps back before closing). */
  escapeKey?: boolean;
}

export function Modal({ open, onClose, children, label, className, align = 'center', escapeKey = true }: ModalProps) {
  const { refs, context } = useFloating({ open, onOpenChange: (o) => !o && onClose() });
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown', escapeKey });
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);
  if (!open) return null;
  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className={cn(
          'z-[70] flex animate-fade justify-center bg-[rgb(40_36_30/0.18)] px-4 backdrop-blur-[1.5px]',
          align === 'top' ? 'items-start pt-[12vh] max-sm:pt-3' : 'items-center',
        )}
      >
        <FloatingFocusManager context={context} initialFocus={-1}>
          <div
            ref={refs.setFloating}
            aria-label={label}
            {...getFloatingProps()}
            className={cn('w-full animate-pop rounded-sheet bg-raised shadow-float outline-none', className)}
          >
            {children}
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
