import { describe, expect, it } from 'vitest';
import { legacyCss } from './legacyCss';

describe('legacy colours', () => {
  it('gives every hex colour token a space-separated twin', () => {
    expect(legacyCss(':root{--color-paper:#faf9f6;--color-ink:#fff}')).toBe(
      ':root{--color-paper:#faf9f6;--rgb-paper:250 249 246;--color-ink:#fff;--rgb-ink:255 255 255}',
    );
    // Not a plain hex: nothing to derive.
    expect(legacyCss(':root{--color-wash:rgb(0 0 0 / .05)}')).toBe(':root{--color-wash:rgb(0 0 0 / .05)}');
  });

  it("makes Tailwind's fixed fallback follow the theme", () => {
    const css =
      '.bg-paper\\/88{background-color:#faf9f6e0}@supports (color:color-mix(in lab, red, red)){.bg-paper\\/88{background-color:color-mix(in oklab, var(--color-paper) 88%, transparent)}}';
    expect(legacyCss(css)).toBe(
      '.bg-paper\\/88{background-color:#faf9f6e0;background-color:rgb(var(--rgb-paper, 250 249 246) / 88%)}@supports (color:color-mix(in lab, red, red)){.bg-paper\\/88{background-color:color-mix(in oklab, var(--color-paper) 88%, transparent)}}',
    );
  });

  it('gives heights in dvh a vh version first', () => {
    expect(legacyCss('.s{max-height:86dvh}')).toBe('.s{max-height:86vh;max-height:86dvh}');
    expect(legacyCss('.t{min-height:calc(100dvh - 124px);color:red}')).toBe(
      '.t{min-height:calc(100vh - 124px);min-height:calc(100dvh - 124px);color:red}',
    );
    expect(legacyCss('.u{height:50%}')).toBe('.u{height:50%}');
  });

  it('gives our own color-mix() a fallback, and leaves what it cannot express', () => {
    expect(legacyCss('.a{background:color-mix(in srgb, var(--color-paper) 18%, transparent)}')).toBe(
      '.a{background:rgb(var(--rgb-paper) / 18%);background:color-mix(in srgb, var(--color-paper) 18%, transparent)}',
    );
    const own = '.b{color:color-mix(in oklab, currentcolor 50%, transparent)}';
    expect(legacyCss(own)).toBe(own);
  });
});
