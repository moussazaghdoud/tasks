import { LocalRepository } from './localRepository';
import type { WorkspaceRepository } from './repository';

let repository: WorkspaceRepository | null = null;

export function configureRepository(repo: WorkspaceRepository) {
  repository = repo;
}

export function getRepository(): WorkspaceRepository {
  if (!repository) repository = new LocalRepository();
  return repository;
}

export type { WorkspaceRepository, ChangeSet } from './repository';
