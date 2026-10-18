import { useSyncExternalStore } from 'react';

/**
 * Which definition sheet is open: one definition to read, or the editor —
 * for a definition being changed, or one the person writes because nothing
 * was found. Kept outside React so the capture bar can open the editor from
 * a "Write it" toast.
 */
export type KnowSheetState = { open: false } | { open: true; id?: string; term?: string; editing: boolean };

let state: KnowSheetState = { open: false };
const listeners = new Set<() => void>();
const publish = (next: KnowSheetState) => {
  state = next;
  listeners.forEach((l) => l());
};

export const openDefinition = (id: string): void => publish({ open: true, id, editing: false });
export const openEditor = (target: { id?: string; term?: string }): void => publish({ open: true, ...target, editing: true });
export const closeKnow = (): void => publish({ open: false });

export const useKnowSheet = (): KnowSheetState =>
  useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => state,
    () => state,
  );
