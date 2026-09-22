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

describe('stillAhead', () => {
  const at = (h: number, m = 0) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  it('drops what has finished and keeps what is running', async () => {
    const { stillAhead } = await import('./microsoft');
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
    const { stillAhead } = await import('./microsoft');
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    const meetings = [{ subject: 'off', start: at(0), end: at(0), allDay: true, showAs: 'busy' }];
    expect(stillAhead(meetings, now.getTime())).toHaveLength(1);
  });
});
