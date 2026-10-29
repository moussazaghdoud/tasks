import { describe as group, expect, it } from 'vitest';
import { createTask } from '@/domain/factories';
import { log, logEntries, logText, ref } from '@/lib/log';
import { describe, differences } from './diagnostics';

const SECRET = 'Call the lawyer about the divorce';
const thought = () => createTask({ id: 't_abcdef123456', title: SECRET, space: 'private', position: 0 });

group('the diary', () => {
  it('keeps the last five hundred entries', () => {
    for (let i = 0; i < 520; i++) log('app', `entry ${i}`);
    expect(logEntries()).toHaveLength(500);
    expect(logEntries().at(-1)?.d).toBe('entry 519');
  });

  it('reads as one line per entry under its header', () => {
    log('tap', 'check abc123');
    const text = logText(['Hence diagnostics']);
    expect(text.startsWith('Hence diagnostics\n\n')).toBe(true);
    expect(text).toMatch(/tap {6}check abc123\n$/);
  });

  it('names a thought by the end of its id', () => {
    expect(ref('t_abcdef123456')).toBe('123456');
  });
});

group('what a change says', () => {
  it('never carries the words of a thought', () => {
    const was = thought();
    const now = { ...was, title: `${SECRET}!`, status: 'done' as const, space: 'business' as const };
    const said = [describe(was), ...differences(was, now)].join(' ');
    expect(said).not.toContain('lawyer');
    expect(said).toContain('done 123456');
    expect(said).toContain('moved 123456 → business');
    expect(said).toContain('edited 123456');
  });

  it('says nothing when nothing it watches changed', () => {
    const was = thought();
    expect(differences(was, { ...was, position: 99 })).toEqual([]);
  });
});
