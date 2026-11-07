import { describe, expect, it } from 'vitest';
import { legacyColors } from './legacyColors';

describe('legacy colours', () => {
  it('gives every hex colour token a space-separated twin', () => {
    expect(legacyColors(':root{--color-paper:#faf9f6;--color-ink:#fff}')).toBe(
      ':root{--color-paper:#faf9f6;--rgb-paper:250 249 246;--color-ink:#fff;--rgb-ink:255 255 255}',
    );
    // Not a plain hex: nothing to derive.
    expect(legacyColors(':root{--color-wash:rgb(0 0 0 / .05)}')).toBe(':root{--color-wash:rgb(0 0 0 / .05)}');
  });

  it("makes Tailwind's fixed fallback follow the theme", () => {
    const css =
      '.bg-paper\\/88{background-color:#faf9f6e0}@supports (color:color-mix(in lab, red, red)){.bg-paper\\/88{background-color:color-mix(in oklab, var(--color-paper) 88%, transparent)}}';
    expect(legacyColors(css)).toBe(
      '.bg-paper\\/88{background-color:#faf9f6e0;background-color:rgb(var(--rgb-paper, 250 249 246) / 88%)}@supports (color:color-mix(in lab, red, red)){.bg-paper\\/88{background-color:color-mix(in oklab, var(--color-paper) 88%, transparent)}}',
    );
  });

  it('gives our own color-mix() a fallback, and leaves what it cannot express', () => {
    expect(legacyColors('.a{background:color-mix(in srgb, var(--color-paper) 18%, transparent)}')).toBe(
      '.a{background:rgb(var(--rgb-paper) / 18%);background:color-mix(in srgb, var(--color-paper) 18%, transparent)}',
    );
    const own = '.b{color:color-mix(in oklab, currentcolor 50%, transparent)}';
    expect(legacyColors(own)).toBe(own);
  });
});
