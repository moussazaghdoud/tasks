import { describe, expect, it } from 'vitest';
import { ASK_AT, shouldAsk } from './review';

describe('when to ask for a rating', () => {
  it('asks at the 5th, 25th and 75th finished thought', () => {
    expect(ASK_AT).toEqual([5, 25, 75]);
    expect(shouldAsk(5, [])).toBe(true);
    expect(shouldAsk(25, [5])).toBe(true);
    expect(shouldAsk(75, [5, 25])).toBe(true);
  });

  it('never at the first thoughts, or in between', () => {
    for (const n of [1, 2, 3, 4, 6, 24, 26, 100]) expect(shouldAsk(n, [])).toBe(false);
  });

  it('never twice at the same moment', () => {
    expect(shouldAsk(5, [5])).toBe(false);
  });
});
