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
    chime: async () => undefined,
    // Each simulated phone starts with an empty Keychain.
    keepIdentity: async () => undefined,
    readIdentity: async () => ({}),
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
  const outbox = await import('./outbox');
  const me = await identity.identity();
  identity.setMyName(name);
  const card = { id: me.id, name, publicKey: me.keys.publicKey };
  return { store, people, mailbox, outbox, card };
}

/** Switch to a phone made earlier: its storage and its modules as they were. */
type Phone = Awaited<ReturnType<typeof phone>>;
const use = (p: Phone) =>
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => p.store.get(k) ?? null,
    setItem: (k: string, v: string) => void p.store.set(k, v),
    removeItem: (k: string) => void p.store.delete(k),
  });

const inboxOf = (p: Phone) => JSON.parse(p.store.get('hence.inbox')!);
const person = (p: Phone) => ({ ...p.card, addedAt: '' });
const thought = { v: 1 as const, ref: 'ref-1', title: 'Call the notary', notes: '', important: true, reminderAt: null, mode: 'transfer' as const };

describe('sending a thought between two phones', () => {
  beforeEach(() => {
    box.length = 0;
  });

  it('goes from Alice to Bob, once both have added each other, and leaves only a receipt', async () => {
    const alice = await phone('Alice');
    const bob = await phone('Bob');

    // Alice scans Bob's code and says hello.
    use(alice);
    alice.people.addPerson(bob.card);
    await alice.mailbox.sayHello(person(bob));

    // Bob collects: a contact request, which he accepts.
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    const [request] = inboxOf(bob).requests;
    expect(request.card).toEqual(alice.card);
    bob.people.addPerson(request.card);
    expect(box).toHaveLength(0);

    // Alice sends a thought; Bob receives it whole.
    use(alice);
    expect(await alice.mailbox.sendThought([person(bob)], thought)).toEqual([]);
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    expect(inboxOf(bob).thoughts[0].thought).toEqual(thought);
    expect(inboxOf(bob).thoughts[0].from).toBe(alice.card.id);
    // The thought is gone from iCloud; only Bob's receipt to Alice is there.
    expect(box.map((e) => [e.kind, e.to])).toEqual([['ack', alice.card.id]]);
  });

  it('keeps what Alice sent until Bob’s receipt arrives, and takes a resend in only once', async () => {
    const alice = await phone('Alice');
    const bob = await phone('Bob');
    use(bob);
    bob.people.addPerson(alice.card);
    use(alice);
    alice.people.addPerson(bob.card);

    alice.outbox.keepSent([
      { ref: thought.ref, to: { id: bob.card.id, name: 'Bob' }, thought: { ...thought }, mode: 'transfer', sentAt: '' },
    ]);
    await alice.mailbox.sendThought([person(bob)], thought);
    await alice.mailbox.sendThought([person(bob)], thought); // resent, before Bob looked

    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    expect(inboxOf(bob).thoughts).toHaveLength(1);

    use(alice);
    expect(alice.outbox.waitingFor()).toHaveLength(1);
    await alice.mailbox.collect();
    expect(alice.outbox.waitingFor()).toHaveLength(0);
    expect(box).toHaveLength(0);
  });

  it('leaves in iCloud what it cannot read, instead of deleting it', async () => {
    const bob = await phone('Bob');
    box.push({ id: 'future', to: bob.card.id, kind: 'something-newer', from: 'x'.repeat(22), data: '{}', sentAt: new Date().toISOString() });
    use(bob);
    expect(await bob.mailbox.collect()).toBe(0);
    expect(box.map((e) => e.id)).toEqual(['future']);
  });

  it('turns a thought from someone removed into a request, with the thought waiting behind it', async () => {
    const alice = await phone('Alice');
    const bob = await phone('Bob');
    use(alice);
    alice.people.addPerson(bob.card);

    // Bob had removed Alice; she does not know, and sends.
    await alice.mailbox.sendThought([person(bob)], thought);
    use(bob);
    expect(await bob.mailbox.collect()).toBe(1);
    expect(inboxOf(bob).requests.map((r: { card: { name: string } }) => r.card.name)).toEqual(['Alice']);
    expect(inboxOf(bob).thoughts[0].from).toBe(alice.card.id);
  });

  it('opens nothing from a blocked sender, nor from a stranger posing as a contact', async () => {
    const alice = await phone('Alice');
    const mallory = await phone('Mallory');
    const bob = await phone('Bob');

    use(alice);
    await alice.mailbox.sendThought([person(bob)], thought);
    // Mallory claims to be Alice, with her own key.
    use(mallory);
    await mallory.mailbox.sendThought([person(bob)], { ...thought, ref: 'ref-2', title: 'Wire the money' });
    box[1].from = alice.card.id;

    use(bob);
    bob.people.addPerson(alice.card);
    expect(await bob.mailbox.collect()).toBe(1);
    expect(inboxOf(bob).thoughts.map((t: { thought: { title: string } }) => t.thought.title)).toEqual(['Call the notary']);

    // Blocked: whatever comes from her is deleted unopened.
    bob.people.blockPerson(alice.card.id);
    use(alice);
    await alice.mailbox.sendThought([person(bob)], { ...thought, ref: 'ref-3' });
    use(bob);
    expect(await bob.mailbox.collect()).toBe(0);
    expect(box.filter((e) => e.to === bob.card.id)).toHaveLength(0);
  });
});
