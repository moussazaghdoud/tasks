import { beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
  return import('./people');
};

const card = (name: string) => ({ id: 'a'.repeat(22), name, publicKey: 'k'.repeat(87) });

describe('names in the people book', () => {
  let people: Awaited<ReturnType<typeof fresh>>;
  beforeEach(async () => {
    people = await fresh();
  });

  it('takes the name someone chooses after being added without one', () => {
    people.addPerson(card(''));
    people.addPerson(card('Léa'));
    expect(people.personOf(card('').id)?.name).toBe('Léa');
  });

  it('keeps a name you gave over the one they send, until you clear it', () => {
    people.addPerson(card('Léa'));
    people.renamePerson(card('').id, 'Léa (bureau)');
    people.addPerson(card('Lea M.'));
    expect(people.personOf(card('').id)?.name).toBe('Léa (bureau)');

    people.renamePerson(card('').id, '');
    people.addPerson(card('Lea M.'));
    expect(people.personOf(card('').id)?.name).toBe('Lea M.');
  });

  it('never replaces a name with an empty one', () => {
    people.addPerson(card('Léa'));
    people.addPerson(card(''));
    expect(people.personOf(card('').id)?.name).toBe('Léa');
  });
});
