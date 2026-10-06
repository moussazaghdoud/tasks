import { useSyncExternalStore } from 'react';
import { makeKeyPair, randomId, type KeyPair } from './crypto';

/**
 * Who this Hence is, to the people it shares with.
 *
 * No account: an identifier and a key pair made on the phone the first time
 * sharing is used, and a name the person chooses. Nobody signs up for
 * anything, and nothing here ever reaches a server in the clear.
 */
export interface Identity {
  id: string;
  name: string;
  keys: KeyPair;
}

const KEY = 'hence.identity';

function load(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Identity) : null;
    return parsed?.id && parsed.keys?.publicKey && parsed.keys.privateJwk ? parsed : null;
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

let current: Identity | null = load();
let making: Promise<Identity> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** This app's identity, made the first time it is asked for. */
export function identity(): Promise<Identity> {
  if (current) return Promise.resolve(current);
  making ??= makeKeyPair().then((keys) => {
    current = { id: randomId(), name: '', keys };
    save(current);
    notify();
    return current;
  });
  return making;
}

/** The identity if it exists yet, without making one. */
export const knownIdentity = (): Identity | null => current;

export function setMyName(name: string): void {
  if (!current) return;
  current = { ...current, name: name.trim().slice(0, 40) };
  save(current);
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
