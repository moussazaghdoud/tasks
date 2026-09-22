import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeMemo } from './analyze';

/**
 * The promise the consent sheet makes: decline, and the note never leaves the
 * phone. Proven by failing the test if anything so much as attempts a request,
 * rather than by trusting that the branch was taken.
 */
describe('analyzeMemo without permission to use Claude', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the note on the device and makes no network request', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('a declined note tried to leave the device');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await analyzeMemo('call Thierry tomorrow about the partner terms', 'en-US', { cloud: false });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
    expect(result.tasks.length).toBeGreaterThan(0);
  });

  it('still keeps the words: declining is not a reason to lose the note', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const result = await analyzeMemo('Book India travel', 'en-US', { cloud: false });
    expect(result.tasks[0]?.title.toLowerCase()).toContain('india');
  });
});
