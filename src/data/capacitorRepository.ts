import { Preferences } from '@capacitor/preferences';
import type { WorkspaceSnapshot } from '@/domain/types';
import { SCHEMA_VERSION, type ChangeSet, type WorkspaceRepository } from './repository';

const KEY = 'hence.workspace.v1';

type Row = { id: string };

function mergeRows<T extends Row>(rows: T[], change?: { upsert: T[]; remove: string[] }): T[] {
  if (!change) return rows;
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const r of change.upsert) map.set(r.id, r);
  for (const id of change.remove) map.delete(id);
  return [...map.values()];
}

/**
 * Storage inside the native app.
 *
 * WKWebView's localStorage is part of the web view's cache, which iOS may
 * clear when the device is short on space — not acceptable for someone's task
 * list. Capacitor Preferences writes to UserDefaults, which is backed up and
 * survives.
 */
export class CapacitorRepository implements WorkspaceRepository {
  private snapshot: WorkspaceSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  async load(): Promise<WorkspaceSnapshot | null> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      if (!value) return await this.migrateFromWebStorage();
      const parsed = JSON.parse(value) as WorkspaceSnapshot;
      if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
      this.snapshot = parsed;
      return parsed;
    } catch (error) {
      console.error('[hence] could not read stored workspace', error);
      return null;
    }
  }

  /** First launch after an update that moved storage: keep what the web view had. */
  private async migrateFromWebStorage(): Promise<WorkspaceSnapshot | null> {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WorkspaceSnapshot;
      if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
      this.snapshot = parsed;
      await this.flush();
      return parsed;
    } catch {
      return null;
    }
  }

  async apply(changes: ChangeSet): Promise<void> {
    if (!this.snapshot) return;
    const s = this.snapshot;
    this.snapshot = {
      ...s,
      tasks: mergeRows(s.tasks, changes.tasks),
      projects: mergeRows(s.projects, changes.projects),
      people: mergeRows(s.people, changes.people),
      views: mergeRows(s.views, changes.views),
      user: changes.user ?? s.user,
    };
    this.schedule();
  }

  async replace(snapshot: WorkspaceSnapshot): Promise<void> {
    this.snapshot = snapshot;
    await this.flush();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 250);
  }

  /** Writes are serialized so a burst of edits can't interleave. */
  private flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const snapshot = this.snapshot;
    if (!snapshot) return Promise.resolve();
    this.writing = this.writing
      .then(() => Preferences.set({ key: KEY, value: JSON.stringify(snapshot) }))
      .catch((error: unknown) => console.error('[hence] could not persist workspace', error));
    return this.writing;
  }
}
