import { describe, expect, it } from 'vitest';

/**
 * What the agenda counts as still ahead of you. Getting this wrong quietly
 * shows a meeting that finished an hour ago, or hides one you are in.
 */
describe('stillAhead', () => {
  const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  it('drops what has finished and keeps what is running', async () => {
    const { stillAhead } = await import('./calendar');
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const meetings = [
      { subject: 'over', start: at(9), end: at(10), allDay: false, showAs: 'busy' },
      { subject: 'running', start: at(11, 30), end: at(12, 30), allDay: false, showAs: 'busy' },
      { subject: 'later', start: at(15), end: at(16), allDay: false, showAs: 'busy' },
    ];
    expect(stillAhead(meetings, now.getTime()).map((m) => m.subject)).toEqual(['running', 'later']);
  });

  it('keeps an all-day item for the whole of its day', async () => {
    const { stillAhead } = await import('./calendar');
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    const meetings = [{ subject: 'off', start: at(0), end: at(0), allDay: true, showAs: 'busy' }];
    expect(stillAhead(meetings, now.getTime())).toHaveLength(1);
  });
});

