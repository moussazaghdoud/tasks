import { create } from 'zustand';
import { activity, createPerson, createProject, createTask, ME } from '@/domain/factories';
import { nextOccurrence, recurrenceLabel } from '@/domain/recurrence';
import type {
  ActivityEntry,
  DateKey,
  ID,
  Person,
  Priority,
  Project,
  RecurrenceRule,
  SavedView,
  Task,
  TaskStatus,
  TimeKey,
  User,
  UserPreferences,
  WorkspaceSnapshot,
} from '@/domain/types';
import { getRepository, initRepository, type ChangeSet } from '@/data';
import { buildDemoWorkspace, buildEmptyWorkspace } from '@/data/demo';
import { dueLabel, formatTime, todayKey } from '@/lib/dates';
import { createId, nowIso } from '@/lib/id';
import { hostOf } from '@/lib/nlp';

type Rec<T> = Record<ID, T>;

export interface NewTaskInput extends Partial<Omit<Task, 'id' | 'title'>> {
  title: string;
  links?: Task['links'];
  /** Insert at the top (default) or bottom of the manual order. */
  placement?: 'top' | 'bottom';
}

export interface WorkspaceState {
  ready: boolean;
  workspaceId: ID;
  user: User;
  tasks: Rec<Task>;
  projects: Rec<Project>;
  people: Rec<Person>;
  views: Rec<SavedView>;

  init: () => Promise<void>;

  addTask: (input: NewTaskInput) => Task;
  addTasks: (inputs: NewTaskInput[]) => Task[];
  updateTask: (id: ID, patch: Partial<Task>, log?: ActivityEntry) => void;
  renameTask: (id: ID, title: string) => void;
  setDue: (ids: ID[], date: DateKey | null, time?: TimeKey | null) => void;
  defer: (ids: ID[]) => void;
  setPriority: (ids: ID[], priority: Priority) => void;
  toggleImportant: (ids: ID[]) => void;
  moveToProject: (ids: ID[], projectId: ID | null) => void;
  assign: (ids: ID[], personId: ID | null) => void;
  setReminder: (ids: ID[], at: string | null) => void;
  setRecurrence: (ids: ID[], rule: RecurrenceRule | null) => void;
  setEstimate: (ids: ID[], minutes: number | null) => void;
  setStatus: (ids: ID[], status: TaskStatus) => void;
  complete: (ids: ID[]) => { spawned: Task[] };
  reopen: (ids: ID[]) => void;
  archive: (ids: ID[]) => void;
  remove: (ids: ID[]) => void;
  duplicate: (id: ID) => Task | null;
  reorder: (id: ID, prevId: ID | null, nextId: ID | null) => void;
  markReminderFired: (id: ID) => void;

  addSubtask: (taskId: ID, title: string) => void;
  updateSubtask: (taskId: ID, subId: ID, patch: { title?: string; done?: boolean }) => void;
  removeSubtask: (taskId: ID, subId: ID) => void;
  moveSubtask: (taskId: ID, subId: ID, delta: -1 | 1) => void;
  addLink: (taskId: ID, url: string, title?: string) => void;
  removeLink: (taskId: ID, linkId: ID) => void;

  addProject: (fields: Partial<Project> & { name: string }) => Project;
  updateProject: (id: ID, patch: Partial<Project>) => void;
  archiveProject: (id: ID) => void;
  deleteProject: (id: ID) => void;
  reorderProject: (id: ID, prevId: ID | null, nextId: ID | null) => void;

  addPerson: (name: string) => Person;

  saveView: (name: string, query: string) => SavedView;
  removeView: (id: ID) => void;

  setUserName: (name: string) => void;
  setPreferences: (patch: Partial<UserPreferences>) => void;

  resetToDemo: () => Promise<void>;
  clearAll: () => Promise<void>;
  importSnapshot: (snapshot: WorkspaceSnapshot) => Promise<void>;
  exportSnapshot: () => WorkspaceSnapshot;

  /** Run a mutation and get back a function that reverts exactly what it changed. */
  transact: (fn: () => void) => () => void;
  undo: () => boolean;
}

