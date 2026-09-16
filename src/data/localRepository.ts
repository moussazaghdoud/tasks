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
 * Browser-local repository. Keeps an in-memory snapshot and writes it to
 * localStorage (debounced, flushed on page hide). Syncs across tabs via the
 * `storage` event.
 */
export class LocalRepository implements WorkspaceRepository {
  private snapshot: WorkspaceSnapshot | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly storage: Storage = window.localStorage) {
    window.addEventListener('pagehide', () => this.flush());
  }

  async load(): Promise<WorkspaceSnapshot | null> {
    try {
      const raw = this.storage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WorkspaceSnapshot;
      if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
      this.snapshot = parsed;
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
    this.flush();
  }

  subscribe(onExternalChange: (snapshot: WorkspaceSnapshot) => void): () => void {
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const next = JSON.parse(e.newValue) as WorkspaceSnapshot;
        this.snapshot = next;
        onExternalChange(next);
      } catch {
        /* ignore malformed writes */
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.snapshot) return;
    try {
      this.storage.setItem(KEY, JSON.stringify(this.snapshot));
    } catch (err) {
      console.error('[hence] could not persist workspace', err);
    }
  }
}
