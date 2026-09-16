import { describe, expect, it } from 'vitest';
import { createTask } from '@/domain/factories';
import type { Person, Project } from '@/domain/types';
import { matchesQuery, parseQuery, scoreTitle } from './search';

const today = '2026-09-16'; // Wednesday
const projects = [{ id: 'ips', name: 'IPS' }] as Project[];
const people = [{ id: 'u_claire', name: 'Claire Laurent' }] as Person[];
const ctx = { projects: { ips: projects[0] }, people: { u_claire: people[0] }, me: 'me', today };
const q = (s: string) => parseQuery(s, { projects, people, today, weekStartsOn: 1 });

describe('parseQuery', () => {
  it('understands natural filters', () => {
    expect(q('overdue').overdue).toBe(true);
    expect(q('#ips board').projectId).toBe('ips');
    expect(q('#ips board').text).toEqual(['board']);
    expect(q('@claire').personId).toBe('u_claire');
    expect(q('completed last week').completed).toEqual({ from: '2026-09-07', to: '2026-09-13' });
  });
});

describe('matchesQuery', () => {
  const t = (fields: Parameters<typeof createTask>[0]) => createTask(fields);

  it('filters overdue open tasks', () => {
    const f = q('overdue');
    expect(matchesQuery(t({ title: 'a', dueDate: '2026-09-10' }), f, ctx)).toBe(true);
    expect(matchesQuery(t({ title: 'b', dueDate: today }), f, ctx)).toBe(false);
    expect(matchesQuery(t({ title: 'c', dueDate: '2026-09-10', status: 'done' }), f, ctx)).toBe(false);
  });

  it('finds completed tasks in a range', () => {
    const f = q('completed last week');
    expect(matchesQuery(t({ title: 'a', status: 'done', completedAt: new Date(2026, 8, 9, 12).toISOString() }), f, ctx)).toBe(true);
    expect(matchesQuery(t({ title: 'b', status: 'done', completedAt: new Date(2026, 8, 15, 12).toISOString() }), f, ctx)).toBe(false);
  });

  it('separates mine from delegated', () => {
    expect(matchesQuery(t({ title: 'a' }), q('mine'), ctx)).toBe(true);
    expect(matchesQuery(t({ title: 'a', assigneeId: 'u_claire' }), q('mine'), ctx)).toBe(false);
    expect(matchesQuery(t({ title: 'a', assigneeId: 'u_claire' }), q('delegated'), ctx)).toBe(true);
  });
});

describe('scoreTitle', () => {
  it('ranks prefixes and word starts', () => {
    expect(scoreTitle('Prepare board presentation', 'prep')).toBeGreaterThan(scoreTitle('Prepare board presentation', 'sent'));
    expect(scoreTitle('Customer advisory board for Rainbow?', 'tomorrow')).toBe(0);
  });
});
