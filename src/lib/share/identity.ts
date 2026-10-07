import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';
import { makeKeyPair, randomId, type KeyPair } from './crypto';
import { ShareBox } from './native';

/**
 * Who this Hence is, to the people it shares with.
 *
 * No account: an identifier and a key pair made on the phone the first time
 * sharing is used, and a name the person chooses. Nobody signs up for
 * anything, and nothing here ever reaches a server in the clear.
 *
 * Kept twice: in the app's storage, for speed, and in the iCloud Keychain,
 * which survives deleting the app and follows the person to a new iPhone —
 * without it, a reinstall would be a stranger to everyone in People, and
 * thoughts sealed for the old key could not be opened.
 */
export interface Identity {
  id: string;
  name: string;
  keys: KeyPair;
}

const KEY = 'hence.identity';

const valid = (value: unknown): value is Identity => {
  const id = value as Identity | null;
  return !!id?.id && !!id.keys?.publicKey && !!id.keys.privateJwk;
};

function load(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function save(next: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* kept for this session only */
  }
}

/** Into the iCloud Keychain. Quietly skipped where there is none (the web). */
function keep(next: Identity): void {
  if (!isNative()) return;
  void ShareBox.keepIdentity({ value: JSON.stringify(next) }).catch(() => undefined);
}

/** The identity this iPhone's Keychain holds — this app's, from before a reinstall or on another iPhone. */
async function fromKeychain(): Promise<Identity | null> {
  if (!isNative()) return null;
  try {
    const { value } = await ShareBox.readIdentity();
    const parsed: unknown = value ? JSON.parse(value) : null;
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let current: Identity | null = load();
let making: Promise<Identity> | null = null;
/** An identity from before the Keychain copy existed gets one, once. */
let kept = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** This app's identity: the one in use, else the Keychain's, else a new one. */
export function identity(): Promise<Identity> {
  if (current) {
    if (!kept) {
      kept = true;
      keep(current);
    }
    return Promise.resolve(current);
  }
  making ??= (async () => {
    const found = await fromKeychain();
    if (found) {
      current = found;
    } else {
      current = { id: randomId(), name: '', keys: await makeKeyPair() };
      keep(current);
    }
    kept = true;
    save(current);
    notify();
    return current;
  })();
  return making;
}

/** The identity if it is known yet, without making or looking for one. */
export const knownIdentity = (): Identity | null => current;

export function setMyName(name: string): void {
  if (!current) return;
  current = { ...current, name: name.trim().slice(0, 40) };
  save(current);
  keep(current);
  notify();
}

export const useMyName = (): string =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => current?.name ?? '',
    () => '',
  );
