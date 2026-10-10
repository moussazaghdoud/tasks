import { describe, expect, it } from 'vitest';
import { createTask } from '@/domain/factories';
import { FREE_OPEN_LIMIT, mayCapture, maySend, openCount } from './limits';

describe('what free holds back', () => {
  it('counts only open thoughts', () => {
    const tasks = [
      createTask({ title: 'open' }),
      createTask({ title: 'done', status: 'done' }),
      createTask({ title: 'archived', archivedAt: '2026-10-01T00:00:00Z' }),
      createTask({ title: 'also open' }),
    ];
    expect(openCount(tasks)).toBe(2);
  });

  it('lets a capture start below the limit, and Pro always', () => {
    expect(mayCapture(false, FREE_OPEN_LIMIT - 1)).toBe(true);
    expect(mayCapture(false, FREE_OPEN_LIMIT)).toBe(false);
    expect(mayCapture(true, 500)).toBe(true);
  });

  it('sends to one person at a time on free, never to a team', () => {
    expect(maySend(false, 1, false)).toBe(true);
    expect(maySend(false, 2, false)).toBe(false);
    expect(maySend(false, 1, true)).toBe(false);
    expect(maySend(true, 12, true)).toBe(true);
  });
});
