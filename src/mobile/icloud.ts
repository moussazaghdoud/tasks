import { registerPlugin } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { isNative } from '@/lib/native/platform';
import { toast } from '@/store/toast';
import { useWorkspace, ws } from '@/store/workspace';
import { mergeSnapshots, readBackup } from './backup';
import { t } from './i18n';

/**
 * Thoughts kept in the person's own iCloud, so deleting the app — or
 * changing iPhone — no longer loses them.
 *
 * Two moves, both automatic. At launch, an app with no thoughts looks in
 * iCloud and brings back what is there (adding, never replacing). After that,
 * every change is written to iCloud a few seconds later, and again when the
 * app goes to the background.
 *
 * One phone at a time: this is a copy that follows you, not a live sync
 * between devices. With iCloud off, the app works exactly as before and the
 * backup file in Settings remains the way to keep a copy.
 */

interface ICloudPlugin {
  available(): Promise<{ available: boolean }>;
  save(options: { json: string; photos: string[] }): Promise<void>;
  load(): Promise<{ available: boolean; json?: string }>;
  fetchPhoto(options: { name: string }): Promise<{ ok: boolean }>;
}

const ICloud = registerPlugin<ICloudPlugin>('ICloud');

export type CloudState = { kind: 'unknown' | 'off' | 'saving' | 'error' } | { kind: 'saved'; at: number };

let state: CloudState = { kind: 'unknown' };
const listeners = new Set<() => void>();
const publish = (next: CloudState) => {
  state = next;
  for (const notify of listeners) notify();
};

export const useCloudState = (): CloudState =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => state,
    () => state,
  );

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** No writing until the copy in iCloud has been looked at: an empty app must not overwrite it. */
let ready = false;
let saving: Promise<void> | null = null;

/**
 * An app with no thoughts — just installed, or reinstalled — brings back the
 * copy in iCloud. iCloud can take a moment to tell a fresh install what it
 * holds, so it asks again a little later before giving up.
 */
async function restoreIfEmpty(): Promise<void> {
  for (const wait of [0, 5_000, 15_000]) {
    if (Object.keys(ws().tasks).length) return;
    if (wait) await sleep(wait);
    const found = await ICloud.load().catch(() => null);
    if (!found || !found.available) {
      publish({ kind: 'off' });
      return;
    }
    if (!found.json) continue;
    const copy = readBackup(found.json);
    if (!copy) return;

    toast(t('icloud_restoring'));
    // Photographs first, so no thought appears without its picture.
    for (const task of copy.snapshot.tasks) {
      if (task.photo) await ICloud.fetchPhoto({ name: task.photo }).catch(() => undefined);
    }
    const { merged, added } = mergeSnapshots(ws().exportSnapshot(), copy.snapshot);
    if (added) {
      await ws().importSnapshot(merged);
      toast(t('icloud_restored', { n: added }));
    }
    return;
  }
}

/** Write the thoughts to iCloud now. */
export async function saveToICloud(): Promise<void> {
  if (!isNative() || !ready) return;
  if (saving) return saving;
  const snapshot = ws().exportSnapshot();
  // Never replace a copy with nothing: an emptied app is more often an
  // accident than a wish.
  if (!snapshot.tasks.length) return;
  publish({ kind: 'saving' });
  saving = ICloud.save({
    json: JSON.stringify({ app: 'hence', kind: 'backup', version: 1, createdAt: new Date().toISOString(), snapshot, photos: {} }),
    photos: snapshot.tasks.map((task) => task.photo).filter((name): name is string => !!name),
  })
    .then(() => publish({ kind: 'saved', at: Date.now() }))
    .catch((error: { code?: string }) => publish({ kind: error?.code === 'unavailable' ? 'off' : 'error' }))
    .finally(() => {
      saving = null;
    });
  return saving;
}

export async function initICloud(): Promise<void> {
  if (!isNative()) return;
  await restoreIfEmpty();
  ready = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  useWorkspace.subscribe((now, before) => {
    if (now.tasks === before.tasks && now.projects === before.projects && now.people === before.people) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void saveToICloud(), 4_000);
  });
  // Leaving the app is the last chance before it may be closed.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveToICloud();
  });
  void saveToICloud();
}
