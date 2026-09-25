import { useRef, useState } from 'react';
import { haptic } from '@/lib/native/bridge';

/** How far to pull before letting go does anything. */
const THRESHOLD = 76;
/** How much of the row stays pulled aside, showing what is behind it. */
export const ACTION_WIDTH = 92;

/**
 * Horizontal swipe for touch rows.
 *
 * Right is a throw: past the threshold the row acts as you let go, because
 * completing something is what you came to do and one tap undoes it.
 *
 * Left is a reveal: the row slides aside and stays there, showing the button
 * behind it, which then has to be pressed. Deleting deserves the second,
 * deliberate move — and it is the gesture every iOS list has already taught.
 *
 * Vertical scrolling wins as soon as the gesture looks vertical.
 */
export function useSwipe({
  onRight,
  onLeft,
  enabled,
}: {
  onRight: () => void;
  /**
   * Given one, left becomes a throw too and calls it — which is what the
   * desktop row wants, where a swipe opens the actions menu and there is no
   * thumb waiting to press a second button.
   */
  onLeft?: () => void;
  enabled: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; y: number; from: number; locked: 'h' | 'v' | null } | null>(null);

  const close = () => {
    setOpen(false);
    setDx(0);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, from: open ? -ACTION_WIDTH : 0, locked: null };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current;
    if (!s) return;
    const t = e.touches[0];
    const x = t.clientX - s.x;
    const y = t.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(x) > 8 && Math.abs(x) > Math.abs(y) * 1.4) s.locked = 'h';
      else if (Math.abs(y) > 8) s.locked = 'v';
    }
    if (s.locked === 'h') {
      // An open row can only be pulled back towards closed; a closed one can
      // go either way.
      const next = Math.max(-140, Math.min(open ? 0 : 140, s.from + x));
      // A tick when the swipe passes the point where releasing would act.
      if (Math.abs(next) > THRESHOLD !== Math.abs(dx) > THRESHOLD) haptic('light');
      setDx(next);
    }
  };

  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.locked !== 'h') return;

    if (open) {
      // Pulled most of the way back, let it close; otherwise it stays open.
      if (dx > -ACTION_WIDTH / 2) close();
      else setDx(-ACTION_WIDTH);
      return;
    }
    if (dx > THRESHOLD) {
      onRight();
      setDx(0);
      return;
    }
    if (dx < -THRESHOLD) {
      if (onLeft) onLeft();
      else {
        setOpen(true);
        setDx(-ACTION_WIDTH);
        return;
      }
    }
    setDx(0);
  };

  return {
    dx,
    open,
    close,
    armed: Math.abs(dx) > THRESHOLD,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}