const byId = <T extends { id: ID }>(rows: T[]): Rec<T> => Object.fromEntries(rows.map((r) => [r.id, r]));

const MAX_ACTIVITY = 60;
const undoStack: Array<() => void> = [];
let hydrating = false;

function log(task: Task, entry: ActivityEntry | undefined): ActivityEntry[] {
  if (!entry) return task.activity;
  return [...task.activity, entry].slice(-MAX_ACTIVITY);
}

function whenText(date: DateKey | null, time: TimeKey | null, fmt: '24h' | '12h') {
  if (!date) return 'Removed date';
  return `Scheduled for ${dueLabel(date)}${time ? ` at ${formatTime(time, fmt)}` : ''}`;
}

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** Patch several tasks with a function; untouched tasks keep their identity. */
  const patchTasks = (ids: ID[], fn: (t: Task) => Partial<Task> | null, entry?: (t: Task) => ActivityEntry | undefined) => {
    const now = nowIso();
    set((s) => {
      const tasks = { ...s.tasks };
      let changed = false;
      for (const id of ids) {
        const t = tasks[id];
        if (!t) continue;
        const patch = fn(t);
        if (!patch) continue;
        tasks[id] = { ...t, ...patch, updatedAt: now, activity: log(t, entry?.(t)) };
        changed = true;
      }
      return changed ? { tasks } : s;
    });
  };

  const minPosition = () => {
    const all = Object.values(get().tasks);
    return all.length ? Math.min(...all.map((t) => t.position)) : 0;
  };
  const maxPosition = () => {
    const all = Object.values(get().tasks);
    return all.length ? Math.max(...all.map((t) => t.position)) : 0;
  };
  const fmt = () => get().user.preferences.timeFormat;

  const hydrate = (snap: WorkspaceSnapshot) => {
    hydrating = true;
    set({
      ready: true,
      workspaceId: snap.workspace.id,
      user: snap.user,
      tasks: byId(snap.tasks),
      projects: byId(snap.projects),
      people: byId(snap.people),
      views: byId(snap.views),
    });
    hydrating = false;
  };

  return {
    ready: false,
    workspaceId: '',
    user: buildEmptyWorkspace().user,
    tasks: {},
    projects: {},
    people: {},
    views: {},

    init: async () => {
      await initRepository();
      const repo = getRepository();
      let snap = await repo.load();
      if (!snap) {
        snap = buildDemoWorkspace();
        await repo.replace(snap);
      }
      hydrate(snap);
      repo.subscribe?.((external) => hydrate(external));
    },

    addTask: (input) => get().addTasks([input])[0],

    addTasks: (inputs) => {
      const top = minPosition();
      const bottom = maxPosition();
      const created = inputs.map(({ placement = 'top', ...fields }, i) =>
        createTask({
          ...fields,
          title: fields.title.trim(),
          position: placement === 'top' ? top - (inputs.length - i) * 1024 : bottom + (i + 1) * 1024,
        }),
      );
      set((s) => ({ tasks: { ...s.tasks, ...byId(created) } }));
      return created;
    },

    updateTask: (id, patch, entry) => patchTasks([id], () => patch, () => entry),

    renameTask: (id, title) => {
      const clean = title.trim();
      if (!clean) return;
      patchTasks([id], (t) => (t.title === clean ? null : { title: clean }), () => activity('renamed', `Renamed to “${clean}”`));
    },

    setDue: (ids, date, time) =>
      patchTasks(
        ids,
        (t) => {
          const nextTime = date === null ? null : time === undefined ? t.dueTime : time;
          if (t.dueDate === date && t.dueTime === nextTime) return null;
          return { dueDate: date, dueTime: nextTime, deferred: date ? false : t.deferred };
        },
        (t) => activity(date ? 'scheduled' : 'unscheduled', whenText(date, date === null ? null : time === undefined ? t.dueTime : time, fmt())),
      ),

    defer: (ids) =>
      patchTasks(
        ids,
        (t) => (t.deferred && !t.dueDate ? null : { deferred: true, dueDate: null, dueTime: null }),
        () => activity('unscheduled', 'Moved to Later'),
      ),

    setPriority: (ids, priority) =>
      patchTasks(
        ids,
        (t) => (t.priority === priority ? null : { priority }),
        () => activity('priority', priority === 'important' ? 'Marked important' : priority === 'low' ? 'Set to low priority' : 'Set to normal priority'),
      ),

    toggleImportant: (ids) => {
      const tasks = ids.map((id) => get().tasks[id]).filter(Boolean);
      const allImportant = tasks.every((t) => t.priority === 'important');
      get().setPriority(ids, allImportant ? 'normal' : 'important');
    },

    moveToProject: (ids, projectId) => {
      const name = projectId ? get().projects[projectId]?.name : 'Inbox';
      patchTasks(ids, (t) => (t.projectId === projectId ? null : { projectId }), () => activity('moved', `Moved to ${name}`));
    },

    assign: (ids, personId) => {
      const person = personId ? get().people[personId] : null;
      patchTasks(
        ids,
        (t) => (t.assigneeId === personId ? null : { assigneeId: personId }),
        () => activity('assigned', person && person.id !== ME ? `Assigned to ${person.name}` : 'Assigned to you'),
      );
    },

    setReminder: (ids, at) =>
      patchTasks(
        ids,
        () => ({ reminderAt: at, reminderFiredAt: null }),
        () => activity('reminder', at ? `Reminder set for ${new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Reminder removed'),
      ),

    setRecurrence: (ids, rule) =>
      patchTasks(
        ids,
        (t) => ({ recurrence: rule, dueDate: rule && !t.dueDate ? todayKey() : t.dueDate, deferred: rule ? false : t.deferred }),
        (t) => activity('repeat', rule ? recurrenceLabel(rule, t.dueDate) : 'No longer repeats'),
      ),

    setEstimate: (ids, minutes) => patchTasks(ids, () => ({ estimatedMinutes: minutes })),

    setStatus: (ids, status) => {
      if (status === 'done') {
        get().complete(ids);
        return;
      }
      const label = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting', done: 'Done' }[status];
      patchTasks(
        ids,
        (t) => (t.status === status ? null : { status, completedAt: null }),
        () => activity('status', `Status: ${label}`),
      );
    },

    complete: (ids) => {
      const spawned: Task[] = [];
      const now = nowIso();
      for (const id of ids) {
        const t = get().tasks[id];
        if (!t || t.status === 'done' || !t.recurrence) continue;
        const from = t.dueDate && t.dueDate > todayKey() ? t.dueDate : (t.dueDate ?? todayKey());
        const next = createTask({
          ...t,
          id: createId('t_'),
          status: 'open',
          createdAt: now,
          updatedAt: now,
          completedAt: null,
          reminderAt: null,
          reminderFiredAt: null,
          dueDate: nextOccurrence(t.recurrence, from),
          subtasks: t.subtasks.map((s) => ({ ...s, id: createId('s_'), done: false })),
          links: t.links.map((l) => ({ ...l, id: createId('l_') })),
          activity: [activity('created', `Repeats — ${recurrenceLabel(t.recurrence, t.dueDate)}`, now)],
        });
        spawned.push(next);
      }
      patchTasks(
        ids,
        (t) => (t.status === 'done' ? null : { status: 'done', completedAt: now }),
        () => activity('completed', 'Completed'),
      );
      if (spawned.length) set((s) => ({ tasks: { ...s.tasks, ...byId(spawned) } }));
      return { spawned };
    },

    reopen: (ids) =>
      patchTasks(
        ids,
        (t) => (t.status !== 'done' ? null : { status: 'open', completedAt: null }),
        () => activity('reopened', 'Reopened'),
      ),

    archive: (ids) =>
      patchTasks(ids, (t) => (t.archivedAt ? null : { archivedAt: nowIso() }), () => activity('archived', 'Archived')),

    remove: (ids) =>
      set((s) => {
        const tasks = { ...s.tasks };
        for (const id of ids) delete tasks[id];
        return { tasks };
      }),

    duplicate: (id) => {
      const t = get().tasks[id];
      if (!t) return null;
      const now = nowIso();
      const copy = createTask({
        ...t,
        id: createId('t_'),
        title: t.title,
        status: 'open',
        completedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        position: t.position + 0.5,
        subtasks: t.subtasks.map((s) => ({ ...s, id: createId('s_') })),
        links: t.links.map((l) => ({ ...l, id: createId('l_') })),
        activity: [activity('created', 'Duplicated', now)],
      });
      set((s) => ({ tasks: { ...s.tasks, [copy.id]: copy } }));
      return copy;
    },

    reorder: (id, prevId, nextId) => {
      const { tasks } = get();
      const prev = prevId ? tasks[prevId]?.position : undefined;
      const next = nextId ? tasks[nextId]?.position : undefined;
      let position: number;
      if (prev !== undefined && next !== undefined) position = (prev + next) / 2;
      else if (prev !== undefined) position = prev + 1024;
      else if (next !== undefined) position = next - 1024;
      else return;
      patchTasks([id], () => ({ position }));
    },

    markReminderFired: (id) => patchTasks([id], () => ({ reminderFiredAt: nowIso() })),

    addSubtask: (taskId, title) => {
      const clean = title.trim();
      if (!clean) return;
      patchTasks([taskId], (t) => ({
        subtasks: [...t.subtasks, { id: createId('s_'), title: clean, done: false, createdAt: nowIso() }],
      }));
    },
    updateSubtask: (taskId, subId, patch) =>
      patchTasks([taskId], (t) => ({ subtasks: t.subtasks.map((s) => (s.id === subId ? { ...s, ...patch } : s)) })),
    removeSubtask: (taskId, subId) =>
      patchTasks([taskId], (t) => ({ subtasks: t.subtasks.filter((s) => s.id !== subId) })),
    moveSubtask: (taskId, subId, delta) =>
      patchTasks([taskId], (t) => {
        const i = t.subtasks.findIndex((s) => s.id === subId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= t.subtasks.length) return null;
        const list = [...t.subtasks];
        [list[i], list[j]] = [list[j], list[i]];
        return { subtasks: list };
      }),
    addLink: (taskId, url, title) => {
      const clean = url.trim();
      if (!clean) return;
      const href = /^[a-z]+:\/\//i.test(clean) ? clean : `https://${clean}`;
      patchTasks([taskId], (t) => ({
        links: [...t.links, { id: createId('l_'), url: href, title: title?.trim() || hostOf(href), createdAt: nowIso() }],
      }));
    },
    removeLink: (taskId, linkId) => patchTasks([taskId], (t) => ({ links: t.links.filter((l) => l.id !== linkId) })),

    addProject: (fields) => {
      const positions = Object.values(get().projects).map((p) => p.position);
      const project = createProject({
        ...fields,
        name: fields.name.trim(),
        position: (positions.length ? Math.max(...positions) : 0) + 1,
      });
      set((s) => ({ projects: { ...s.projects, [project.id]: project } }));
      return project;
    },
    updateProject: (id, patch) =>
      set((s) => (s.projects[id] ? { projects: { ...s.projects, [id]: { ...s.projects[id], ...patch, updatedAt: nowIso() } } } : s)),
    archiveProject: (id) => get().updateProject(id, { archivedAt: nowIso() }),
    deleteProject: (id) => {
      const ids = Object.values(get().tasks).filter((t) => t.projectId === id).map((t) => t.id);
      patchTasks(ids, () => ({ projectId: null }));
      set((s) => {
        const projects = { ...s.projects };
        delete projects[id];
        return { projects };
      });
    },
    reorderProject: (id, prevId, nextId) => {
      const { projects } = get();
      const prev = prevId ? projects[prevId]?.position : undefined;
      const next = nextId ? projects[nextId]?.position : undefined;
      const position =
        prev !== undefined && next !== undefined ? (prev + next) / 2 : prev !== undefined ? prev + 1 : next !== undefined ? next - 1 : 0;
      get().updateProject(id, { position });
    },

    addPerson: (name) => {
      const existing = Object.values(get().people).find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing;
      const person = createPerson(name.trim());
      set((s) => ({ people: { ...s.people, [person.id]: person } }));
      return person;
    },

    saveView: (name, query) => {
      const now = nowIso();
      const view: SavedView = {
        id: createId('v_'),
        workspaceId: get().workspaceId,
        name: name.trim() || query,
        query,
        position: Object.keys(get().views).length + 1,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ views: { ...s.views, [view.id]: view } }));
      return view;
    },
    removeView: (id) =>
      set((s) => {
        const views = { ...s.views };
        delete views[id];
        return { views };
      }),

    setUserName: (name) => set((s) => ({ user: { ...s.user, name: name.trim(), updatedAt: nowIso() } })),
    setPreferences: (patch) =>
      set((s) => ({ user: { ...s.user, preferences: { ...s.user.preferences, ...patch }, updatedAt: nowIso() } })),

    resetToDemo: async () => {
      const snap = buildDemoWorkspace();
      await getRepository().replace(snap);
      hydrate(snap);
      undoStack.length = 0;
    },
    clearAll: async () => {
      const snap = { ...buildEmptyWorkspace(), user: get().user };
      await getRepository().replace(snap);
      hydrate(snap);
      undoStack.length = 0;
    },
    importSnapshot: async (snap) => {
      await getRepository().replace(snap);
      hydrate(snap);
      undoStack.length = 0;
    },
    exportSnapshot: () => {
      const s = get();
      return {
        schemaVersion: 1,
        workspace: { id: s.workspaceId, name: 'Personal' },
        user: s.user,
        tasks: Object.values(s.tasks),
        projects: Object.values(s.projects),
        people: Object.values(s.people),
        views: Object.values(s.views),
      };
    },

    transact: (fn) => {
      const before = { tasks: get().tasks, projects: get().projects };
      fn();
      const after = { tasks: get().tasks, projects: get().projects };
      const revert = <T,>(prev: Rec<T>, next: Rec<T>, current: Rec<T>): Rec<T> => {
        const out = { ...current };
        const ids = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const id of ids) {
          if (prev[id] === next[id]) continue;
          if (prev[id]) out[id] = prev[id];
          else delete out[id];
        }
        return out;
      };
      let undone = false;
      const undo = () => {
        if (undone) return;
        undone = true;
        const i = undoStack.indexOf(undo);
        if (i >= 0) undoStack.splice(i, 1);
        set((s) => ({
          tasks: revert(before.tasks, after.tasks, s.tasks),
          projects: revert(before.projects, after.projects, s.projects),
        }));
      };
      undoStack.push(undo);
      if (undoStack.length > 40) undoStack.shift();
      return undo;
    },

    undo: () => {
      const last = undoStack.pop();
      if (!last) return false;
      last();
      return true;
    },
  };
});

// ---- persistence: push row-level diffs to the repository --------------------

function diff<T extends { id: ID }>(prev: Rec<T>, next: Rec<T>) {
  if (prev === next) return undefined;
  const upsert: T[] = [];
  const remove: ID[] = [];
  for (const id in next) if (prev[id] !== next[id]) upsert.push(next[id]);
  for (const id in prev) if (!(id in next)) remove.push(id);
  return upsert.length || remove.length ? { upsert, remove } : undefined;
}

useWorkspace.subscribe((state, prev) => {
  if (hydrating || !state.ready || !prev.ready) return;
  const changes: ChangeSet = {
    tasks: diff(prev.tasks, state.tasks),
    projects: diff(prev.projects, state.projects),
    people: diff(prev.people, state.people),
    views: diff(prev.views, state.views),
    user: prev.user !== state.user ? state.user : undefined,
  };
  if (changes.tasks || changes.projects || changes.people || changes.views || changes.user) {
    void getRepository().apply(changes);
  }
});

export const ws = () => useWorkspace.getState();
