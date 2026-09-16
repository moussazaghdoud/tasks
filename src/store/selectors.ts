import { useMemo } from 'react';
import { ME } from '@/domain/factories';
import type { DateKey, ID, Person, Project, SavedView, Task } from '@/domain/types';
import { addDaysKey, daysBetween, fromKey, longDate, toKey, todayKey } from '@/lib/dates';
import { matchesQuery, parseQuery } from '@/lib/search';
import { useWorkspace } from './workspace';
import { useToday } from '@/hooks/useToday';

export const byPosition = (a: Task, b: Task) => a.position - b.position;
export const byDateThenPosition = (a: Task, b: Task) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') ||
  a.position - b.position;
const byCompletedDesc = (a: Task, b: Task) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '');

const isOpen = (t: Task) => t.status !== 'done' && !t.archivedAt;
const completedOn = (t: Task) => (t.completedAt ? toKey(new Date(t.completedAt)) : null);

export const isInbox = (t: Task) => isOpen(t) && !t.dueDate && !t.projectId && !t.deferred;
export const isLater = (t: Task) => isOpen(t) && !t.dueDate && (t.deferred || !!t.projectId);

export function useLiveTasks(): Task[] {
  const tasks = useWorkspace((s) => s.tasks);
  return useMemo(() => Object.values(tasks).filter((t) => !t.archivedAt), [tasks]);
}

export function useProjects(): Project[] {
  const projects = useWorkspace((s) => s.projects);
  return useMemo(() => Object.values(projects).filter((p) => !p.archivedAt).sort((a, b) => a.position - b.position), [projects]);
}

export function usePeople(): Person[] {
  const people = useWorkspace((s) => s.people);
  return useMemo(
    () => Object.values(people).sort((a, b) => (a.id === ME ? -1 : b.id === ME ? 1 : a.name.localeCompare(b.name))),
    [people],
  );
}

export interface TodayData {
  today: DateKey;
  open: Task[];
  overdue: Task[];
  next: Task[];
  completed: Task[];
}

export function useTodayData(): TodayData {
  const tasks = useLiveTasks();
  const today = useToday();
  return useMemo(() => {
    const open = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate <= today).sort(byPosition);
    const overdue = open.filter((t) => t.dueDate! < today);
    const horizon = addDaysKey(today, 7);
    const next = tasks
      .filter(
        (t) =>
          isOpen(t) &&
          t.dueDate &&
          t.dueDate > today &&
          t.dueDate <= horizon &&
          (t.dueDate === addDaysKey(today, 1) || t.priority === 'important'),
      )
      .sort(byDateThenPosition)
      .slice(0, 5);
    const completed = tasks.filter((t) => t.status === 'done' && completedOn(t) === today).sort(byCompletedDesc);
    return { today, open, overdue, next, completed };
  }, [tasks, today]);
}

export interface DayGroup {
  key: string;
  title: string;
  subtitle?: string;
  /** Concrete date for drops / quick add; absent for multi-day groups. */
  date?: DateKey;
  tasks: Task[];
}

export function useUpcomingGroups(): DayGroup[] {
  const tasks = useLiveTasks();
  const today = useToday();
  return useMemo(() => {
    const future = tasks.filter((t) => isOpen(t) && t.dueDate && t.dueDate > today).sort(byDateThenPosition);
    const groups: DayGroup[] = [];
    for (let i = 1; i <= 7; i++) {
      const date = addDaysKey(today, i);
      const d = fromKey(date);
      groups.push({
        key: date,
        date,
        title: i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }),
        subtitle: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tasks: future.filter((t) => t.dueDate === date),
      });
    }
    const beyond = future.filter((t) => daysBetween(today, t.dueDate!) > 7);
    const months = new Map<string, Task[]>();
    for (const t of beyond) {
      const k = t.dueDate!.slice(0, 7);
      months.set(k, [...(months.get(k) ?? []), t]);
    }
    const thisMonth = today.slice(0, 7);
    for (const [k, list] of months) {
      const d = fromKey(`${k}-01`);
      const sameYear = k.slice(0, 4) === today.slice(0, 4);
      const month = d.toLocaleDateString('en-US', { month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
      groups.push({ key: k, title: k === thisMonth ? `Later in ${month}` : month, tasks: list });
    }
    return groups;
  }, [tasks, today]);
}

