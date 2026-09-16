import { useEffect } from 'react';
import type { ID } from '@/domain/types';
import { todayKey } from '@/lib/dates';
import { isModEvent, isTypingTarget } from '@/lib/platform';
import { anchorForTask, targetIds, ui, useUi, type PickerKind, type Route } from '@/store/ui';
import { ws } from '@/store/workspace';
import { completeTasks, deferLater, deleteTasks, schedule, toggleImportant, undoLast } from '@/actions/taskActions';
import { useIsMobile } from './useMediaQuery';

function moveCursor(delta: number, extend: boolean) {
  const s = ui();
  const ids = s.visibleIds;
  if (!ids.length) return;
  const current = s.cursorId ? ids.indexOf(s.cursorId) : -1;
  const nextIndex = current < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, current + delta));
  const next = ids[nextIndex];
  if (extend) {
    const sel = new Set(s.selection);
    if (s.cursorId) sel.add(s.cursorId);
    sel.add(next);
    s.setSelection([...sel]);
  }
  s.setCursor(next);
  if (s.openTaskId) s.openTask(next);
  focusRow(next);
}

export function focusRow(id: ID) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-task-row="${id}"] [data-row]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  });
}

function openPickerForTargets(kind: PickerKind) {
  const ids = targetIds();
  if (!ids.length) return false;
  const anchorId = ui().cursorId && ids.includes(ui().cursorId!) ? ui().cursorId! : ids[0];
  const inList = document.querySelector(`[data-task-row="${anchorId}"]`);
  if (inList) ui().openPicker({ kind, taskIds: ids, anchor: anchorForTask(anchorId) });
  else ui().openPalette({ kind, taskIds: ids });
  return true;
}

function reorderCursor(delta: -1 | 1) {
  const s = ui();
  const id = s.cursorId;
  if (!id) return;
  const row = document.querySelector(`[data-task-row="${id}"]`);
  const list = row?.closest('[role="list"]');
  if (!list) return;
  const ids = [...list.querySelectorAll(':scope > [data-task-row]')].map((el) => el.getAttribute('data-task-row')!);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const without = ids.filter((x) => x !== id);
  const insertAt = without.indexOf(ids[j]) + (delta > 0 ? 1 : 0);
  ws().reorder(id, without[insertAt - 1] ?? null, without[insertAt] ?? null);
  focusRow(id);
}

const VIEW_KEYS: Record<string, Route> = {
  '1': { name: 'today' },
  '2': { name: 'upcoming' },
  '3': { name: 'inbox' },
  '4': { name: 'important' },
  '5': { name: 'later' },
};

/** Keyboard-first layer. Complements the mouse; every shortcut has a visible equivalent. */
export function useGlobalShortcuts() {
  const mobile = useIsMobile();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useUi.getState();
      const mod = isModEvent(e);
      const typing = isTypingTarget(e.target);
      const overlay = s.palette.open || s.focusTaskId || s.triageOpen || s.shortcutsOpen || s.projectDialog || s.captureOpen || s.voiceOpen;

      // Global, even while typing.
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (s.palette.open) s.closePalette();
        else s.openPalette();
        return;
      }
      if (overlay || s.picker) return;

      // Complete — also from inside the detail panel's fields, but never from
      // an unrelated input like the composer.
      if (mod && e.key === 'Enter' && (!typing || (e.target as HTMLElement).closest('[data-detail-panel]'))) {
        const ids = targetIds();
        if (ids.length) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur?.();
          void completeTasks(ids);
        }
        return;
      }
      if (typing) return;

      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (mod || e.altKey && !['ArrowUp', 'ArrowDown'].includes(e.key)) return;

      const key = e.key;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      switch (key) {
        case 'Escape':
          if (s.editingId) return run(() => s.setEditing(null));
          if (s.selection.length) return run(() => s.setSelection([]));
          if (s.openTaskId) return run(() => s.openTask(null));
          if (s.cursorId) return run(() => s.setCursor(null));
          return;
        case 'n':
        case 'c':
          return run(() => (mobile ? s.setCapture(true) : s.focusComposer()));
        case 'v':
          return run(() => s.setVoice(true));
        case '/':
          return run(() => s.openPalette());
        case '?':
          return run(() => s.setShortcuts(true));
        case '[':
          return run(() => ws().setPreferences({ sidebarCollapsed: !ws().user.preferences.sidebarCollapsed }));
        case 'ArrowDown':
        case 'j':
          if (e.altKey) return run(() => reorderCursor(1));
          return run(() => moveCursor(1, e.shiftKey));
        case 'ArrowUp':
        case 'k':
          if (e.altKey) return run(() => reorderCursor(-1));
          return run(() => moveCursor(-1, e.shiftKey));
      }

      if (VIEW_KEYS[key]) return run(() => s.navigate(VIEW_KEYS[key]));

      const ids = targetIds();
      if (!ids.length) {
        if (['Enter', 'e', 'd', 't', 'i', 'p', 'r', 'm', 'a', 'f', 'l', '.', ' '].includes(key)) run(() => moveCursor(1, false));
        return;
      }
      switch (key) {
        case 'Enter':
          return run(() => s.openTask(s.openTaskId === ids[0] ? null : (s.cursorId ?? ids[0])));
        case ' ':
          return run(() => s.cursorId && s.toggleSelected(s.cursorId));
        case 'e':
          return run(() => {
            const id = s.cursorId ?? ids[0];
            if (document.querySelector(`[data-task-row="${id}"]`)) {
              s.setEditing(id);
            } else {
              s.openTask(id);
              s.focusPanel('title');
            }
          });
        case 't':
          return run(() => schedule(ids, todayKey(), undefined));
        case 'l':
          return run(() => deferLater(ids));
        case 'i':
          return run(() => toggleImportant(ids));
        case 'd':
          return run(() => openPickerForTargets('date'));
        case 'p':
          return run(() => openPickerForTargets('priority'));
        case 'r':
          return run(() => openPickerForTargets('remind'));
        case 'm':
          return run(() => openPickerForTargets('project'));
        case 'a':
          return run(() => openPickerForTargets('assign'));
        case '.':
          return run(() => openPickerForTargets('actions'));
        case 'f':
          return run(() => s.startFocus(s.cursorId ?? ids[0]));
        case 'Backspace':
        case 'Delete':
          return run(() => deleteTasks(ids));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile]);
}
