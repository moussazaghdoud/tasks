import { describe, expect, it } from 'vitest';
import { visibleTabs } from './SpaceTabs';

describe('visibleTabs', () => {
  it('hides the agenda until a calendar is connected, and always ends with Know', () => {
    expect(visibleTabs(false)).toEqual(['business', 'private', 'know']);
    expect(visibleTabs(true)).toEqual(['agenda', 'business', 'private', 'know']);
  });
});
