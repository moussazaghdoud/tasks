import {
  Bookmark,
  CalendarDays,
  CircleCheck,
  Command,
  Flag,
  FolderPlus,
  Inbox,
  Keyboard,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Shuffle,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import type { ID, Task } from '@/domain/types';
import { dueLabelShort, todayKey } from '@/lib/dates';
import { markFresh } from '@/lib/fresh';
import { createId, nowIso } from '@/lib/id';
import { defaultDateOrder, hostOf, parseTask } from '@/lib/nlp';
import { parseQuery, scoreTitle } from '@/lib/search';
import { cn } from '@/lib/platform';
import { actionsFor, TASK_ACTIONS } from '@/actions/registry';
import { smartItems } from '@/actions/smartItems';
import { completeTasks } from '@/actions/taskActions';
import { BUILTIN_VIEWS } from '@/store/selectors';
import { toast } from '@/store/toast';
import { targetIds, ui, useUi, type PickerKind, type Route } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { Modal } from '@/components/ui/Modal';
import { Kbd } from '@/components/ui/Kbd';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { ListPicker, type PickItem } from '@/components/pickers/ListPicker';
import { PickerContent } from '@/components/pickers/PickerContent';
import { fieldsFromParse } from '@/components/tasks/parsedInput';
import { destinationLabel } from '@/components/tasks/TaskComposer';
import { TaskCheckbox } from '@/components/tasks/TaskCheckbox';

type Mode = { kind: 'root' } | { kind: 'picker'; picker: PickerKind; taskIds: ID[] };

const VIEWS: Array<{ route: Route; label: string; icon: React.ReactNode; words: string }> = [
  { route: { name: 'today' }, label: 'Today', icon: <Sun className="size-4" />, words: 'today home now' },
  { route: { name: 'upcoming' }, label: 'Upcoming', icon: <CalendarDays className="size-4" />, words: 'upcoming week calendar next' },
  { route: { name: 'inbox' }, label: 'Inbox', icon: <Inbox className="size-4" />, words: 'inbox captured unsorted' },
  { route: { name: 'important' }, label: 'Important', icon: <Flag className="size-4" />, words: 'important priority' },
  { route: { name: 'later' }, label: 'Later', icon: <Moon className="size-4" />, words: 'later someday backlog' },
];

function matches(text: string, q: string) {
  const t = text.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w) || t.split(/\s+/).some((x) => x.startsWith(w)));
}

export function CommandPalette() {
  const palette = useUi((s) => s.palette);
  const close = useUi((s) => s.closePalette);
  return (
    <Modal open={palette.open} onClose={close} label="Command palette" align="top" className="max-w-[640px] overflow-hidden" escapeKey={false}>
      {palette.open && <PaletteBody key={`${palette.kind ?? 'root'}-${palette.taskIds?.join(',') ?? ''}`} />}
    </Modal>
  );
}

