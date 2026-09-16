import { isNative } from '@/lib/native/platform';
import { LocalRepository } from './localRepository';
import type { WorkspaceRepository } from './repository';

let repository: WorkspaceRepository | null = null;

export function configureRepository(repo: WorkspaceRepository) {
  repository = repo;
}

/**
 * Storage for this platform: localStorage in a browser, Capacitor Preferences
 * in the native app (localStorage there can be evicted by iOS). Swap in a
 * backend by calling `configureRepository` before the store initializes.
 */
export function getRepository(): WorkspaceRepository {
  if (!repository) repository = new LocalRepository();
  return repository;
}

/** Called once at startup, before the store loads. */
export async function initRepository(): Promise<void> {
  if (repository || !isNative()) return;
  const { CapacitorRepository } = await import('./capacitorRepository');
  repository = new CapacitorRepository();
}

export type { WorkspaceRepository, ChangeSet } from './repository';
