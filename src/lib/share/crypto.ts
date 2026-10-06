/**
 * The locks on what passes between two people's Hence.
 *
 * Every app holds one key pair (P-256, made on the phone, never sent). Two
 * kinds of envelope travel:
 *
 * - A thought, sealed with a key only the two people can make: the sender's
 *   private key and the recipient's public key agree on it (ECDH), and so do
 *   the recipient's private key and the sender's public key. Opening it
 *   therefore also proves who sent it — nobody else could have sealed it.
 *
 * - A hello, sent once when someone scans your code: the recipient does not
 *   know the sender's key yet, so it is sealed to the recipient alone with a
 *   throwaway key, and carries the sender's card inside. Accepting it is what
 *   makes the two of you contacts.
 *
 * AES-GCM over the agreed key (via HKDF): a tampered envelope fails to open.
 * WebCrypto only — the same code runs in the phone's web view and in tests.
 */

const subtle = () => globalThis.crypto.subtle;
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INFO = new TextEncoder().encode('hence/share/v1');

/* ---- base64url ---- */

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(text: string): Uint8Array {
  const base = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base + '='.repeat((4 - (base.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/* ---- keys ---- */

export interface KeyPair {
  /** The private half, as JWK, kept on this phone only. */
  privateJwk: JsonWebKey;
  /** The public half, raw and base64url, handed out in the QR code. */
  publicKey: string;
}

export async function makeKeyPair(): Promise<KeyPair> {
  const pair = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const privateJwk = await subtle().exportKey('jwk', pair.privateKey);
  const publicKey = toB64(await subtle().exportKey('raw', pair.publicKey));
  return { privateJwk, publicKey };
}

const importPrivate = (jwk: JsonWebKey) => subtle().importKey('jwk', jwk, ECDH, false, ['deriveBits']);
const importPublic = (raw: string) => subtle().importKey('raw', fromB64(raw) as BufferSource, ECDH, false, []);

/** The AES key two key halves agree on. */
async function agree(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: INFO },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function lock(key: CryptoKey, value: unknown): Promise<{ iv: string; ct: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function unlock<T>(key: CryptoKey, box: { iv: string; ct: string }): Promise<T> {
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) as BufferSource }, key, fromB64(box.ct) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/* ---- the two envelopes ---- */

/** Seal for a contact: only they can open it, and opening it proves it came from me. */
export async function sealFor(mine: JsonWebKey, theirs: string, value: unknown): Promise<string> {
  const key = await agree(await importPrivate(mine), await importPublic(theirs));
  return JSON.stringify(await lock(key, value));
}

/** Open what a contact sealed. Throws when it was not them, or it was tampered with. */
export async function openFrom<T>(mine: JsonWebKey, theirs: string, sealed: string): Promise<T> {
  const key = await agree(await importPrivate(mine), await importPublic(theirs));
  return unlock<T>(key, JSON.parse(sealed));
}

/** Seal for someone who does not know me yet: a throwaway key, theirs alone can open it. */
export async function sealAnonymous(theirs: string, value: unknown): Promise<string> {
  const temp = (await subtle().generateKey(ECDH, true, ['deriveBits'])) as CryptoKeyPair;
  const key = await agree(temp.privateKey, await importPublic(theirs));
  const epk = toB64(await subtle().exportKey('raw', temp.publicKey));
  return JSON.stringify({ epk, ...(await lock(key, value)) });
}

/** Open an envelope sealed with sealAnonymous. */
export async function openAnonymous<T>(mine: JsonWebKey, sealed: string): Promise<T> {
  const box = JSON.parse(sealed) as { epk: string; iv: string; ct: string };
  const key = await agree(await importPrivate(mine), await importPublic(box.epk));
  return unlock<T>(key, box);
}

/** A random identifier: 16 bytes, unguessable. */
export const randomId = (): string => toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