function PaletteBody() {
  const palette = useUi((s) => s.palette);
  const close = useUi((s) => s.closePalette);
  const tasks = useWorkspace((s) => s.tasks);
  const projects = useWorkspace((s) => s.projects);
  const people = useWorkspace((s) => s.people);
  const savedViews = useWorkspace((s) => s.views);
  const [mode, setMode] = useState<Mode>(() =>
    palette.kind && palette.taskIds?.length ? { kind: 'picker', picker: palette.kind, taskIds: palette.taskIds } : { kind: 'root' },
  );
  // The task that "this" refers to when the palette opened.
  const [target] = useState<ID[]>(() => targetIds().filter((id) => tasks[id]));

  if (mode.kind === 'picker') {
    return (
      <PickerContent
        kind={mode.picker}
        taskIds={mode.taskIds}
        size="palette"
        onDone={close}
        onExit={palette.kind ? close : () => setMode({ kind: 'root' })}
      />
    );
  }

  const go = (route: Route) => () => {
    ui().navigate(route);
    close();
  };
  // Open in the side panel, wherever the user is — no jump to another view.
  const openTask = (id: ID) => () => {
    close();
    ui().openTask(id);
  };

  const createTask = (text: string) => {
    const r = parseTask(text, {
      projects: Object.values(projects).map((p) => ({ id: p.id, name: p.name })),
      people: Object.values(people).map((p) => ({ id: p.id, name: p.name })),
      dateOrder: defaultDateOrder(),
    });
    if (!r.title) return;
    const [t] = ws().addTasks([
      { ...fieldsFromParse(r), title: r.title, links: r.links.map((url) => ({ id: createId('l_'), url, title: hostOf(url), createdAt: nowIso() })) },
    ]);
    markFresh([t.id]);
    close();
    toast(`Added to ${destinationLabel(t)}`, { detail: t.title, action: { label: 'Open', run: () => ui().openTask(t.id) } });
  };

  const taskItem = (t: Task, section: string): PickItem => {
    const project = t.projectId ? projects[t.projectId] : null;
    return {
      id: `task-${t.id}`,
      taskId: t.id,
      section,
      text: t.title,
      label: <span className={cn(t.status === 'done' && 'text-ink-3 line-through decoration-ink-4')}>{t.title}</span>,
      icon: <TaskCheckbox checked={t.status === 'done'} onToggle={() => void completeTasks([t.id])} label={t.title} size={15} className="-m-1" />,
      hint: (
        <span className="flex items-center gap-2.5">
          {project && (
            <span className="flex items-center gap-1.5">
              <ProjectGlyph project={project} size={11} />
              {project.name}
            </span>
          )}
          {t.dueDate && <span className={cn(t.status !== 'done' && t.dueDate < todayKey() && 'text-ember')}>{dueLabelShort(t.dueDate)}</span>}
        </span>
      ),
      onSelect: openTask(t.id),
    };
  };

  const items = (raw: string): PickItem[] => {
    const q = raw.trim();
    const out: PickItem[] = [];
    const targetTasks = target.map((id) => tasks[id]).filter(Boolean);
    const targetName = targetTasks.length === 1 ? `“${targetTasks[0].title}”` : `${targetTasks.length} selected tasks`;

    // 1. Explicit creation: "new …", "add …", "+ …"
    const create = q.match(/^(?:new|add|create|\+)\s+(.+)$/i);
    if (create && !/^(project|view)\b/i.test(create[1])) {
      const r = parseTask(create[1], { projects: Object.values(projects), people: Object.values(people), dateOrder: defaultDateOrder() });
      const t = { ...fieldsFromParse({ ...r, newProjectName: undefined, newPersonName: undefined }) } as Partial<Task>;
      out.push({
        id: 'create-explicit',
        section: 'Create',
        text: q,
        icon: <Plus className="size-4 text-accent" />,
        label: (
          <>
            New task <span className="font-medium text-ink">{r.title || create[1]}</span>
          </>
        ),
        hint: t.dueDate ? dueLabelShort(t.dueDate) : t.projectId ? projects[t.projectId]?.name : 'Inbox',
        onSelect: () => createTask(create[1]),
      });
    }
    const newProject = q.match(/^(?:new|add|create)\s+project\s*(.*)$/i);
    if (newProject) {
      out.push({
        id: 'create-project',
        section: 'Create',
        text: q,
        icon: <FolderPlus className="size-4 text-accent" />,
        label: newProject[1] ? <>New project <span className="font-medium text-ink">{newProject[1]}</span></> : 'New project…',
        onSelect: () => {
          close();
          if (newProject[1]) {
            const p = ws().addProject({ name: newProject[1] });
            ui().navigate({ name: 'project', id: p.id });
          } else ui().setProjectDialog({});
        },
      });
    }

    // 2. Actions on the current task(s).
    if (targetTasks.length) {
      const section = targetTasks.length === 1 ? `Do with ${targetName.length > 44 ? targetName.slice(0, 42) + '…”' : targetName}` : `Do with ${targetName}`;
      const smart = smartItems(q, target, close).map((i) => ({ ...i, section }));
      const hasDate = smart.some((i) => i.id === 'nl-date');
      const defs = (
        q
          ? TASK_ACTIONS.filter((a) => (!a.single || targetTasks.length === 1) && (!a.visible || a.visible(targetTasks)) && matches(`${a.label(targetTasks)} ${a.keywords}`, q))
          : actionsFor(targetTasks).slice(0, 6)
      ).filter((a) => !(hasDate && ['today', 'tomorrow', 'nextweek'].includes(a.id)));
      out.push(
        ...smart,
        ...defs.slice(0, q ? 4 : 6).map<PickItem>((a) => {
          const Icon = a.icon;
          return {
            id: `act-${a.id}`,
            section,
            text: a.label(targetTasks),
            label: a.label(targetTasks),
            icon: <Icon className="size-4" />,
            shortcut: a.shortcut,
            danger: a.danger,
            onSelect: () => {
              if (a.picker) setMode({ kind: 'picker', picker: a.picker, taskIds: target });
              else {
                a.run?.(target);
                close();
              }
            },
          };
        }),
      );
    }

    // 3. Filters phrased naturally: "overdue", "completed last week", "#ips", "@claire".
    if (q) {
      const f = parseQuery(q, { projects: Object.values(projects), people: Object.values(people) });
      if (f.chips.length && !create) {
        out.push({
          id: 'filter',
          section: 'Show',
          text: q,
          icon: <Search className="size-4 text-accent" />,
          label: (
            <>
              Show <span className="font-medium text-ink">{f.chips.join(' · ').toLowerCase()}</span>
              {f.text.length > 0 && <> matching “{f.text.join(' ')}”</>}
            </>
          ),
          onSelect: go({ name: 'search', q }),
        });
      }
    }

    // 4. Tasks.
    if (q && !create) {
      const scored = Object.values(tasks)
        .filter((t) => !t.archivedAt)
        .map((t) => ({ t, s: scoreTitle(t.title, q) + (t.status === 'done' ? -30 : 0) }))
        .filter((x) => x.s > -30 && scoreTitle(x.t.title, q) > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 7);
      out.push(...scored.map(({ t }) => taskItem(t, 'Tasks')));
    }

    // 5. Places.
    const places: PickItem[] = [
      ...VIEWS.map((v) => ({ id: `view-${v.label}`, section: 'Go to', text: `${v.label} ${v.words}`, label: v.label, icon: v.icon, onSelect: go(v.route) })),
      ...Object.values(projects)
        .filter((p) => !p.archivedAt)
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ id: `proj-${p.id}`, section: 'Go to', text: `${p.name} project`, label: p.name, icon: <ProjectGlyph project={p} />, hint: 'Project', onSelect: go({ name: 'project', id: p.id }) })),
      ...BUILTIN_VIEWS.map((v) => ({ id: `sv-${v.id}`, section: 'Go to', text: `${v.name} ${v.query} view`, label: v.name, icon: <Bookmark className="size-4" />, hint: 'View', onSelect: go({ name: 'view', id: v.id }) })),
      ...Object.values(savedViews).map((v) => ({ id: `sv-${v.id}`, section: 'Go to', text: `${v.name} view`, label: v.name, icon: <Bookmark className="size-4" />, hint: 'Saved view', onSelect: go({ name: 'view', id: v.id }) })),
    ];
    const commands: PickItem[] = [
      { id: 'cmd-new', section: 'Commands', text: 'new task create add', label: 'New task', icon: <Plus className="size-4" />, shortcut: 'n', onSelect: () => (close(), ui().focusComposer()) },
      { id: 'cmd-project', section: 'Commands', text: 'new project create', label: 'New project…', icon: <FolderPlus className="size-4" />, onSelect: () => (close(), ui().setProjectDialog({})) },
      { id: 'cmd-triage', section: 'Commands', text: 'triage inbox sort process', label: 'Triage the inbox', icon: <Shuffle className="size-4" />, onSelect: () => (close(), ui().setTriage(true)) },
      { id: 'cmd-search', section: 'Commands', text: 'search find', label: 'Search tasks', icon: <Search className="size-4" />, shortcut: '/', onSelect: go({ name: 'search', q: '' }) },
      { id: 'cmd-sidebar', section: 'Commands', text: 'toggle sidebar collapse', label: 'Toggle sidebar', icon: <PanelLeft className="size-4" />, shortcut: '[', onSelect: () => (close(), ws().setPreferences({ sidebarCollapsed: !ws().user.preferences.sidebarCollapsed })) },
      { id: 'cmd-keys', section: 'Commands', text: 'keyboard shortcuts help keys', label: 'Keyboard shortcuts', icon: <Keyboard className="size-4" />, shortcut: '?', onSelect: () => (close(), ui().setShortcuts(true)) },
      { id: 'cmd-done', section: 'Commands', text: 'completed done recently finished', label: 'Completed recently', icon: <CircleCheck className="size-4" />, onSelect: go({ name: 'view', id: 'sv_completed' }) },
    ];
    if (q) {
      out.push(...places.filter((p) => matches(p.text, q)).slice(0, 5));
      out.push(...commands.filter((c) => matches(c.text, q)).slice(0, 3));
    } else {
      out.push(...places.slice(0, 5).concat(places.slice(5).filter((p) => p.id.startsWith('proj-'))));
      if (!targetTasks.length) out.push(...commands.slice(0, 3));
    }

    // 6. Fallbacks: always offer to create or search what was typed.
    if (q && !create && !newProject) {
      out.push({
        id: 'create',
        section: 'Create',
        text: q,
        icon: <Plus className="size-4 text-accent" />,
        label: (
          <>
            New task <span className="font-medium text-ink">“{q}”</span>
          </>
        ),
        onSelect: () => createTask(q),
      });
      out.push({ id: 'search', section: 'Create', text: q, icon: <Search className="size-4" />, label: <>Search for “{q}”</>, onSelect: go({ name: 'search', q }) });
    }
    return out;
  };

  return (
    <ListPicker
      items={items}
      filter={false}
      forceFocus
      size="palette"
      initialQuery={palette.query}
      placeholder={target.length ? 'Type a command, a task, or what to do with it…' : 'Search, jump, or type “new …” to add a task'}
      onClose={close}
      leading={<Command className="size-[18px] shrink-0 text-ink-4" />}
      empty="Nothing found."
      onKeyDown={(e, _q, active) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return true;
        }
        if (active?.taskId && e.key === 'Tab') {
          e.preventDefault();
          setMode({ kind: 'picker', picker: 'actions', taskIds: [active.taskId] });
          return true;
        }
        if (active?.taskId && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void completeTasks([active.taskId]);
          close();
          return true;
        }
      }}
      hints={(active) => (
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line px-5 text-meta text-ink-3">
          <span className="flex items-center gap-1.5">
            <Kbd combo="enter" /> {active?.taskId ? 'Open' : 'Select'}
          </span>
          {active?.taskId && (
            <>
              <span className="flex items-center gap-1.5">
                <Kbd combo="Tab" /> Actions
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd combo="mod+enter" /> Complete
              </span>
            </>
          )}
          <span className="flex-1" />
          <span className="max-sm:hidden">
            Try “new Call Nicolas fri 3pm”, “overdue”, “#ips”
          </span>
        </div>
      )}
      className="w-full"
    />
  );
}
