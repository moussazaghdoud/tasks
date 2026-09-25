import { useRef, useState } from 'react';
import { haptic } from '@/lib/native/bridge';

const THRESHOLD = 76;

/**
 * Horizontal swipe for touch rows. Right → keep it (complete), left → throw it
 * away (delete). Vertical scrolling wins as soon as the gesture looks vertical.
 */
export function useSwipe({ onRight, onLeft, enabled }: { onRight: () => void; onLeft: () => void; enabled: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, locked: null };
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
      const next = Math.max(-140, Math.min(140, x));
      // A tick when the swipe passes the point where releasing would act.
      if (Math.abs(next) > THRESHOLD !== Math.abs(dx) > THRESHOLD) haptic('light');
      setDx(next);
    }
  };
  const onTouchEnd = () => {
    const s = start.current;
    start.current = null;
    if (!s || s.locked !== 'h') return;
    if (dx > THRESHOLD) onRight();
    else if (dx < -THRESHOLD) onLeft();
    setDx(0);
  };

  return { dx, armed: Math.abs(dx) > THRESHOLD, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } };
}
