import { describe, expect, it } from 'vitest';
import { localAnalyze } from './localAnalyze';

const today = '2026-09-15'; // Tuesday
const ctx = {
  today,
  projects: [
    { id: 'p_ips', name: 'IPS' },
    { id: 'p_rainbow', name: 'Rainbow' },
    { id: 'p_people', name: 'People' },
  ],
  people: [
    { id: 'u_claire', name: 'Claire Laurent' },
    { id: 'u_thierry', name: 'Thierry Dubois' },
  ],
};
const one = (s: string) => {
  const r = localAnalyze(s, ctx);
  expect(r).toHaveLength(1);
  return r[0];
};

describe('localAnalyze', () => {
  it('strips spoken framing and filler', () => {
    const d = one('um okay so I need to call Thierry tomorrow about the partner terms');
    expect(d.title).toBe('Call Thierry about the partner terms');
    expect(d.dueDate).toBe('2026-09-16');
  });

  it('detects spoken urgency', () => {
    const d = one('remind me to send the board deck to Nicolas friday it’s urgent');
    expect(d.title).toBe('Send the board deck to Nicolas');
    expect(d.priority).toBe('important');
    expect(d.dueDate).toBe('2026-09-18');
    const e = one('call thierry tomorrow about the partner terms it is urgent');
    expect(e.title).toBe('Call Thierry about the partner terms');
    expect(e.priority).toBe('important');
  });

  it('files under a named project and drops the phrase', () => {
    const d = one("don't forget to update the pipeline forecast for the IPS project");
    expect(d.title).toBe('Update the pipeline forecast');
    expect(d.project).toBe('IPS');
  });

  it('restores capitalization of known names and acronyms', () => {
    const d = one('ask claire laurent about the ips forecast');
    expect(d.title).toBe('Ask Claire Laurent about the IPS forecast');
    expect(d.project).toBe('IPS');
  });

  it('does not file ordinary words under a project', () => {
    expect(one('I need to hire two people for support').project).toBeNull();
  });

  it('splits clearly separate actions', () => {
    const r = localAnalyze('Book the flights to Bangalore. And also ask Claire for the offsite budget', ctx);
    expect(r.map((d) => d.title)).toEqual(['Book the flights to Bangalore', 'Ask Claire for the offsite budget']);
  });

  it('understands French framing', () => {
    const d = one("euh il faut que j'appelle le fournisseur à 14h");
    expect(d.title).toBe("Appelle le fournisseur");
    expect(d.dueTime).toBe('14:00');
  });

  it('moves a long explanation into notes', () => {
    const d = one(
      'prepare the quarterly business review for the leadership team, because the numbers from finance changed and we need to explain the gap in partner revenue',
    );
    expect(d.title).toBe('Prepare the quarterly business review for the leadership team');
    expect(d.notes).toMatch(/^Because the numbers/);
  });
});
