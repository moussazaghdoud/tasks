import { activity, ME } from '@/domain/factories';
import type { ID, Task } from '@/domain/types';
import { createId, nowIso } from '@/lib/id';
import { ACCENTS } from '@/components/ui/ProjectGlyph';
import { ws, type NewTaskInput } from '@/store/workspace';
import type { VoiceTaskDraft } from './types';

const norm = (s: string) => s.trim().toLowerCase();

/** Match a spoken project name to an existing project (exact, then prefix). */
export function findProject(name: string) {
  const projects = Object.values(ws().projects).filter((p) => !p.archivedAt);
  const n = norm(name);
  return projects.find((p) => norm(p.name) === n) ?? projects.find((p) => norm(p.name).startsWith(n) || n.startsWith(norm(p.name)));
}

/** Match a spoken name to a known person (full name, then first name). */
export function findPerson(name: string) {
  const people = Object.values(ws().people).filter((p) => p.id !== ME);
  const n = norm(name);
  return people.find((p) => norm(p.name) === n) ?? people.find((p) => norm(p.name).split(/\s+/)[0] === n.split(/\s+/)[0]);
}

function toInput(d: VoiceTaskDraft, transcript: string): NewTaskInput {
  const state = ws();
  let projectId: ID | null = null;
  if (d.project) {
    const existing = findProject(d.project);
    projectId = existing
      ? existing.id
      : state.addProject({ name: d.project, accent: ACCENTS[Object.keys(state.projects).length % ACCENTS.length] }).id;
  }
  let assigneeId: ID | null = null;
  if (d.assignee) assigneeId = (findPerson(d.assignee) ?? state.addPerson(d.assignee)).id;

  const now = nowIso();
  const heard = transcript.length > 280 ? `${transcript.slice(0, 278)}…` : transcript;
  return {
    title: d.title,
    notes: d.notes,
    dueDate: d.dueDate,
    dueTime: d.dueDate ? d.dueTime : null,
    priority: d.priority,
    projectId,
    assigneeId,
    recurrence: d.recurrence,
    estimatedMinutes: d.estimatedMinutes,
    subtasks: d.subtasks.map((title) => ({ id: createId('s_'), title, done: false, createdAt: now })),
    // Keep what was said, for provenance, without cluttering the notes.
    activity: [activity('created', `Captured by voice — “${heard}”`, now)],
  };
}

/** Create the confirmed drafts as real tasks. Returns the tasks and an undo. */
export function createFromDrafts(drafts: VoiceTaskDraft[], transcript: string): { tasks: Task[]; undo: () => void } {
  let tasks: Task[] = [];
  const undo = ws().transact(() => {
    tasks = ws().addTasks(drafts.map((d) => toInput(d, transcript)));
  });
  return { tasks, undo };
}
