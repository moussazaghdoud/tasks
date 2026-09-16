import { create } from 'zustand';
import type { ID } from '@/domain/types';

export type Route =
  | { name: 'today' }
  | { name: 'upcoming' }
  | { name: 'inbox' }
  | { name: 'important' }
  | { name: 'later' }
  | { name: 'project'; id: ID }
  | { name: 'view'; id: ID }
  | { name: 'search'; q: string };

export type PickerKind = 'date' | 'priority' | 'project' | 'assign' | 'remind' | 'repeat' | 'estimate' | 'status' | 'actions';

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickerState {
  kind: PickerKind;
  taskIds: ID[];
  anchor: Anchor;
}

export interface PaletteState {
  open: boolean;
  query: string;
  /** When set, the palette starts inside a picker for these tasks. */
  kind?: PickerKind;
  taskIds?: ID[];
}

interface UiState {
  route: Route;
  openTaskId: ID | null;
  /** Keyboard cursor — the row that keyboard actions apply to. */
  cursorId: ID | null;
  selection: ID[];
  editingId: ID | null;
  visibleIds: ID[];
  picker: PickerState | null;
  palette: PaletteState;
  focusTaskId: ID | null;
  triageOpen: boolean;
  shortcutsOpen: boolean;
  projectDialog: { id?: ID } | null;
  captureOpen: boolean;
  voiceOpen: boolean;
  composerFocusTick: number;
  panelFocus: { section: 'notes' | 'subtask' | 'link' | 'title'; tick: number } | null;
  dragging: boolean;
  sidebarOpenMobile: boolean;

  navigate: (route: Route) => void;
  openTask: (id: ID | null) => void;
  setCursor: (id: ID | null) => void;
  setSelection: (ids: ID[]) => void;
  toggleSelected: (id: ID) => void;
  setEditing: (id: ID | null) => void;
  setVisibleIds: (ids: ID[]) => void;
  openPicker: (p: PickerState) => void;
  closePicker: () => void;
  openPalette: (p?: Partial<Omit<PaletteState, 'open'>>) => void;
  closePalette: () => void;
  startFocus: (id: ID) => void;
  stopFocus: () => void;
  setTriage: (open: boolean) => void;
  setShortcuts: (open: boolean) => void;
  setProjectDialog: (d: { id?: ID } | null) => void;
  setCapture: (open: boolean) => void;
  setVoice: (open: boolean) => void;
  focusComposer: () => void;
  focusPanel: (section: 'notes' | 'subtask' | 'link' | 'title') => void;
  setDragging: (d: boolean) => void;
  setSidebarOpenMobile: (o: boolean) => void;
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'project':
      return `#/project/${route.id}`;
    case 'view':
      return `#/view/${route.id}`;
    case 'search':
      return `#/search?q=${encodeURIComponent(route.q)}`;
    default:
      return `#/${route.name}`;
  }
}

export function hashToRoute(hash: string): { route: Route; taskId?: ID } {
  const h = hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [head, id] = path.split('/');
  switch (head) {
    case 'upcoming':
    case 'inbox':
    case 'important':
    case 'later':
      return { route: { name: head } };
    case 'project':
      return id ? { route: { name: 'project', id } } : { route: { name: 'today' } };
    case 'view':
      return id ? { route: { name: 'view', id } } : { route: { name: 'today' } };
    case 'search':
      return { route: { name: 'search', q: new URLSearchParams(qs ?? '').get('q') ?? '' } };
    case 'task':
      return { route: { name: 'today' }, taskId: id };
    default:
      return { route: { name: 'today' } };
  }
}

export const sameRoute = (a: Route, b: Route) => routeToHash(a) === routeToHash(b);

const initial = typeof window !== 'undefined' ? hashToRoute(window.location.hash) : { route: { name: 'today' } as Route };

export const useUi = create<UiState>((set, get) => ({
  route: initial.route,
  openTaskId: initial.taskId ?? null,
  cursorId: initial.taskId ?? null,
  selection: [],
  editingId: null,
  visibleIds: [],
  picker: null,
  palette: { open: false, query: '' },
  focusTaskId: null,
  triageOpen: false,
  shortcutsOpen: false,
  projectDialog: null,
  captureOpen: false,
  voiceOpen: false,
  composerFocusTick: 0,
  panelFocus: null,
  dragging: false,
  sidebarOpenMobile: false,

  navigate: (route) => {
    if (!sameRoute(route, get().route)) {
      set({ route, selection: [], cursorId: null, editingId: null, sidebarOpenMobile: false });
    } else set({ sidebarOpenMobile: false });
    const hash = routeToHash(route);
    if (window.location.hash !== hash) window.history.pushState(null, '', hash);
  },
  openTask: (id) => set({ openTaskId: id, cursorId: id ?? get().cursorId }),
  setCursor: (id) => set({ cursorId: id }),
  setSelection: (ids) => set({ selection: ids }),
  toggleSelected: (id) =>
    set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] })),
  setEditing: (id) => set({ editingId: id }),
  setVisibleIds: (ids) => set({ visibleIds: ids }),
  openPicker: (picker) => set({ picker }),
  closePicker: () => set({ picker: null }),
  openPalette: (p = {}) => set({ palette: { open: true, query: '', ...p }, picker: null }),
  closePalette: () => set({ palette: { open: false, query: '' } }),
  startFocus: (id) => set({ focusTaskId: id, picker: null, palette: { open: false, query: '' } }),
  stopFocus: () => set({ focusTaskId: null }),
  setTriage: (open) => set({ triageOpen: open, picker: null }),
  setShortcuts: (open) => set({ shortcutsOpen: open }),
  setProjectDialog: (projectDialog) => set({ projectDialog }),
  setCapture: (captureOpen) => set({ captureOpen }),
  setVoice: (voiceOpen) => set({ voiceOpen, picker: null, captureOpen: false }),
  focusComposer: () => set((s) => ({ composerFocusTick: s.composerFocusTick + 1 })),
  focusPanel: (section) => set((s) => ({ panelFocus: { section, tick: (s.panelFocus?.tick ?? 0) + 1 } })),
  setDragging: (dragging) => set({ dragging }),
  setSidebarOpenMobile: (sidebarOpenMobile) => set({ sidebarOpenMobile }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const { route, taskId } = hashToRoute(window.location.hash);
    useUi.setState({ route, selection: [], ...(taskId ? { openTaskId: taskId } : {}) });
  });
}

export const ui = () => useUi.getState();

/** The tasks an action should apply to: the selection, else the cursor, else the open task. */
export function targetIds(): ID[] {
  const s = useUi.getState();
  if (s.selection.length) return s.selection;
  if (s.cursorId) return [s.cursorId];
  if (s.openTaskId) return [s.openTaskId];
  return [];
}

export function anchorFromElement(el: Element | null | undefined): Anchor {
  if (!el) {
    return { x: window.innerWidth / 2 - 140, y: window.innerHeight / 3, width: 0, height: 0 };
  }
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

export function anchorForTask(id: ID): Anchor {
  const row = document.querySelector(`[data-task-row="${id}"] [data-anchor]`) ?? document.querySelector(`[data-task-row="${id}"]`);
  return anchorFromElement(row);
}
