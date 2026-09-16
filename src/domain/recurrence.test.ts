import { describe, expect, it } from 'vitest';
import { nextOccurrence, recurrenceLabel } from './recurrence';

describe('nextOccurrence', () => {
  it('advances by the rule', () => {
    expect(nextOccurrence({ freq: 'daily', interval: 1 }, '2026-09-14')).toBe('2026-09-15');
    expect(nextOccurrence({ freq: 'weekly', interval: 2 }, '2026-09-14')).toBe('2026-09-28');
    expect(nextOccurrence({ freq: 'monthly', interval: 1 }, '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence({ freq: 'yearly', interval: 1 }, '2026-09-14')).toBe('2027-09-14');
  });

  it('skips weekends for weekdays', () => {
    // Friday 18 September 2026 → Monday 21
    expect(nextOccurrence({ freq: 'weekdays', interval: 1 }, '2026-09-18')).toBe('2026-09-21');
  });
});

describe('recurrenceLabel', () => {
  it('reads naturally', () => {
    expect(recurrenceLabel({ freq: 'weekly', interval: 1 }, '2026-09-17')).toBe('Every Thursday');
    expect(recurrenceLabel({ freq: 'daily', interval: 3 })).toBe('Every 3 days');
  });
});
