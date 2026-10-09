import { describe, expect, it } from 'vitest';
import { understand } from './understood';

const now = new Date('2026-10-09T10:00:00');
const kinds = (text: string, names: string[] = []) =>
  understand(text, names, now)
    .segments.filter((s) => s.kind)
    .map((s) => [s.kind, s.text]);

describe('what lights up while speaking', () => {
  it('finds a spoken new line, in English and French', () => {
    expect(kinds('milk new line bread')).toEqual([['newline', 'new line']]);
    expect(kinds('lait à la ligne pain')).toEqual([['newline', 'à la ligne']]);
  });

  it('lights up the reminder request and knows when it is for', () => {
    const said = understand('Call the notary remind me tomorrow at 9', [], now);
    expect(said.segments.find((s) => s.kind === 'when')?.text).toMatch(/^remind me tomorrow at 9/);
    expect(said.at?.getHours()).toBe(9);
    expect(said.at?.getDate()).toBe(10);
  });

  it('colours names from the list, whole words only, and keeps every character', () => {
    const text = 'Call Paul about Atlas, not Paula';
    const said = understand(text, ['Paul', 'Atlas'], now);
    expect(kinds(text, ['Paul', 'Atlas'])).toEqual([
      ['name', 'Paul'],
      ['name', 'Atlas'],
    ]);
    expect(said.segments.map((s) => s.text).join('')).toBe(text);
  });

  it('says nothing about plain words', () => {
    expect(kinds('buy some bread')).toEqual([]);
    expect(understand('', [], now).segments).toEqual([]);
  });
});
