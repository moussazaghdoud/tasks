import { Check, ChevronRight, Crosshair, Link2, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { relativeTime } from '@/lib/dates';
import { cn, isModEvent } from '@/lib/platform';
import { anchorFromElement, ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toggleComplete } from '@/actions/taskActions';
import { Kbd } from '@/components/ui/Kbd';
import { Tooltip } from '@/components/ui/Tooltip';
import { TaskCheckbox } from '@/components/tasks/TaskCheckbox';
import { STATUS_META } from '@/components/pickers/SimplePickers';
import { AutoTextarea } from './AutoTextarea';
import { LinkList } from './LinkList';
import { PropertyBar } from './PropertyBar';
import { SubtaskList } from './SubtaskList';

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-1.5 flex items-center gap-2 pl-1.5">
        <h3 className="label-caps">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TitleEditor({ task }: { task: Task }) {
  const [value, setValue] = useState(task.title);
  useEffect(() => setValue(task.title), [task.title]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const tick = useUi((s) => (s.panelFocus?.section === 'title' ? s.panelFocus.tick : 0));
  useEffect(() => {
    if (tick) ref.current?.focus();
  }, [tick]);
  return (
    <AutoTextarea
      ref={ref}
      value={value}
      aria-label="Task title"
      onChange={(e) => setValue(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => (value.trim() ? ws().renameTask(task.id, value) : setValue(task.title))}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isModEvent(e)) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setValue(task.title);
          requestAnimationFrame(() => ref.current?.blur());
        }
      }}
      className={cn(
        'w-full bg-transparent text-[21px] leading-[28px] font-semibold tracking-[-0.015em] outline-none',
        task.status === 'done' ? 'text-ink-3' : 'text-ink',
      )}
    />
  );
}

function Notes({ task }: { task: Task }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const tick = useUi((s) => (s.panelFocus?.section === 'notes' ? s.panelFocus.tick : 0));
  useEffect(() => {
    if (tick) ref.current?.focus();
  }, [tick]);
  return (
    <AutoTextarea
      ref={ref}
      value={task.notes}
      onChange={(e) => ws().updateTask(task.id, { notes: e.target.value })}
      onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
      placeholder="Add notes, context, decisions…"
      aria-label="Notes"
      className="min-h-[60px] w-full rounded-[8px] bg-transparent px-1.5 py-1 text-[14px] leading-[22px] text-ink-2 outline-none placeholder:text-ink-4 focus:bg-wash"
    />
  );
}

