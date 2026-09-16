import { createId, nowIso } from '@/lib/id';
import type { ActivityEntry, ActivityType, ID, Person, Project, Task } from './types';

export const ME: ID = 'me';
export const DEFAULT_WORKSPACE: ID = 'ws_personal';

export function createTask(fields: Partial<Task> & { title: string }): Task {
  const now = nowIso();
  const base: Task = {
    id: createId('t_'),
    workspaceId: DEFAULT_WORKSPACE,
    title: fields.title,
    notes: '',
    status: 'open',
    priority: 'normal',
    dueDate: null,
    dueTime: null,
    reminderAt: null,
    reminderFiredAt: null,
    deferred: false,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    projectId: null,
    assigneeId: null,
    createdById: ME,
    estimatedMinutes: null,
    recurrence: null,
    position: 0,
    subtasks: [],
    links: [],
    tags: [],
    dependencyIds: [],
    activity: [],
  };
  const task = { ...base, ...fields };
  if (!fields.activity) task.activity = [activity('created', 'Created', task.createdAt)];
  return task;
}

export function createProject(fields: Partial<Project> & { name: string }): Project {
  const now = nowIso();
  return {
    id: createId('p_'),
    workspaceId: DEFAULT_WORKSPACE,
    description: '',
    icon: 'circle',
    accent: 'petrol',
    position: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...fields,
  };
}

export function createPerson(name: string): Person {
  const now = nowIso();
  return {
    id: createId('u_'),
    workspaceId: DEFAULT_WORKSPACE,
    name,
    email: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function activity(type: ActivityType, text: string, at = nowIso()): ActivityEntry {
  return { id: createId('a_'), at, type, text, actorId: ME };
}

export const isDone = (t: Task) => t.status === 'done';
export const isLive = (t: Task) => !t.archivedAt;
