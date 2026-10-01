import { describe, expect, it } from 'vitest';
import { buildEmptyWorkspace } from '@/data/demo';
import { createTask } from '@/domain/factories';
import type { WorkspaceSnapshot } from '@/domain/types';
import { mergeSnapshots, readBackup } from './backup';

const snap = (titles: string[]): WorkspaceSnapshot => {
  const base = buildEmptyWorkspace();
  return { ...base, tasks: titles.map((title) => ({ ...createTask({ title }), id: `t_${title}` })) };
};

describe('readBackup', () => {
  it('reads a Hence backup with its photographs', () => {
    const file = JSON.stringify({ app: 'hence', kind: 'backup', version: 1, createdAt: '', snapshot: snap(['a']), photos: { 'ph_1.jpg': 'AAAA' } });
    const found = readBackup(file);
    expect(found?.snapshot.tasks).toHaveLength(1);
    expect(found?.photos['ph_1.jpg']).toBe('AAAA');
  });

  it('reads a plain export from the web version', () => {
    expect(readBackup(JSON.stringify(snap(['a', 'b'])))?.snapshot.tasks).toHaveLength(2);
  });

  it('refuses anything else', () => {
    expect(readBackup('not json')).toBeNull();
    expect(readBackup(JSON.stringify({ hello: 'world' }))).toBeNull();
  });
});

describe('mergeSnapshots', () => {
  it('adds what is missing and never removes or overwrites', () => {
    const here = snap(['a', 'b']);
    here.tasks[0].title = 'a, edited this morning';
    const { merged, added } = mergeSnapshots(here, snap(['a', 'c']));
    expect(added).toBe(1);
    expect(merged.tasks.map((t) => t.id)).toEqual(['t_a', 't_b', 't_c']);
    expect(merged.tasks[0].title).toBe('a, edited this morning');
  });
});