export function useInboxData() {
  const tasks = useLiveTasks();
  const today = useToday();
  return useMemo(() => {
    const open = tasks.filter(isInbox).sort(byPosition);
    const weekAgo = addDaysKey(today, -7);
    const completed = tasks
      .filter((t) => t.status === 'done' && !t.projectId && !t.dueDate && (completedOn(t) ?? '') >= weekAgo)
      .sort(byCompletedDesc);
    return { open, completed };
  }, [tasks, today]);
}

export function useLaterData() {
  const tasks = useLiveTasks();
  return useMemo(() => ({ open: tasks.filter(isLater).sort(byPosition), completed: [] as Task[] }), [tasks]);
}

export function useImportantData() {
  const tasks = useLiveTasks();
  const today = useToday();
  return useMemo(() => {
    const open = tasks.filter((t) => isOpen(t) && t.priority === 'important').sort(byDateThenPosition);
    const weekAgo = addDaysKey(today, -7);
    const completed = tasks
      .filter((t) => t.status === 'done' && t.priority === 'important' && (completedOn(t) ?? '') >= weekAgo)
      .sort(byCompletedDesc);
    return { open, completed };
  }, [tasks, today]);
}

export function useProjectData(projectId: ID) {
  const tasks = useLiveTasks();
  return useMemo(() => {
    const inProject = tasks.filter((t) => t.projectId === projectId);
    return {
      open: inProject.filter(isOpen).sort(byPosition),
      completed: inProject.filter((t) => t.status === 'done').sort(byCompletedDesc),
    };
  }, [tasks, projectId]);
}

export const BUILTIN_VIEWS: Array<Pick<SavedView, 'id' | 'name' | 'query'> & { hint: string }> = [
  { id: 'sv_mine', name: 'Assigned to me', query: 'mine', hint: 'Everything that is yours to do' },
  { id: 'sv_delegated', name: 'Delegated', query: 'delegated', hint: 'Assigned to someone else' },
  { id: 'sv_overdue', name: 'Overdue', query: 'overdue', hint: 'Past their date' },
  { id: 'sv_nodate', name: 'No due date', query: 'no date', hint: 'Open tasks without a date' },
  { id: 'sv_important_week', name: 'Important this week', query: 'important this week', hint: 'Important and due within 7 days' },
  { id: 'sv_completed', name: 'Completed recently', query: 'completed recently', hint: 'Done in the last 7 days' },
];

export function useQueryResults(query: string) {
  const tasks = useLiveTasks();
  const projectsRec = useWorkspace((s) => s.projects);
  const peopleRec = useWorkspace((s) => s.people);
  const weekStartsOn = useWorkspace((s) => s.user.preferences.weekStartsOn);
  const today = useToday();
  return useMemo(() => {
    const filters = parseQuery(query, {
      projects: Object.values(projectsRec),
      people: Object.values(peopleRec),
      today,
      weekStartsOn,
    });
    const ctx = { projects: projectsRec, people: peopleRec, me: ME, today };
    const matches = tasks.filter((t) => matchesQuery(t, filters, ctx));
    const open = matches.filter((t) => t.status !== 'done').sort(byDateThenPosition);
    const completed = matches.filter((t) => t.status === 'done').sort(byCompletedDesc);
    return { filters, open, completed };
  }, [tasks, projectsRec, peopleRec, query, today, weekStartsOn]);
}

export function useCounts() {
  const tasks = useLiveTasks();
  const today = useToday();
  return useMemo(() => {
    let todayCount = 0;
    let inbox = 0;
    for (const t of tasks) {
      if (isOpen(t) && t.dueDate && t.dueDate <= today) todayCount++;
      if (isInbox(t)) inbox++;
    }
    return { today: todayCount, inbox };
  }, [tasks, today]);
}

export function todayHeading(today = todayKey()) {
  return longDate(today);
}
