import { Directory, Filesystem } from '@capacitor/filesystem';
import type { WorkspaceSnapshot } from '@/domain/types';
import { exportFile } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { ws } from '@/store/workspace';

/**
 * A copy of everything, in a file the person keeps.
 *
 * Thoughts live only on this iPhone, and deleting the app deletes them with
 * it. Until they follow the person through iCloud, this is the way to carry
 * them across a reinstall or to a new phone: one file — thoughts and
 * photographs together — put wherever they keep things, Files, iCloud Drive
 * or an email to themselves.
 *
 * Restoring adds what the file holds and is missing here. It never removes
 * or overwrites: a backup from last month cannot erase this morning.
 */

interface Backup {
  app: 'hence';
  kind: 'backup';
  version: 1;
  createdAt: string;
  snapshot: WorkspaceSnapshot;
  /** Photograph files by name, as base64. */
  photos: Record<string, string>;
}

const PHOTOS = 'photos';
const safeName = (name: string) => /^[\w.-]+$/.test(name);

/** Write everything into one file and hand it to the share sheet. */
export async function backUp(): Promise<number> {
  const snapshot = ws().exportSnapshot();
  const photos: Record<string, string> = {};
  if (isNative()) {
    for (const task of snapshot.tasks) {
      if (!task.photo || !safeName(task.photo) || photos[task.photo]) continue;
      try {
        const { data } = await Filesystem.readFile({ path: `${PHOTOS}/${task.photo}`, directory: Directory.Data });
        if (typeof data === 'string') photos[task.photo] = data;
      } catch {
        /* a photograph already gone; the thought is still worth keeping */
      }
    }
  }
  const backup: Backup = { app: 'hence', kind: 'backup', version: 1, createdAt: new Date().toISOString(), snapshot, photos };
  await exportFile(`Hence backup ${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup));
  return snapshot.tasks.length;
}

/** What a file holds, if it is a backup — or a plain export from the web version. */
export function readBackup(text: string): { snapshot: WorkspaceSnapshot; photos: Record<string, string> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const file = parsed as Partial<Backup> & Partial<WorkspaceSnapshot>;
  const snapshot = (file.app === 'hence' && file.kind === 'backup' ? file.snapshot : file) as WorkspaceSnapshot | undefined;
  if (!snapshot || !Array.isArray(snapshot.tasks)) return null;
  return { snapshot, photos: file.app === 'hence' && file.photos && typeof file.photos === 'object' ? file.photos : {} };
}

/** Add to `current` whatever `incoming` holds that it does not. */
export function mergeSnapshots(current: WorkspaceSnapshot, incoming: WorkspaceSnapshot): { merged: WorkspaceSnapshot; added: number } {
  const missing = <T extends { id: string }>(here: T[], there: T[] | undefined): T[] => {
    const known = new Set(here.map((x) => x.id));
    return (there ?? []).filter((x) => x && typeof x.id === 'string' && !known.has(x.id));
  };
  const tasks = missing(current.tasks, incoming.tasks);
  return {
    merged: {
      ...current,
      tasks: [...current.tasks, ...tasks],
      projects: [...current.projects, ...missing(current.projects, incoming.projects)],
      people: [...current.people, ...missing(current.people, incoming.people)],
      views: [...current.views, ...missing(current.views, incoming.views)],
    },
    added: tasks.length,
  };
}

/**
 * Bring back the thoughts in a backup file. Returns how many came back, or
 * null when the file is not a Hence backup.
 */
export async function restore(file: File): Promise<number | null> {
  const found = readBackup(await file.text());
  if (!found) return null;

  // Photographs first: a thought that arrives before its picture would
  // show without it.
  if (isNative()) {
    for (const [name, data] of Object.entries(found.photos)) {
      if (!safeName(name) || typeof data !== 'string') continue;
      try {
        await Filesystem.stat({ path: `${PHOTOS}/${name}`, directory: Directory.Data });
        continue; // already here
      } catch {
        /* not here: write it */
      }
      await Filesystem.writeFile({ path: `${PHOTOS}/${name}`, data, directory: Directory.Data, recursive: true }).catch(() => {});
    }
  }

  const current = ws().exportSnapshot();
  const { merged, added } = mergeSnapshots(current, found.snapshot);
  const grew =
    added > 0 ||
    merged.projects.length > current.projects.length ||
    merged.people.length > current.people.length ||
    merged.views.length > current.views.length;
  if (grew) await ws().importSnapshot(merged);
  return added;
}
