import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The iCloud Keychain, as one value that outlives the app's storage. */
let keychain: string | undefined;

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    keepIdentity: async ({ value }: { value: string }) => {
      keychain = value;
    },
    readIdentity: async () => (keychain ? { value: keychain } : {}),
  }),
}));
vi.mock('@/lib/native/platform', () => ({ isNative: () => true }));

/** The app freshly installed: empty storage, modules loaded anew. */
async function install() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
  return import('./identity');
}

describe('the sharing identity across a reinstall', () => {
  beforeEach(() => {
    keychain = undefined;
  });

  it('comes back from the Keychain after the app is deleted and installed again', async () => {
    const first = await install();
    const before = await first.identity();
    first.setMyName('Léa');

    const again = await install();
    const after = await again.identity();
    expect(after.id).toBe(before.id);
    expect(after.keys.publicKey).toBe(before.keys.publicKey);
    expect(after.name).toBe('Léa');
  });

  it('copies an identity made before the Keychain copy existed, on first use', async () => {
    const app = await install();
    const made = await app.identity();
    keychain = undefined; // as on a phone from before this version
    vi.resetModules();
    localStorage.setItem('hence.identity', JSON.stringify(made));
    const updated = await import('./identity');
    await updated.identity();
    await Promise.resolve();
    expect(JSON.parse(keychain!).id).toBe(made.id);
  });
});
