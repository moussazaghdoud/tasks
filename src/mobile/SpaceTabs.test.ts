import { describe, expect, it } from 'vitest';
import { visibleTabs } from './SpaceTabs';

describe('visibleTabs', () => {
  it('hides the agenda until a calendar is connected', () => {
    expect(visibleTabs(false)).toEqual(['business', 'private']);
    expect(visibleTabs(true)).toEqual(['agenda', 'business', 'private']);
  });
});
