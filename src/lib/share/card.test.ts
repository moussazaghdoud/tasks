import { describe, expect, it } from 'vitest';
import { cardLink, readCard } from './card';
import { makeKeyPair, randomId } from './crypto';

describe('contact cards', () => {
  it('round-trips through the link, from inside any text', async () => {
    const keys = await makeKeyPair();
    const card = { id: randomId(), name: 'Moussa', publicKey: keys.publicKey };
    const link = cardLink(card);
    expect(link.startsWith('hence://add#1.')).toBe(true);
    expect(readCard(link)).toEqual(card);
    expect(readCard(`Add me on Hence: ${link} — see you`)).toEqual(card);
  });

  it('refuses anything that is not a card', () => {
    expect(readCard('https://example.com')).toBeNull();
    expect(readCard('hence://add#1.bm90IGEgY2FyZA')).toBeNull();
  });
});
