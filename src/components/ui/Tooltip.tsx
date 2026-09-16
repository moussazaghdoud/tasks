import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  type Placement,
} from '@floating-ui/react';
import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode, type Ref } from 'react';
import { Kbd } from './Kbd';

interface TooltipProps {
  label: ReactNode;
  shortcut?: string;
  placement?: Placement;
  children: ReactElement<Record<string, unknown> & { ref?: Ref<HTMLElement> }>;
}

/** Quiet tooltip with an optional shortcut hint — the main way shortcuts are taught. */
export function Tooltip({ label, shortcut, placement = 'top', children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  const hover = useHover(context, { delay: { open: 450, close: 0 }, move: false, mouseOnly: true });
  const focus = useFocus(context, { visibleOnly: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const childRef = isValidElement(children) ? (children.props as { ref?: Ref<HTMLElement> }).ref : undefined;
  const ref = useMergeRefs([refs.setReference, childRef]);

  if (!isValidElement(children)) return children;
  return (
    <>
      {cloneElement(children, { ref, ...getReferenceProps(children.props) })}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="pointer-events-none z-[80] flex animate-fade items-center gap-2 rounded-[6px] bg-ink px-2 py-1 text-[12px] leading-4 font-medium text-paper shadow-pop"
          >
            {label}
            {shortcut && <Kbd combo={shortcut} className="[&_kbd]:bg-white/15 [&_kbd]:text-paper [&_kbd]:shadow-none" />}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
