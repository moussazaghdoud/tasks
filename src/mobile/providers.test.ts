import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Which calendars a build offers, and what happens when two are connected.
 *
 * The failure this guards against is quiet: a provider with no identifiers
 * offered anyway, so someone taps Google and meets an error, or one calendar
 * failing taking the other's meetings down with it.
 */
async function load(env: Record<string, string>) {
  // Clear first: a variable left over from the previous load would offer a
  // calendar this build was never given.
  vi.unstubAllEnvs();
  vi.resetModules();
  // A calendar is only offered in the native app; tests run as the web build,
  // where `isNative()` is false, so the platform is stubbed rather than faked
  // around.
  vi.doMock('@/lib/native/platform', () => ({ isNative: () => true, apiBase: () => '' }));
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./calendar');
}

const MICROSOFT = { VITE_M365_CLIENT_ID: 'public-client', VITE_M365_TENANT_ID: 'common' };
const GOOGLE = { VITE_GOOGLE_CLIENT_ID: '123-abc.apps.googleusercontent.com' };

describe('providers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/native/platform');
  });

  it('offers only the calendars this build has identifiers for', async () => {
    const both = await load({ ...MICROSOFT, ...GOOGLE });
    expect(both.providers().map((p) => p.id)).toEqual(['microsoft', 'google']);

    const onlyOutlook = await load(MICROSOFT);
    expect(onlyOutlook.providers().map((p) => p.id)).toEqual(['microsoft']);

    const none = await load({});
    expect(none.providers()).toEqual([]);
    expect(none.calendarConfigured()).toBe(false);
  });

  it('asks Microsoft for an address and Google for none', async () => {
    const { providers } = await load({ ...MICROSOFT, ...GOOGLE });
    expect(providers().find((p) => p.id === 'microsoft')?.asksEmail).toBe(true);
    expect(providers().find((p) => p.id === 'google')?.asksEmail).toBe(false);
  });

  it('starts with nothing connected and nothing yet asked', async () => {
    const { anyConnected, allChecked } = await load({ ...MICROSOFT, ...GOOGLE });
    expect(anyConnected()).toBe(false);
    // Nothing has been asked of the phone yet, so the agenda must not
    // conclude that a connected person is disconnected.
    expect(allChecked()).toBe(false);
  });

  it('refuses to read an agenda with no calendar connected', async () => {
    const { listAgenda } = await load({ ...MICROSOFT, ...GOOGLE });
    await expect(listAgenda(7)).rejects.toMatchObject({ code: 'not_connected' });
  });
});
