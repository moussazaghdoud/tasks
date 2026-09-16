import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Ellipsis } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { relativeTime } from '@/lib/dates';
import { isFresh } from '@/lib/fresh';
import { cn, isModEvent } from '@/lib/platform';
import { useUi, ui } from '@/store/ui';
import { registerCompletionAnimator, toggleComplete } from '@/actions/taskActions';
import { isCoarsePointer } from '@/hooks/useMediaQuery';
import { useSwipe } from '@/hooks/useSwipe';
import { QuickActions } from './QuickActions';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskMetadata, type MetaContext } from './TaskMetadata';
import { InlineTitleEditor } from './InlineTitleEditor';
import { useWorkspace } from '@/store/workspace';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';

export interface TaskRowProps {
  task: Task;
  ctx: MetaContext;
  listId: string;
  index: number;
  sortable?: boolean;
  /** Group date for Upcoming drops. */
  groupDate?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function TaskRowImpl({ task, ctx, listId, index, sortable = true, groupDate }: TaskRowProps) {
  const isCursor = useUi((s) => s.cursorId === task.id);
  const isOpen = useUi((s) => s.openTaskId === task.id);
  const isSelected = useUi((s) => s.selection.includes(task.id));
  const isEditing = useUi((s) => s.editingId === task.id);
  const done = task.status === 'done';

  const [completing, setCompleting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [enter] = useState(() => isFresh(task.id));
  const rowRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !sortable || isEditing || done,
    data: { type: 'task', listId, index, date: groupDate },
  });

  useEffect(() => {
    if (done) return;
    return registerCompletionAnimator(task.id, async () => {
      setCompleting(true);
      await wait(360);
      setCollapsed(true);
      await wait(200);
    });
  }, [task.id, done]);

  // If the completion is undone the row is re-rendered open: reset the animation state.
  useEffect(() => {
    if (!done) {
      setCompleting(false);
      setCollapsed(false);
    }
  }, [done]);

  const swipe = useSwipe({
    enabled: !isEditing,
    onRight: () => toggleComplete(task.id),
    onLeft: () => {
      const r = rowRef.current?.getBoundingClientRect();
      ui().openPicker({ kind: 'actions', taskIds: [task.id], anchor: r ? { x: r.left, y: r.top, width: r.width, height: r.height } : { x: 0, y: 0, width: 0, height: 0 } });
    },
  });

  const onRowClick = (e: React.MouseEvent) => {
    const s = ui();
    if (isModEvent(e)) {
      s.toggleSelected(task.id);
      s.setCursor(task.id);
      return;
    }
    if (e.shiftKey && s.cursorId) {
      const ids = s.visibleIds;
      const a = ids.indexOf(s.cursorId);
      const b = ids.indexOf(task.id);
      if (a >= 0 && b >= 0) {
        const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
        s.setSelection([...new Set([...s.selection, ...range])]);
        return;
      }
    }
    if (s.selection.length) s.setSelection([]);
    s.openTask(task.id);
  };

  const onTitleClick = (e: React.MouseEvent) => {
    if (isModEvent(e) || e.shiftKey || done) return;
    e.stopPropagation();
    if (isCoarsePointer()) {
      ui().openTask(task.id);
      return;
    }
    ui().setCursor(task.id);
    ui().setEditing(task.id);
  };

  const checked = done || completing;
  const important = task.priority === 'important' && !done;

