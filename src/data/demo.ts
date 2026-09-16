import { activity, createPerson, createProject, createTask, DEFAULT_WORKSPACE, ME } from '@/domain/factories';
import type { Person, Priority, Project, Task, WorkspaceSnapshot } from '@/domain/types';
import { addDaysKey, detectTimeFormat, todayKey, toDate } from '@/lib/dates';
import { createId, nowIso } from '@/lib/id';
import { SCHEMA_VERSION } from './repository';

/** Realistic starter workspace: one executive's week. Dates are relative to today. */
export function buildDemoWorkspace(now = new Date()): WorkspaceSnapshot {
  const today = todayKey(now);
  const day = (n: number) => addDaysKey(today, n);
  const ago = (days: number, hour = 9) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, 12, 0, 0);
    return d.toISOString();
  };

  const project = (id: string, name: string, accent: Project['accent'], icon: Project['icon'], description: string, position: number) =>
    createProject({ id, name, accent, icon, description, position, createdAt: ago(40), updatedAt: ago(40) });

  const projects: Project[] = [
    project('p_ips', 'IPS', 'indigo', 'chart', 'Q4 business, pipeline and partner program.', 1),
    project('p_rainbow', 'Rainbow', 'petrol', 'layers', 'Rainbow Edge product line — roadmap, pricing, launch.', 2),
    project('p_people', 'People', 'ochre', 'users', 'Hiring, 1:1s and team health.', 3),
    project('p_personal', 'Personal', 'olive', 'home', '', 4),
  ];

  const person = (id: string, name: string, email: string): Person => ({ ...createPerson(name), id, email });
  const people: Person[] = [
    person(ME, 'You', ''),
    person('u_nicolas', 'Nicolas Martin', 'nicolas.martin@example.com'),
    person('u_thierry', 'Thierry Dubois', 'thierry.dubois@example.com'),
    person('u_claire', 'Claire Laurent', 'claire.laurent@example.com'),
    person('u_sofia', 'Sofia Reyes', 'sofia.reyes@example.com'),
    person('u_anand', 'Anand Mehta', 'anand.mehta@example.com'),
  ];

  let pos = 0;
  const sub = (title: string, done = false) => ({ id: createId('s_'), title, done, createdAt: ago(3) });
  const link = (url: string, title: string) => ({ id: createId('l_'), url, title, createdAt: ago(2) });

  type Seed = Partial<Task> & { title: string; created?: number; priority?: Priority };
  const t = ({ created = 2, ...fields }: Seed): Task => {
    const createdAt = ago(created);
    return createTask({ position: ++pos * 1000, createdAt, updatedAt: createdAt, activity: [activity('created', 'Created', createdAt)], ...fields });
  };
  const done = (fields: Seed, daysAgo: number, hour = 11): Task => {
    const completedAt = ago(daysAgo, hour);
    const task = t({ ...fields, status: 'done', completedAt, created: daysAgo + 2 });
    task.activity.push(activity('completed', 'Completed', completedAt));
    return task;
  };

  const reminderToday = toDate(today, '13:50');
  const tasks: Task[] = [
    // ---- Today ------------------------------------------------------------
    t({
      title: 'Finalize Q4 business review',
      projectId: 'p_ips',
      priority: 'important',
      dueDate: today,
      estimatedMinutes: 90,
      notes:
        'Storyline: momentum in partner revenue, cost discipline, three bets for Q1.\nKeep it to 12 slides — appendix for regional detail.',
      subtasks: [
        sub('Consolidate regional forecasts', true),
        sub('Update pipeline slide', true),
        sub('Draft executive summary'),
        sub('Rehearse with Claire'),
      ],
      links: [link('https://docs.example.com/q4-business-review', 'Q4 business review — deck')],
    }),
    t({
      title: 'Call Nicolas about candidate',
      projectId: 'p_people',
      dueDate: today,
      dueTime: '14:00',
      reminderAt: reminderToday > now ? reminderToday.toISOString() : null,
      notes: 'Senior PM candidate (ex-Schneider). Decide on second round and who joins the panel.',
    }),
    t({
      title: 'Review Rainbow Edge roadmap',
      projectId: 'p_rainbow',
      dueDate: today,
      estimatedMinutes: 45,
      links: [link('https://docs.example.com/rainbow-edge-roadmap', 'Rainbow Edge roadmap H1')],
    }),
    t({ title: 'Approve September marketing budget', projectId: 'p_ips', dueDate: today, dueTime: '17:30' }),
    t({
      title: 'Follow up with Thierry on partner terms',
      projectId: 'p_ips',
      dueDate: day(-2),
      priority: 'important',
      notes: 'He owes us the revised revenue-share proposal. Push for a decision before the board.',
    }),
    t({ title: 'Sign off travel policy update', dueDate: day(-1), priority: 'low', projectId: 'p_people' }),

    // ---- Upcoming ---------------------------------------------------------
    t({ title: 'Review September sales numbers', projectId: 'p_ips', dueDate: day(1), dueTime: '10:00' }),
    t({
      title: 'Book India travel',
      projectId: 'p_personal',
      dueDate: day(1),
      notes: 'Bangalore then Pune, 12–18 October. Aisle seat, hotel near the office.',
      subtasks: [sub('Flights'), sub('Hotel in Bangalore'), sub('Visa check')],
    }),
    t({
      title: '1:1 with Claire',
      projectId: 'p_people',
      dueDate: day(2),
      dueTime: '09:30',
      recurrence: { freq: 'weekly', interval: 1 },
    }),
    t({
      title: 'Prepare Rainbow Edge pricing scenarios',
      projectId: 'p_rainbow',
      dueDate: day(3),
      dueTime: '15:00',
      assigneeId: 'u_sofia',
      status: 'in_progress',
    }),
    t({
      title: 'Prepare board presentation',
      projectId: 'p_ips',
      dueDate: day(4),
      priority: 'important',
      estimatedMinutes: 120,
      subtasks: [sub('Collect KPIs from finance'), sub('Draft narrative'), sub('Review with Nicolas')],
    }),
    t({
      title: 'Legal review of partner contract',
      projectId: 'p_ips',
      dueDate: day(5),
      assigneeId: 'u_thierry',
      status: 'waiting',
    }),
    t({ title: 'Send offer to Anand', projectId: 'p_people', dueDate: day(7), priority: 'important' }),
    t({ title: 'Quarterly partner newsletter', projectId: 'p_ips', dueDate: day(11), priority: 'low' }),
    t({ title: 'Renew passport', projectId: 'p_personal', dueDate: day(17) }),

    // ---- Inbox --------------------------------------------------------------
    t({ title: 'Read Gartner note on edge computing', created: 1 }),
    t({ title: 'Customer advisory board for Rainbow?', created: 1 }),
    t({ title: 'Ask Thierry for an intro to the Bosch contact', created: 0 }),
    t({ title: 'Check airline miles balance', created: 0 }),

    // ---- Later --------------------------------------------------------------
    t({ title: 'Rethink weekly reporting format', projectId: 'p_ips', created: 9 }),
    t({ title: 'Plan team offsite for Q1', projectId: 'p_people', created: 12 }),
    t({ title: 'Write Rainbow Edge launch narrative', projectId: 'p_rainbow', priority: 'important', created: 6 }),
    t({ title: 'Learn the basics of Hindi', deferred: true, created: 20 }),

    // ---- Completed ----------------------------------------------------------
    done({ title: 'Send agenda for leadership sync', projectId: 'p_ips', dueDate: today }, 0, Math.min(now.getHours(), 9)),
    done({ title: 'Review Q3 churn analysis', projectId: 'p_rainbow', dueDate: day(-1) }, 1),
    done({ title: 'Confirm dinner with Sofia', projectId: 'p_personal', dueDate: day(-3) }, 3),
  ];

  const stamp = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    workspace: { id: DEFAULT_WORKSPACE, name: 'Personal' },
    user: {
      id: ME,
      name: '',
      email: null,
      avatar: null,
      preferences: { timeFormat: detectTimeFormat(), weekStartsOn: 1, sidebarCollapsed: false, viewsExpanded: false },
      updatedAt: stamp,
    },
    tasks,
    projects,
    people,
    views: [],
  };
}

export function buildEmptyWorkspace(): WorkspaceSnapshot {
  const demo = buildDemoWorkspace();
  return { ...demo, tasks: [], projects: [], people: demo.people.filter((p) => p.id === ME), views: [] };
}