export function TaskDetailPanel({ taskId, onClose, variant }: { taskId: string; onClose: () => void; variant: 'docked' | 'overlay' | 'sheet' }) {
  const task = useWorkspace((s) => s.tasks[taskId]);
  const project = useWorkspace((s) => (task?.projectId ? s.projects[task.projectId] : undefined));
  const [activityOpen, setActivityOpen] = useState(false);
  const [linkInput, setLinkInput] = useState(false);
  const subRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const panelFocus = useUi((s) => s.panelFocus);

  useEffect(() => {
    if (!panelFocus) return;
    if (panelFocus.section === 'subtask') subRef.current?.focus();
    if (panelFocus.section === 'link') {
      setLinkInput(true);
      requestAnimationFrame(() => linkRef.current?.focus());
    }
  }, [panelFocus]);

  useEffect(() => setLinkInput(false), [taskId]);

  if (!task) return null;
  const done = task.status === 'done';
  const Status = STATUS_META[task.status];
  const subDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div data-detail-panel className="flex h-full flex-col" aria-label={`Task: ${task.title}`}>
      {/* Header */}
      <div className={cn('flex shrink-0 items-center gap-1 px-4', variant === 'sheet' ? 'h-12' : 'h-14')}>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-meta text-ink-3">
          <button
            onClick={() => (project ? ui().navigate({ name: 'project', id: project.id }) : ui().navigate({ name: 'inbox' }))}
            className="truncate rounded-[5px] px-1.5 py-0.5 hover:bg-wash-strong hover:text-ink-2"
          >
            {project?.name ?? (task.dueDate || task.deferred ? 'No project' : 'Inbox')}
          </button>
        </div>
        {!done && (
          <Tooltip label="Focus on this" shortcut="f">
            <button aria-label="Focus on this task" onClick={() => ui().startFocus(task.id)} className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink">
              <Crosshair className="size-4" />
            </button>
          </Tooltip>
        )}
        <Tooltip label="Close" shortcut="esc">
          <button aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink">
            <X className="size-4" />
          </button>
        </Tooltip>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 max-md:px-5">
        <div className="flex items-start gap-2.5 pt-1">
          <TaskCheckbox checked={done} onToggle={() => toggleComplete(task.id)} label={task.title} size={20} className="-mt-px -ml-1" />
          <div className="min-w-0 flex-1">
            <TitleEditor task={task} />
            <div className="mt-1 flex items-center gap-1.5 text-meta text-ink-3">
              <button
                onClick={(e) => ui().openPicker({ kind: 'status', taskIds: [task.id], anchor: anchorFromElement(e.currentTarget) })}
                className="-ml-1 inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 hover:bg-wash-strong hover:text-ink-2"
              >
                <Status.icon className={cn('size-3.5', task.status === 'in_progress' && 'text-accent')} />
                {Status.label}
              </button>
              <span className="text-ink-4">·</span>
              <span>Added {relativeTime(task.createdAt)}</span>
              {done && task.completedAt && (
                <>
                  <span className="text-ink-4">·</span>
                  <span>Done {relativeTime(task.completedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 -ml-1">
          <PropertyBar task={task} />
        </div>

        <div className="mt-5 h-px bg-line" />

        <Section title="Notes">
          <Notes task={task} />
        </Section>

        <Section title="Subtasks" aside={task.subtasks.length > 0 && <span className="text-label text-ink-4 font-num">{subDone}/{task.subtasks.length}</span>}>
          {task.subtasks.length > 0 && (
            <div className="mb-1 ml-1.5 h-[3px] overflow-hidden rounded-full bg-wash-strong">
              <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(subDone / task.subtasks.length) * 100}%` }} />
            </div>
          )}
          <SubtaskList ref={subRef} task={task} />
        </Section>

        {(task.links.length > 0 || linkInput) && (
          <Section title="Links">
            <LinkList ref={linkRef} task={task} showInput={linkInput || task.links.length === 0} />
          </Section>
        )}
        {!linkInput && (
          <button
            onClick={() => {
              setLinkInput(true);
              requestAnimationFrame(() => linkRef.current?.focus());
            }}
            className="mt-3 ml-0.5 inline-flex h-7 items-center gap-2 rounded-[7px] px-1.5 text-meta font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink-2"
          >
            <Link2 className="size-3.5" /> Attach a link
          </button>
        )}

        <section className="mt-6">
          <button onClick={() => setActivityOpen((o) => !o)} aria-expanded={activityOpen} className="flex items-center gap-1.5 pl-1.5 text-ink-3 hover:text-ink-2">
            <ChevronRight className={cn('size-3.5 transition-transform', activityOpen && 'rotate-90')} />
            <span className="label-caps !text-inherit">Activity</span>
          </button>
          {activityOpen && (
            <ol className="mt-2 animate-fade border-l border-line pl-4 ml-3">
              {[...task.activity].reverse().map((a) => (
                <li key={a.id} className="relative py-1.5 text-meta">
                  <span className="absolute top-[13px] -left-[19.5px] size-[6px] rounded-full bg-line-strong" />
                  <span className="text-ink-2">{a.text}</span>
                  <span className="ml-2 text-ink-4">{relativeTime(a.at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3 pb-safe">
        <button
          onClick={() => toggleComplete(task.id)}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-[9px] px-3.5 text-ui font-medium transition-colors',
            done ? 'bg-wash-strong text-ink-2 hover:bg-sunk' : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          {done ? <RotateCcw className="size-4" /> : <Check className="size-4" strokeWidth={2.5} />}
          {done ? 'Reopen' : 'Complete'}
        </button>
        <span className="text-meta text-ink-4 max-md:hidden">
          <Kbd combo="mod+enter" subtle />
        </span>
      </div>
    </div>
  );
}
