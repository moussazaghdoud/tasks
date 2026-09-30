import { describe, expect, it } from 'vitest';
import { announcementFor, compareVersions } from './whatsNew';

describe('compareVersions', () => {
  it('compares the way people read versions', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });
});

describe('announcementFor', () => {
  it('welcomes a new installation', () => {
    expect(announcementFor('1.0.1', null, false)?.kind).toBe('welcome');
  });

  it('tells someone updating from before the sheet existed about this version', () => {
    const found = announcementFor('1.0.1', null, true);
    expect(found?.kind).toBe('update');
    expect(found?.notes.length).toBeGreaterThan(0);
  });

  it('says what came since the last version announced', () => {
    expect(announcementFor('1.0.1', '1.0.0', true)?.kind).toBe('update');
  });

  it('says nothing twice, nor for a version with nothing to tell', () => {
    expect(announcementFor('1.0.1', '1.0.1', true)).toBeNull();
    expect(announcementFor('1.0.0', null, true)).toBeNull();
  });
});