  return (
    <div
      ref={setNodeRef}
      data-task-row={task.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('collapse-row relative', isDragging && 'z-10 opacity-40')}
      data-collapsed={collapsed}
    >
      {/* The negative margin gives the clipped wrapper room for the margin mark. */}
      <div className="-ml-4 pl-4">
        <div className="relative @container">
          {/* Swipe backdrop (touch only) */}
          {swipe.dx !== 0 && (
            <div
              className={cn(
                'absolute inset-0 flex items-center rounded-row px-4 text-white transition-colors',
                swipe.dx > 0 ? 'justify-start' : 'justify-end',
                swipe.dx > 0 ? (swipe.armed ? 'bg-accent' : 'bg-accent/50') : swipe.armed ? 'bg-ink-2' : 'bg-ink-3/60',
              )}
            >
              {swipe.dx > 0 ? <Check className="size-5" /> : <Ellipsis className="size-5" />}
            </div>
          )}
          <div
            {...attributes}
            {...listeners}
            ref={rowRef}
            data-row
            role="listitem"
            aria-roledescription="task"
            aria-describedby={undefined}
            aria-pressed={undefined}
            tabIndex={isCursor ? 0 : -1}
            aria-selected={isSelected}
            aria-label={task.title}
            onClick={onRowClick}
            onFocus={(e) => e.target === e.currentTarget && ui().setCursor(task.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              ui().setCursor(task.id);
              const s = ui();
              const ids = s.selection.includes(task.id) ? s.selection : [task.id];
              s.openPicker({ kind: 'actions', taskIds: ids, anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 } });
            }}
            onTouchStart={(e) => {
              listeners?.onTouchStart?.(e);
              swipe.handlers.onTouchStart(e);
            }}
            onTouchMove={swipe.handlers.onTouchMove}
            onTouchEnd={swipe.handlers.onTouchEnd}
            onTouchCancel={swipe.handlers.onTouchCancel}
            style={{ transform: swipe.dx ? `translateX(${swipe.dx}px)` : undefined, touchAction: 'pan-y' }}
            className={cn(
              'group/row relative flex h-10 cursor-default items-center gap-1 rounded-row pr-2 pl-1 outline-none select-none max-md:h-12',
              'transition-[background-color,box-shadow] duration-100',
              swipe.dx !== 0 ? 'bg-paper' : '',
              isSelected
                ? 'bg-accent-soft'
                : isOpen
                  ? 'bg-sunk/70'
                  : isCursor
                    ? 'bg-accent-wash shadow-[inset_2px_0_0_var(--color-accent)]'
                    : 'hover:bg-wash',
              isCursor && isSelected && 'shadow-[inset_2px_0_0_var(--color-accent)]',
              enter && 'animate-enter',
            )}
          >
            {important && (
              <span aria-label="Important" className="absolute top-1/2 -left-[11px] h-3.5 w-[3px] -translate-y-1/2 rounded-full bg-ember max-md:left-[1px] max-md:h-4" />
            )}
            <TaskCheckbox checked={checked} onToggle={() => toggleComplete(task.id)} label={task.title} muted={task.priority === 'low'} />

            {isEditing ? (
              <InlineTitleEditor task={task} />
            ) : (
              <>
                <span
                  onClick={onTitleClick}
                  className={cn(
                    'strike min-w-0 shrink truncate pl-1 text-task',
                    done ? 'text-ink-3' : task.priority === 'low' ? 'text-ink-2' : 'text-ink',
                    !done && 'cursor-text',
                  )}
                  data-on={checked}
                >
                  {task.title}
                </span>
                {!done && !completing && <QuickActions task={task} visible={isCursor && !isOpen} />}
                <span className="min-w-3 flex-1" />
                {done ? (
                  <DoneMeta task={task} hideProject={ctx.hideProject} />
                ) : (
                  <TaskMetadata task={task} ctx={ctx} className={cn(completing && 'opacity-40')} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DoneMeta({ task, hideProject }: { task: Task; hideProject?: boolean }) {
  const project = useWorkspace((s) => (task.projectId ? s.projects[task.projectId] : undefined));
  return (
    <span className="flex shrink-0 items-center gap-3 text-meta text-ink-4">
      {project && !hideProject && (
        <span className="inline-flex items-center gap-1.5 max-sm:hidden">
          <ProjectGlyph project={project} size={12} className="opacity-60" />
          {project.name}
        </span>
      )}
      {task.completedAt && <span>{relativeTime(task.completedAt)}</span>}
    </span>
  );
}

export const TaskRow = memo(TaskRowImpl);
