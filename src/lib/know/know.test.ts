import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromExtract, parseModel, sentencesOf } from './condense';

describe('making a definition fit a glance', () => {
  const extract =
    'Virtual eXtensible LAN (VXLAN) is a network virtualization technology. It encapsulates layer 2 frames in UDP. It allows up to 16 million networks. It is often paired with EVPN. It was published as RFC 7348.';

  it('uses the article’s first sentence and the next three as points', () => {
    const c = fromExtract(extract);
    expect(c.sentence).toBe('Virtual eXtensible LAN (VXLAN) is a network virtualization technology.');
    expect(c.bullets).toHaveLength(3);
    expect(c.byModel).toBe(false);
  });

  it('splits sentences in Chinese too', () => {
    expect(sentencesOf('VXLAN是一种网络虚拟化技术。它封装二层帧。')).toHaveLength(2);
  });

  it('reads the model’s answer, and refuses one without points', () => {
    const c = parseModel('VXLAN stretches layer 2 networks over layer 3.\n- Up to 16M segments\n- Encapsulates in UDP\n- Paired with EVPN');
    expect(c?.sentence).toBe('VXLAN stretches layer 2 networks over layer 3.');
    expect(c?.bullets).toEqual(['Up to 16M segments', 'Encapsulates in UDP', 'Paired with EVPN']);
    expect(parseModel('Just one line')).toBeNull();
  });
});

describe('an article about the term, not merely near it', () => {
  it('accepts the real article and refuses a neighbour', async () => {
    const { isAbout } = await import('./wikipedia');
    expect(isAbout('VXLAN', 'Virtual Extensible LAN', 'Virtual Extensible Local Area Network (VXLAN) is a network virtualization technology.')).toBe(true);
    expect(isAbout('VXLAN', 'VXLAN', '')).toBe(true);
    expect(isAbout('VXLAN', 'Valentino Rossi', 'Valentino Rossi is an Italian motorcycle racer.')).toBe(false);
    expect(isAbout('zero trust', 'Zero trust architecture', 'Zero trust is a security model.')).toBe(true);
    expect(isAbout('Projet Atlas', 'Atlas (mythologie)', 'Atlas est un Titan.')).toBe(false);
  });
});

describe('the glossary and its reviews', () => {
  let store: typeof import('./store');
  beforeEach(async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    });
    vi.resetModules();
    store = await import('./store');
  });

  const entry = { term: 'VXLAN', sentence: 'A tunnel.', bullets: ['a', 'b'] };

  it('keeps one entry per term, and is due tomorrow', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    store.keep(entry, now);
    store.keep({ ...entry, term: 'vxlan', sentence: 'Updated.' }, now);
    expect(store.definitions()).toHaveLength(1);
    expect(store.definitions()[0].sentence).toBe('Updated.');
    expect(store.dueNow(now)).toHaveLength(0);
    expect(store.dueNow(new Date('2026-10-19T10:00:01Z'))).toHaveLength(1);
  });

  it('widens the gap on "got it" and starts over on "again"', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    const d = store.keep(entry, now);
    store.reviewed(d.id, true, now);
    expect(store.definitions()[0].review).toEqual({ step: 1, due: new Date('2026-10-21T10:00:00Z').toISOString() });
    store.reviewed(d.id, false, now);
    expect(store.definitions()[0].review.step).toBe(0);
  });

  it('counts look-ups per month', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    store.countLookUp(now);
    store.countLookUp(now);
    expect(store.usedThisMonth(now)).toBe(2);
    expect(store.usedThisMonth(new Date('2026-11-01T10:00:00Z'))).toBe(0);
  });
});
