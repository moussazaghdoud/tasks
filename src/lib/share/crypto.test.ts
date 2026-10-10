import { describe, expect, it } from 'vitest';
import { makeKeyPair, openAnonymous, openFrom, sealAnonymous, sealFor } from './crypto';

describe('sharing envelopes', () => {
  it('opens a thought sealed between two people, and only between them', async () => {
    const moussa = await makeKeyPair();
    const claire = await makeKeyPair();
    const eve = await makeKeyPair();

    const sealed = await sealFor(moussa.privateJwk, claire.publicKey, { title: 'Send the deck' });
    expect(sealed).not.toContain('Send the deck');
    await expect(openFrom(claire.privateJwk, moussa.publicKey, sealed)).resolves.toEqual({ title: 'Send the deck' });

    // Someone else cannot read it…
    await expect(openFrom(eve.privateJwk, moussa.publicKey, sealed)).rejects.toThrow();
    // …nor pass off their own envelope as Moussa's.
    const forged = await sealFor(eve.privateJwk, claire.publicKey, { title: 'Pay me' });
    await expect(openFrom(claire.privateJwk, moussa.publicKey, forged)).rejects.toThrow();
  });

  it('opens a hello sealed to someone who does not know the sender yet', async () => {
    const claire = await makeKeyPair();
    const sealed = await sealAnonymous(claire.publicKey, { name: 'Moussa' });
    await expect(openAnonymous(claire.privateJwk, sealed)).resolves.toEqual({ name: 'Moussa' });
  });

  it('refuses an envelope that was tampered with', async () => {
    const a = await makeKeyPair();
    const b = await makeKeyPair();
    const box = JSON.parse(await sealFor(a.privateJwk, b.publicKey, { title: 'x' }));
    // Change the first character: its bits are all data (the last one's are partly padding).
    box.ct = (box.ct.startsWith('A') ? 'B' : 'A') + box.ct.slice(1);
    await expect(openFrom(b.privateJwk, a.publicKey, JSON.stringify(box))).rejects.toThrow();
  });
});
