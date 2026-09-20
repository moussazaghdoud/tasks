import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isOnDay } from './dates';

/**
 * Pinned to Paris on purpose. CI runs in UTC, where local time and UTC agree
 * and this bug is invisible — the failure only appears east of Greenwich, in
 * the hours just after midnight.
 */
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Paris';
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('isOnDay', () => {
  it('reads a timestamp as the day the person lived, not the UTC day', () => {
    // 00:30 in Paris is 22:30 the previous day in UTC. Taking the first ten
    // characters of the stored timestamp used to hide everything completed
    // between midnight and 02:00 from the list of what you finished today.
    const justAfterMidnight = new Date(2026, 8, 21, 0, 30);
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-09-20'); // the old, wrong answer
    expect(isOnDay(justAfterMidnight.toISOString(), '2026-09-21')).toBe(true);
    expect(isOnDay(justAfterMidnight.toISOString(), '2026-09-20')).toBe(false);
  });

  it('holds late in the evening, where the two dates agree again', () => {
    const lateEvening = new Date(2026, 8, 21, 23, 45);
    expect(isOnDay(lateEvening.toISOString(), '2026-09-21')).toBe(true);
    expect(isOnDay(lateEvening.toISOString(), '2026-09-22')).toBe(false);
  });
});
