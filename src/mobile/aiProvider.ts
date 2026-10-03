import { useSyncExternalStore } from 'react';
import { apiBase, isNative } from '@/lib/native/platform';

/**
 * Which service the server sends notes to, so the app can name it.
 *
 * The choice is the server's (VOICE_PROVIDER), not the person's. But the
 * person is asked before anything is sent, and App Review requires that
 * question to name who receives the text — so the app reads the active one
 * from /healthz at launch and remembers it for the next one, offline.
 */
export type Provider = 'claude' | 'gemini';

const KEY = 'hence.ai-provider';

function stored(): Provider {
  try {
    return localStorage.getItem(KEY) === 'gemini' ? 'gemini' : 'claude';
  } catch {
    return 'claude';
  }
}

let current: Provider = stored();
const listeners = new Set<() => void>();

export const aiProvider = (): Provider => current;

export function onProviderChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const useAiProvider = (): Provider => useSyncExternalStore(onProviderChange, () => current, () => 'claude');

/** Ask the server which service is active; keep the last answer when it cannot say. */
export async function refreshProvider(): Promise<void> {
  const base = isNative() ? apiBase() : '';
  if (isNative() && !base) return;
  try {
    const res = await fetch(`${base}/healthz`, { cache: 'no-store' });
    const body = (await res.json()) as { provider?: string };
    const next: Provider = body.provider === 'gemini' ? 'gemini' : 'claude';
    if (next === current) return;
    current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* known for this session only */
    }
    for (const notify of listeners) notify();
  } catch {
    /* offline: the last known service stands */
  }
}
