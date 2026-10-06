import { beforeEach, describe, expect, it, vi } from 'vitest';

/** iCloud's public database, as a list in memory. */
const box: Array<{ id: string; to: string; kind: string; from: string; data: string; sentAt: string }> = [];
let next = 0;

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    available: async () => ({ available: true }),
    post: async (e: { to: string; kind: string; from: string; data: string }) => {
      box.push({ ...e, id: `r${next++}`, sentAt: new Date().toISOString() });
    },
    fetch: async ({ to }: { to: string }) => ({ envelopes: box.filter((e) => e.to === to) }),
    remove: async ({ ids }: { ids: string[] }) => {
      for (const id of ids) box.splice(box.findIndex((e) => e.id === id), 1);
    },
    subscribe: async () => undefined,
  }),
}));
vi.mock('@/lib/native/platform', () => ({ isNative: () => true }));

/** A fresh phone: its own storage, its own modules. */
async function phone(name: string) {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
  const identity = await import('./identity');
  const people = await import('./people');
  const mailbox = await import('./mailbox');
  const me = await identity.identity();
  identity.setMyName(name);
  const card = { id: me.id, name, publicKey: me.keys.publicKey };
  return { store, people, mailbox, card };
}

/** Switch to a phone made earlier: its storage and its modules as they were. */
type Phone = Awaited<ReturnType<typeof phone>>;
const use = (p: Phone) =>
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => p.store.get(k) ?? null,
    setItem: (k: string, v: string) => void p.store.set(k, v),
    removeItem: (k: string) => void p.store.delete(k),
  });

const thought = { v: 1 as const, title: 'Call the notary', notes: '', important: true, reminderAt: null, mode: 'transfer' as const };

describe('sending a thought between two phones', () => {
  beforeEach(() => {
    box.length = 0;
  });

  it('goes from Alice to Bob, once both have added each other, and leaves nothing in iCloud', async () => {
    const alice = await phone('Alice');
    const bob = await phone('Bob');

    // Alice scans Bob's code and says hello.
    use(alice);
    alice.people.addPerson(bob.card);
    await alice.mailbox.sayHello({ ...bob.card, addedAt: '' });

    // Bob collects: a contact request, which he accepts.
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    const [request] = JSON.parse(bob.store.get('hence.inbox')!).requests;
    expect(request.card).toEqual(alice.card);
    bob.people.addPerson(request.card);
    expect(box).toHaveLength(0);

    // Alice sends a thought; Bob receives it whole.
    use(alice);
    expect(await alice.mailbox.sendThought([{ ...bob.card, addedAt: '' }], thought)).toEqual([]);
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    const inbox = JSON.parse(bob.store.get('hence.inbox')!);
    expect(inbox.thoughts[0].thought).toEqual(thought);
    expect(inbox.thoughts[0].from).toBe(alice.card.id);
    expect(box).toHaveLength(0);
  });

  it('turns a thought from someone removed into a request, with the thought waiting behind it', async () => {
    const alice = await phone('Alice');
    const bob = await phone('Bob');
    use(alice);
    alice.people.addPerson(bob.card);

    // Bob had removed Alice; she does not know, and sends.
    await alice.mailbox.sendThought([{ ...bob.card, addedAt: '' }], thought);
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    const inbox = JSON.parse(bob.store.get('hence.inbox')!);
    expect(inbox.requests.map((r: { card: { name: string } }) => r.card.name)).toEqual(['Alice']);
    expect(inbox.thoughts[0].from).toBe(alice.card.id);
    expect(box).toHaveLength(0);
  });

  it('opens nothing from a blocked sender, nor from a stranger posing as a contact', async () => {
    const alice = await phone('Alice');
    const mallory = await phone('Mallory');
    const bob = await phone('Bob');

    use(alice);
    await alice.mailbox.sendThought([{ ...bob.card, addedAt: '' }], thought);
    // Mallory claims to be Alice, with her own key.
    use(mallory);
    await mallory.mailbox.sendThought([{ ...bob.card, addedAt: '' }], { ...thought, title: 'Wire the money' });
    box[1].from = alice.card.id;

    use(bob);
    bob.people.addPerson(alice.card);
    expect(await bob.mailbox.collect()).toBe(1);
    expect(JSON.parse(bob.store.get('hence.inbox')!).thoughts.map((t: { thought: { title: string } }) => t.thought.title)).toEqual([
      'Call the notary',
    ]);

    // Blocked: the next one is deleted unopened.
    bob.people.blockPerson(alice.card.id);
    use(alice);
    await alice.mailbox.sendThought([{ ...bob.card, addedAt: '' }], thought);
    use(bob);
    expect(await bob.mailbox.collect()).toBe(0);
    expect(box).toHaveLength(0);
  });
});
