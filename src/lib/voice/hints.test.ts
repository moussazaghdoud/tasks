import { describe, expect, it } from 'vitest';
import { properNouns } from './hints';

describe('properNouns', () => {
  it('finds names inside a sentence', () => {
    expect(properNouns('Follow up with Thierry on partner terms')).toEqual(['Thierry']);
  });

  it('ignores the first word, which is capitalised by convention', () => {
    expect(properNouns('Book India travel')).toEqual(['India']);
  });

  it('keeps initialisms, which dictation spells out letter by letter', () => {
    expect(properNouns('Review the IPS numbers')).toEqual(['IPS']);
  });

  it('handles accents and hyphens', () => {
    expect(properNouns('Call Jean-Luc about Rainbow')).toEqual(['Jean-Luc', 'Rainbow']);
    expect(properNouns('Email Zoé the deck')).toEqual(['Zoé']);
  });

  it('leaves ordinary words alone', () => {
    expect(properNouns('check airline miles balance')).toEqual([]);
  });
});
