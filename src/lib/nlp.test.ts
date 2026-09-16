import { describe, expect, it } from 'vitest';
import { parseTask, parseWhen } from './nlp';

// Monday 14 September 2026
const today = '2026-09-14';
const projects = [
  { id: 'ips', name: 'IPS' },
  { id: 'rb', name: 'Rainbow' },
  { id: 'ppl', name: 'People' },
];
const people = [
  { id: 'n', name: 'Nicolas Martin' },
  { id: 't', name: 'Thierry Dubois' },
];
const p = (s: string, ignore?: Set<string>) => parseTask(s, { today, projects, people, ignore, dateOrder: 'dmy' });

describe('parseTask', () => {
  it('leaves plain sentences untouched', () => {
    const r = p('Prepare Q4 presentation for Nicolas');
    expect(r.title).toBe('Prepare Q4 presentation for Nicolas');
    expect(r.tokens).toHaveLength(0);
  });

  it('detects relative dates', () => {
    const r = p('Call Thierry tomorrow');
    expect(r.title).toBe('Call Thierry');
    expect(r.dueDate).toBe('2026-09-15');
  });

  it('detects weekday and priority', () => {
    const r = p('Prepare board presentation Friday high priority');
    expect(r.title).toBe('Prepare board presentation');
    expect(r.dueDate).toBe('2026-09-18');
    expect(r.priority).toBe('important');
  });

  it('combines date and time', () => {
    const r = p('Call Nicolas tomorrow at 3pm');
    expect(r.title).toBe('Call Nicolas');
    expect(r.dueDate).toBe('2026-09-15');
    expect(r.dueTime).toBe('15:00');
  });

  it('anchors a lone time on today', () => {
    const r = p('Sync with Claire at 14:30');
    expect(r.title).toBe('Sync with Claire');
    expect(r.dueDate).toBe(today);
    expect(r.dueTime).toBe('14:30');
  });

  it('understands French-style hours', () => {
    expect(p('Point équipe 14h').dueTime).toBe('14:00');
    expect(p('Point équipe 9h30').dueTime).toBe('09:30');
  });

  it('treats short hour counts as durations', () => {
    const r = p('Write narrative 2h');
    expect(r.estimatedMinutes).toBe(120);
    expect(r.dueTime).toBeUndefined();
    expect(p('Review deck for 45 min').estimatedMinutes).toBe(45);
  });

  it('does not read money as minutes', () => {
    const r = p('Close 5m deal with Bosch');
    expect(r.title).toBe('Close 5m deal with Bosch');
    expect(r.estimatedMinutes).toBeUndefined();
  });

  it('only treats "important" as priority at the end', () => {
    expect(p('Important contracts review').priority).toBeUndefined();
    const r = p('Review contracts important');
    expect(r.priority).toBe('important');
    expect(r.title).toBe('Review contracts');
  });

  it('only treats bare frequency words as recurrence at the end', () => {
    expect(p('Weekly report draft').recurrence).toBeUndefined();
    const r = p('Send status report weekly');
    expect(r.recurrence).toEqual({ freq: 'weekly', interval: 1 });
    expect(r.dueDate).toBe(today);
  });

  it('parses "every <weekday>"', () => {
    const r = p('1:1 with Claire every thursday');
    expect(r.title).toBe('1:1 with Claire');
    expect(r.recurrence?.freq).toBe('weekly');
    expect(r.dueDate).toBe('2026-09-17');
  });

  it('resolves #project and @person', () => {
    const r = p('Review roadmap #rainbow @nicolas');
    expect(r.title).toBe('Review roadmap');
    expect(r.projectId).toBe('rb');
    expect(r.personId).toBe('n');
    const n = p('Kickoff #Atlas');
    expect(n.newProjectName).toBe('Atlas');
  });

  it('parses month dates and rolls past dates into next year', () => {
    expect(p('Board meeting sep 30').dueDate).toBe('2026-09-30');
    expect(p('Budget review 3 march').dueDate).toBe('2027-03-03');
    expect(p('Renew passport 21/10').dueDate).toBe('2026-10-21');
  });

  it('handles next week and in N days', () => {
    expect(p('Plan offsite next week').dueDate).toBe('2026-09-21');
    expect(p('Follow up in 3 days').dueDate).toBe('2026-09-17');
    expect(p('Follow up in two weeks').dueDate).toBe('2026-09-28');
  });

  it('respects dismissed tokens', () => {
    const first = p('Meet the Friday team');
    const key = first.tokens[0].key;
    const r = p('Meet the Friday team', new Set([key]));
    expect(r.title).toBe('Meet the Friday team');
    expect(r.dueDate).toBeUndefined();
  });

  it('keeps the words when nothing else remains', () => {
    const r = p('Tomorrow');
    expect(r.title).toBe('Tomorrow');
    expect(r.dueDate).toBeUndefined();
  });

  it('extracts links', () => {
    const r = p('Read https://example.com/report.pdf tomorrow');
    expect(r.title).toBe('Read');
    expect(r.links).toEqual(['https://example.com/report.pdf']);
  });
});

describe('parseWhen', () => {
  it('parses picker phrases', () => {
    expect(parseWhen('fri 3pm', { today })).toEqual({ date: '2026-09-18', time: '15:00' });
    expect(parseWhen('in 2 weeks', { today })).toEqual({ date: '2026-09-28', time: undefined });
  });
  it('rejects partial guesses', () => {
    expect(parseWhen('friday lunch with', { today })).toBeNull();
  });
});
