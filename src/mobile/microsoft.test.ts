import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Which Microsoft registration an address signs in with. Getting this wrong
 * does not fail loudly: it sends someone to a registration that refuses them.
 */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./microsoft');
}

const BOTH = {
  VITE_M365_CLIENT_ID: 'public-client',
  VITE_M365_TENANT_ID: 'common',
  VITE_M365_WORK_CLIENT_ID: 'work-client',
  VITE_M365_WORK_TENANT_ID: 'work-tenant',
  VITE_M365_WORK_DOMAIN: 'al-enterprise.com',
};

describe('registrationFor', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends addresses at the work domain to the organisation’s own registration', async () => {
    const { registrationFor } = await load(BOTH);
    expect(registrationFor('moussa.zaghdoud@al-enterprise.com')).toEqual({ clientId: 'work-client', tenantId: 'work-tenant', domain: 'al-enterprise.com' });
  });

  it('matches the domain whatever the capitals or stray spaces', async () => {
    const { registrationFor } = await load(BOTH);
    expect(registrationFor('  Moussa.Zaghdoud@AL-Enterprise.COM ')?.clientId).toBe('work-client');
  });

  it('sends everyone else to the public registration', async () => {
    const { registrationFor } = await load(BOTH);
    for (const email of ['someone@outlook.com', 'someone@gmail.com', 'someone@anothercompany.com']) {
      expect(registrationFor(email)).toEqual({ clientId: 'public-client', tenantId: 'common' });
    }
  });

  it('does not treat a lookalike or a subdomain as the work domain', async () => {
    const { registrationFor } = await load(BOTH);
    expect(registrationFor('x@mail.al-enterprise.com')?.clientId).toBe('public-client');
    expect(registrationFor('x@al-enterprise.com.evil.example')?.clientId).toBe('public-client');
  });

  it('falls back to the public registration when no work one is configured', async () => {
    const { registrationFor } = await load({ VITE_M365_CLIENT_ID: 'public-client', VITE_M365_TENANT_ID: 'common' });
    expect(registrationFor('moussa.zaghdoud@al-enterprise.com')?.clientId).toBe('public-client');
  });
});
