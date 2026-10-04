import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { haptic } from '@/lib/native/bridge';

/**
 * Hold a thought, then move it up or down the list.
 *
 * A long press — not a handle — because the row already answers a tap (open
 * it) and a sideways swipe (done, delete); holding still is the one gesture
 * left, and it is the one iOS lists have taught. Movement before the press
 * completes is a scroll or a swipe, and the press is forgotten.
 *
 * Native listeners on the list, not React's: React's touch listeners are
 * passive, and only a non-passive one can stop the page from scrolling under
 * the finger while a thought is being carried.
 *
 * Thoughts move within their group only — `group` gives each one's — so the
 * important ones stay above the rest.
 */

const HOLD_MS = 380;
const SLOP = 8;
/** The space between rows (mb-2 on the row). */
const GAP = 8;
/** How close to the top or bottom edge the list starts scrolling by itself. */
const EDGE = 72;
/** The capture bar covers the foot of the list; scrolling down starts above it. */
const FOOT = 170;

interface Drag {
  id: string;
  from: number;
  to: number;
  dy: number;
  height: number;
}

export function useReorder({
  ids,
  group,
  onDrop,
}: {
  ids: string[];
  /** Thoughts move only among those with the same group. */
  group: (id: string) => number;
  /** Where it was let go: between `prevId` and `nextId` (either may be absent). */
  onDrop: (id: string, prevId: string | null, nextId: string | null) => void;
}) {
  // A callback ref, so the gesture is wired whenever the list appears — it is
  // not on screen in the agenda, or when there is nothing in it.
  const [list, listRef] = useState<HTMLUListElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  // The listeners are attached once; they read the latest props from here.
  const latest = useRef({ ids, group, onDrop });
  latest.current = { ids, group, onDrop };

  useEffect(() => {
    if (!list) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let candidate: { id: string; index: number; x: number; y: number } | null = null;
    let active: { id: string; from: number; mids: number[]; height: number; scroller: HTMLElement | null; startScroll: number; startY: number; lastY: number; lo: number; hi: number; to: number } | null = null;
    let frame = 0;

    const rows = () => Array.from(list.querySelectorAll<HTMLLIElement>(':scope > li[data-id]'));

    const update = () => {
      if (!active) return;
      const scrolled = (active.scroller?.scrollTop ?? 0) - active.startScroll;
      const dy = active.lastY - active.startY + scrolled;
      // Where the carried row's middle is now, in the coordinates the rows were measured in.
      const centre = active.mids[active.from] + dy;
      let to = active.from;
      active.mids.forEach((mid, i) => {
        if (i < active!.from && centre < mid) to = Math.min(to, i);
        if (i > active!.from && centre > mid) to = Math.max(to, i);
      });
      to = Math.max(active.lo, Math.min(active.hi, to));
      if (to !== active.to) haptic('light');
      active.to = to;
      setDrag({ id: active.id, from: active.from, to, dy, height: active.height });
    };

    // Near an edge, the list scrolls itself so a thought can travel the whole way.
    const tick = () => {
      if (!active) return;
      const box = active.scroller?.getBoundingClientRect();
      if (box && active.scroller) {
        if (active.lastY < box.top + EDGE) active.scroller.scrollTop -= 8;
        else if (active.lastY > box.bottom - FOOT) active.scroller.scrollTop += 8;
        update();
      }
      frame = requestAnimationFrame(tick);
    };

    const begin = () => {
      if (!candidate) return;
      const { ids: order, group: groupOf } = latest.current;
      const from = order.indexOf(candidate.id);
      if (from < 0) return;
      const boxes = rows().map((row) => row.getBoundingClientRect());
      if (boxes.length !== order.length) return;
      const mine = groupOf(candidate.id);
      const same = order.map((id, i) => (groupOf(id) === mine ? i : -1)).filter((i) => i >= 0);
      const scroller = list.closest('main');
      active = {
        id: candidate.id,
        from,
        mids: boxes.map((b) => b.top + b.height / 2),
        height: boxes[from].height + GAP,
        scroller,
        startScroll: scroller?.scrollTop ?? 0,
        startY: candidate.y,
        lastY: candidate.y,
        lo: same[0],
        hi: same[same.length - 1],
        to: from,
      };
      haptic('medium');
      setDrag({ id: active.id, from, to: from, dy: 0, height: active.height });
      frame = requestAnimationFrame(tick);
    };

    const cancelHold = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      candidate = null;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || active) return;
      const row = (e.target as Element | null)?.closest('li[data-id]');
      if (!row || row.parentElement !== list) return;
      const touch = e.touches[0];
      candidate = { id: row.getAttribute('data-id')!, index: 0, x: touch.clientX, y: touch.clientY };
      timer = setTimeout(begin, HOLD_MS);
    };

    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!active) {
        // Moving before the hold completes is a scroll or a swipe.
        if (candidate && Math.hypot(touch.clientX - candidate.x, touch.clientY - candidate.y) > SLOP) cancelHold();
        return;
      }
      e.preventDefault();
      active.lastY = touch.clientY;
      update();
    };

    const onEnd = () => {
      cancelHold();
      if (!active) return;
      cancelAnimationFrame(frame);
      const { id, from, to } = active;
      active = null;
      setDrag(null);
      // The finger lifting would also be read as a tap that opens the thought.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 450);
      if (to === from) return;
      const order = latest.current.ids.filter((x) => x !== id);
      order.splice(to, 0, id);
      haptic('success');
      latest.current.onDrop(id, order[to - 1] ?? null, order[to + 1] ?? null);
    };

    list.addEventListener('touchstart', onStart, { passive: true });
    list.addEventListener('touchmove', onMove, { passive: false });
    list.addEventListener('touchend', onEnd);
    list.addEventListener('touchcancel', onEnd);
    return () => {
      cancelHold();
      cancelAnimationFrame(frame);
      list.removeEventListener('touchstart', onStart);
      list.removeEventListener('touchmove', onMove);
      list.removeEventListener('touchend', onEnd);
      list.removeEventListener('touchcancel', onEnd);
    };
  }, [list]);

  /** Each row's place while a thought is carried: the carried one under the finger, the others making room. */
  const styleFor = (id: string, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (id === drag.id) {
      return {
        position: 'relative',
        zIndex: 30,
        transform: `translateY(${drag.dy}px) scale(1.03)`,
        filter: 'drop-shadow(0 14px 22px rgb(0 0 0 / 0.22))',
        transition: 'transform 0s, filter 180ms',
      };
    }
    let shift = 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) shift = -drag.height;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) shift = drag.height;
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: 'transform 180ms var(--ease-out)' };
  };

  return { listRef, dragging: drag?.id ?? null, styleFor };
}
