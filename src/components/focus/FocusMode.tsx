import { ArrowRight, Check, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatingFocusManager, FloatingPortal, useFloating } from '@floating-ui/react';
import type { ID } from '@/domain/types';
import { dueLabel, formatDuration, formatTime } from '@/lib/dates';
import { cn, isModEvent, isTypingTarget } from '@/lib/platform';
import { useTodayData } from '@/store/selectors';
import { useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { completeTasks } from '@/actions/taskActions';
import { Kbd } from '@/components/ui/Kbd';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { AutoTextarea } from '@/components/detail/AutoTextarea';
import { SubtaskList } from '@/components/detail/SubtaskList';

const PRESETS = [15, 25, 45, 60, 90];

function useTimer(initialMinutes: number) {
  const [total, setTotal] = useState(initialMinutes * 60);
  const [left, setLeft] = useState(initialMinutes * 60);
  const [running, setRunning] = useState(false);
  const endAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    endAt.current = Date.now() + left * 1000;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.round((endAt.current! - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        setRunning(false);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Time’s up', { body: 'Focus session finished.' });
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const set = (minutes: number) => {
    setRunning(false);
    setTotal(minutes * 60);
    setLeft(minutes * 60);
  };
  return { total, left, running, toggle: () => setRunning((r) => (left === 0 ? false : !r)), reset: () => set(total / 60), set };
}

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

function FocusBody({ taskId, onExit }: { taskId: ID; onExit: () => void }) {
  const task = useWorkspace((s) => s.tasks[taskId]);
  const project = useWorkspace((s) => (task?.projectId ? s.projects[task.projectId] : undefined));
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const { open } = useTodayData();
  const startFocus = useUi((s) => s.startFocus);
  const timer = useTimer(task?.estimatedMinutes && task.estimatedMinutes <= 90 ? task.estimatedMinutes : 25);
  const [leaving, setLeaving] = useState(false);

  const queue = useMemo(() => open.filter((t) => t.id !== taskId), [open, taskId]);
  const index = open.findIndex((t) => t.id === taskId);
  const next = index >= 0 ? (open[index + 1] ?? queue[0]) : queue[0];

  useEffect(() => {
    const prev = document.title;
    if (task) document.title = timer.running ? `${clock(timer.left)} · ${task.title}` : `Focus · ${task.title}`;
    return () => void (document.title = prev);
  }, [timer.running, timer.left, task]);

  const complete = async () => {
    setLeaving(true);
    await completeTasks([taskId]);
    if (next) startFocus(next.id);
    setLeaving(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTypingTarget(e.target)) {
        e.preventDefault();
        onExit();
      } else if (e.key === 'Enter' && isModEvent(e)) {
        e.preventDefault();
        void complete();
      } else if (isTypingTarget(e.target)) {
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        timer.toggle();
      } else if ((e.key === 'ArrowRight' || e.key === 'n') && next) {
        e.preventDefault();
        startFocus(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!task || task.status === 'done') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-[34px] leading-10 text-ink">Everything planned for today is done.</p>
        <p className="mt-3 text-ink-3">Nothing else is scheduled for today.</p>
        <button onClick={onExit} className="mt-8 h-10 rounded-[10px] bg-accent px-5 font-medium text-white hover:bg-accent-hover">
          Back to Today
        </button>
      </div>
    );
  }

  const progress = timer.total ? 1 - timer.left / timer.total : 0;

  return (
    <div className={cn('mx-auto flex w-full max-w-[680px] flex-1 flex-col px-6 pt-[9vh] pb-10 transition-opacity duration-200 max-md:pt-8', leaving && 'opacity-40')}>
      <div className="flex items-center gap-2 text-meta text-ink-3">
        {project && (
          <span className="inline-flex items-center gap-1.5">
            <ProjectGlyph project={project} size={12} />
            {project.name}
          </span>
        )}
        {task.dueDate && (
          <>
            {project && <span className="text-ink-4">·</span>}
            <span>
              {dueLabel(task.dueDate)}
              {task.dueTime && ` at ${formatTime(task.dueTime, fmt)}`}
            </span>
          </>
        )}
        {task.priority === 'important' && (
          <>
            <span className="text-ink-4">·</span>
            <span className="text-ember">Important</span>
          </>
        )}
      </div>

      <h1 className="mt-3 text-[34px] leading-[42px] font-semibold tracking-[-0.022em] text-ink max-md:text-[28px] max-md:leading-9">{task.title}</h1>

      {/* Timer */}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <span className={cn('font-num text-[44px] leading-none font-light tracking-[-0.02em]', timer.running ? 'text-ink' : 'text-ink-2')}>{clock(timer.left)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={timer.toggle}
            aria-label={timer.running ? 'Pause timer' : 'Start timer'}
            className="grid size-10 place-items-center rounded-full bg-ink text-paper transition-transform hover:scale-[1.04] active:scale-95"
          >
            {timer.running ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4 translate-x-px" fill="currentColor" />}
          </button>
          <button onClick={timer.reset} aria-label="Reset timer" className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-wash-strong hover:text-ink">
            <RotateCcw className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => timer.set(m)}
              className={cn(
                'h-7 rounded-[7px] px-2 text-meta font-medium transition-colors font-num',
                timer.total === m * 60 ? 'bg-wash-strong text-ink' : 'text-ink-3 hover:bg-wash hover:text-ink-2',
              )}
            >
              {formatDuration(m)}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 h-[2px] overflow-hidden rounded-full bg-wash-strong">
        <div className="h-full bg-accent transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Notes */}
      <section className="mt-8">
        <h2 className="label-caps mb-1.5 pl-1.5">Notes</h2>
        <AutoTextarea
          value={task.notes}
          onChange={(e) => ws().updateTask(task.id, { notes: e.target.value })}
          placeholder="Jot down thoughts as you work…"
          className="w-full rounded-[8px] bg-transparent px-1.5 py-1 text-[15px] leading-[24px] text-ink-2 outline-none placeholder:text-ink-4 focus:bg-wash"
        />
      </section>

      <section className="mt-6">
        <h2 className="label-caps mb-1.5 pl-1.5">Steps</h2>
        <SubtaskList task={task} size="focus" />
      </section>

      <div className="flex-1" />

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <button
          onClick={() => void complete()}
          className="inline-flex h-11 items-center gap-2 rounded-[11px] bg-accent px-5 text-[14.5px] font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Check className="size-[18px]" strokeWidth={2.5} /> Done
        </button>
        {next && (
          <button
            onClick={() => startFocus(next.id)}
            className="group inline-flex h-11 min-w-0 items-center gap-2 rounded-[11px] px-3 text-ui text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink-2"
          >
            <span className="shrink-0">Next:</span>
            <span className="truncate font-medium text-ink-2">{next.title}</span>
            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-4 max-md:hidden">
        <span className="flex items-center gap-1.5"><Kbd combo="mod+enter" subtle /> done</span>
        <span className="flex items-center gap-1.5"><Kbd combo="space" subtle /> start / pause</span>
        {next && <span className="flex items-center gap-1.5"><Kbd combo="→" subtle /> next task</span>}
      </p>
    </div>
  );
}

export function FocusMode() {
  const taskId = useUi((s) => s.focusTaskId);
  const stop = useUi((s) => s.stopFocus);
  const { refs, context } = useFloating({ open: !!taskId });
  if (!taskId) return null;
  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} initialFocus={-1}>
        <div ref={refs.setFloating} role="dialog" aria-label="Focus mode" className="fixed inset-0 z-[75] flex animate-fade flex-col overflow-y-auto bg-paper">
          <div className="flex h-14 shrink-0 items-center justify-between px-5">
            <span className="flex items-center gap-2 text-meta font-medium text-ink-3">
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-accent/40 [animation-duration:2.4s]" />
                <span className="relative size-2 rounded-full bg-accent" />
              </span>
              Focus
            </span>
            <button onClick={stop} className="flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-meta font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink">
              <Kbd combo="esc" subtle /> Exit
              <X className="size-4" />
            </button>
          </div>
          <FocusBody key={taskId} taskId={taskId} onExit={stop} />
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}
