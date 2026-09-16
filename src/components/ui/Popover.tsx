import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { useLayoutEffect, type ReactNode } from 'react';
import type { Anchor } from '@/store/ui';
import { cn } from '@/lib/platform';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** A DOM element or a fixed rectangle to position against. */
  anchor: Element | Anchor | null;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  label?: string;
  returnFocus?: boolean;
}

function virtual(a: Anchor) {
  return {
    getBoundingClientRect: () => ({
      x: a.x,
      y: a.y,
      left: a.x,
      top: a.y,
      width: a.width,
      height: a.height,
      right: a.x + a.width,
      bottom: a.y + a.height,
    }),
  };
}

/** Floating surface for pickers and menus: portal, flip/shift, Esc & outside-click dismiss. */
export function Popover({ open, onClose, anchor, placement = 'bottom-start', children, className, label, returnFocus = true }: PopoverProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (o) => !o && onClose(),
    placement,
    // Position with top/left: the entry animation owns `transform`.
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(200, availableHeight)}px`;
        },
      }),
    ],
  });

  useLayoutEffect(() => {
    if (!anchor) return;
    if (anchor instanceof Element) refs.setReference(anchor);
    else refs.setPositionReference(virtual(anchor));
  }, [anchor, refs]);

  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });
  const role = useRole(context, { role: 'dialog' });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  if (!open) return null;
  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={returnFocus}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          aria-label={label}
          {...getFloatingProps()}
          className={cn('z-[60] flex animate-pop flex-col overflow-hidden rounded-pop bg-raised shadow-pop outline-none', className)}
        >
          {children}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}
