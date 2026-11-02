import { describe, expect, it } from 'vitest';
import { nameOf, others, summary } from './attendees';
import type { Attendee } from './calendarTypes';

const a = (name: string, response: Attendee['response'], extra: Partial<Attendee> = {}): Attendee => ({
  name,
  email: `${name.toLowerCase().replace(/\s/g, '.')}@example.com`,
  response,
  ...extra,
});

describe('meeting attendees', () => {
  it('names someone by the start of their address when they have no name', () => {
    expect(nameOf({ name: '', email: 'paul.martin@example.com' })).toBe('paul.martin');
    expect(nameOf({ name: 'Claire Dubois', email: 'c@x.com' })).toBe('Claire Dubois');
  });

  it('leaves you out and puts those coming first', () => {
    const list = others([a('Zoe', 'declined'), a('Me', 'accepted', { self: true }), a('Paul', 'none'), a('Claire', 'accepted')]);
    expect(list.map((x) => x.name)).toEqual(['Claire', 'Paul', 'Zoe']);
  });

  it('sums them up in one short line, without those who said no', () => {
    expect(summary([a('Claire Dubois', 'accepted'), a('Paul Martin', 'tentative')])).toBe('Claire, Paul');
    expect(summary([a('Claire', 'accepted'), a('Paul', 'none'), a('Sofia', 'accepted'), a('Anand', 'none'), a('Zoe', 'declined')])).toBe('Claire, Sofia +2');
    expect(summary([a('Me', 'accepted', { self: true })])).toBe('');
    expect(summary(undefined)).toBe('');
  });
});
