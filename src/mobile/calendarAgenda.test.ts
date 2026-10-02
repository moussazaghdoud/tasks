import { describe, expect, it, vi } from 'vitest';
vi.mock('./microsoft', () => ({
  configured: () => true, signIn: vi.fn(), signOut: vi.fn(), createEvent: vi.fn(), respond: vi.fn(),
  account: async () => ({ connected: true, account: 'a@b.c' }),
  listAgenda: async () => [{ id: 'E1', subject: 'Sync', start: '2026-10-03T08:30:00', end: '2026-10-03T09:00:00', allDay: false, showAs: 'busy' }],
}));
vi.mock('./google', () => ({
  configured: () => false, signIn: vi.fn(), signOut: vi.fn(), createEvent: vi.fn(), respond: vi.fn(),
  account: async () => ({ connected: false, account: '' }), listAgenda: async () => [],
}));
import { answerable, listAgenda, refreshAccounts } from './calendar';
describe('listAgenda', () => {
  it('labels each meeting with its calendar, so it can be answered', async () => {
    await refreshAccounts();
    const [m] = await listAgenda(7);
    expect(m.provider).toBe('microsoft');
    expect(answerable(m)).toBe(true);
  });
});
