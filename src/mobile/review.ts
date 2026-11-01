import { log } from '@/lib/log';
import { requestReview } from '@/lib/native/bridge';

/**
 * When to ask for a rating: after something went well, never at first launch
 * and never in the middle of a capture.
 *
 * The moment is a finished thought — a promise kept. The 5th, then the 25th,
 * then the 75th: by then the person has used Hence for real, and the gaps
 * grow so it never nags. iOS has the last word on top of this (at most three
 * sheets a year), so asking too often only wastes them.
 */
export const ASK_AT = [5, 25, 75];

const KEY = 'hence.review';

interface State {
  done: number;
  asked: number[];
}

function read(): State {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '') as State;
    return { done: Number(parsed.done) || 0, asked: Array.isArray(parsed.asked) ? parsed.asked : [] };
  } catch {
    return { done: 0, asked: [] };
  }
}

/** Whether this count of finished thoughts is a moment to ask, given those already used. */
export function shouldAsk(done: number, asked: number[]): boolean {
  return ASK_AT.includes(done) && !asked.includes(done);
}

/**
 * Count a finished thought, and ask for a rating when the count reaches a
 * moment. Waits a beat, so the sheet arrives after the thought has left the
 * list rather than over it.
 */
export function thoughtFinished(): void {
  const state = read();
  state.done += 1;
  const ask = shouldAsk(state.done, state.asked);
  if (ask) state.asked.push(state.done);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* counted again next time */
  }
  if (!ask) return;
  log('app', `review asked after ${state.done} done`);
  setTimeout(() => void requestReview(), 1200);
}
