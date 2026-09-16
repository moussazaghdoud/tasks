import type { ID, Person, Project, SavedView, Task, User, WorkspaceSnapshot } from '@/domain/types';

/**
 * Persistence boundary. The UI never touches storage directly; the store
 * computes row-level changes and hands them to a repository.
 *
 * To move to a backend (Postgres, Supabase, Firebase, REST…), implement this
 * interface — each method maps to an upsert / delete on one table — and pass
 * it to `configureRepository()` in `src/data/index.ts`.
 */
export interface ChangeSet {
  tasks?: { upsert: Task[]; remove: ID[] };
  projects?: { upsert: Project[]; remove: ID[] };
  people?: { upsert: Person[]; remove: ID[] };
  views?: { upsert: SavedView[]; remove: ID[] };
  user?: User;
}

export interface WorkspaceRepository {
  /** Returns `null` when nothing has been stored yet (first run). */
  load(): Promise<WorkspaceSnapshot | null>;
  apply(changes: ChangeSet): Promise<void>;
  /** Replace everything (import, reset to demo data). */
  replace(snapshot: WorkspaceSnapshot): Promise<void>;
  /** Called when another tab / device changed data. */
  subscribe?(onExternalChange: (snapshot: WorkspaceSnapshot) => void): () => void;
}

export const SCHEMA_VERSION = 1;
