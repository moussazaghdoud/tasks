/**
 * Domain model.
 *
 * Every entity is a flat, independently persisted row keyed by `id` and scoped
 * by `workspaceId`, so the same shapes map onto a relational backend
 * (Postgres / Supabase) or a document store without translation.
 * Relations that are owned by a task (subtasks, links, activity) are embedded;
 * in a relational backend they would become child tables with `taskId`.
 */

export type ID = string;
/** Calendar date in local time, `YYYY-MM-DD`. */
export type DateKey = string;
/** Wall-clock time, `HH:mm` (24h). */
export type TimeKey = string;
/** ISO-8601 timestamp. */
export type Timestamp = string;

export type Priority = 'important' | 'normal' | 'low';
export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done';

export interface Subtask {
  id: ID;
  title: string;
  done: boolean;
  createdAt: Timestamp;
}

export interface TaskLink {
  id: ID;
  url: string;
  title: string;
  createdAt: Timestamp;
}

export type ActivityType =
  | 'created'
  | 'renamed'
  | 'scheduled'
  | 'unscheduled'
  | 'priority'
  | 'moved'
  | 'assigned'
  | 'status'
  | 'completed'
  | 'reopened'
  | 'reminder'
  | 'repeat'
  | 'archived'
  | 'restored'
  | 'note';

export interface ActivityEntry {
  id: ID;
  at: Timestamp;
  type: ActivityType;
  text: string;
  actorId: ID;
}

export type RecurrenceFreq = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Every N units. 1 = every day/week/month. */
  interval: number;
}

export interface Task {
  id: ID;
  workspaceId: ID;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: DateKey | null;
  dueTime: TimeKey | null;
  reminderAt: Timestamp | null;
  reminderFiredAt: Timestamp | null;
  /** Deliberately deferred ("Later") — takes the task out of the Inbox without a date. */
  deferred: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  archivedAt: Timestamp | null;
  projectId: ID | null;
  /** `null` means the task belongs to its creator. */
  assigneeId: ID | null;
  createdById: ID;
  estimatedMinutes: number | null;
  recurrence: RecurrenceRule | null;
  /** Fractional manual order; lower comes first. */
  position: number;
  subtasks: Subtask[];
  links: TaskLink[];
  tags: string[];
  dependencyIds: ID[];
  activity: ActivityEntry[];
}

export type ProjectIcon =
  | 'circle'
  | 'briefcase'
  | 'rocket'
  | 'users'
  | 'home'
  | 'globe'
  | 'chart'
  | 'book'
  | 'heart'
  | 'plane'
  | 'layers'
  | 'target';

export type Accent = 'petrol' | 'indigo' | 'ember' | 'olive' | 'plum' | 'ochre' | 'slate' | 'rose';

export interface Project {
  id: ID;
  workspaceId: ID;
  name: string;
  description: string;
  icon: ProjectIcon;
  accent: Accent;
  position: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  archivedAt: Timestamp | null;
}

/** Someone tasks can be assigned to. The current user is also a Person. */
export interface Person {
  id: ID;
  workspaceId: ID;
  name: string;
  email: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPreferences {
  timeFormat: '24h' | '12h';
  weekStartsOn: 0 | 1;
  sidebarCollapsed: boolean;
  viewsExpanded: boolean;
  /** BCP-47 language for voice capture, e.g. "en-US", "fr-FR". Defaults to the browser's. */
  voiceLang?: string;
}

export interface User {
  id: ID;
  name: string;
  email: string | null;
  avatar: string | null;
  preferences: UserPreferences;
  updatedAt: Timestamp;
}

/** A saved search, rendered in the sidebar under "Views". */
export interface SavedView {
  id: ID;
  workspaceId: ID;
  name: string;
  query: string;
  position: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Workspace {
  id: ID;
  name: string;
}

export interface WorkspaceSnapshot {
  schemaVersion: number;
  workspace: Workspace;
  user: User;
  tasks: Task[];
  projects: Project[];
  people: Person[];
  views: SavedView[];
}
