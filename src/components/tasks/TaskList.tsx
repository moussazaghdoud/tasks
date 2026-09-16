import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Task } from '@/domain/types';
import { cn } from '@/lib/platform';
import { useUi } from '@/store/ui';
import { TaskRow } from './TaskRow';
import type { MetaContext } from './TaskMetadata';

/** Lists currently on screen, so drag & drop can compute neighbours after a drop. */
export const listRegistry = new Map<string, { ids: string[]; date?: string }>();

interface TaskListProps {
  listId: string;
  tasks: Task[];
  ctx?: MetaContext;
  sortable?: boolean;
  /** For day groups: dropping here schedules onto this date. */
  date?: string;
  empty?: ReactNode;
  className?: string;
}

export function TaskList({ listId, tasks, ctx = {}, sortable = true, date, empty, className }: TaskListProps) {
  const ids = tasks.map((t) => t.id);
  listRegistry.set(listId, { ids, date });
  useEffect(() => () => void listRegistry.delete(listId), [listId]);

  const { setNodeRef, isOver } = useDroppable({ id: `list:${listId}`, data: { type: 'list', listId, date, empty: tasks.length === 0 } });
  const dragging = useUi((s) => s.dragging);

  return (
    <SortableContext id={listId} items={ids} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        role="list"
        className={cn('relative rounded-row transition-colors', dragging && isOver && tasks.length === 0 && 'bg-accent-wash', className)}
      >
        {tasks.map((t, i) => (
          <TaskRow key={t.id} task={t} ctx={ctx} listId={listId} index={i} sortable={sortable} groupDate={date} />
        ))}
        {tasks.length === 0 && empty}
      </div>
    </SortableContext>
  );
}

export function SectionHeader({ title, count, children, className }: { title: ReactNode; count?: number; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-8 items-center gap-2 pl-1', className)}>
      <h2 className="label-caps">{title}</h2>
      {count !== undefined && count > 0 && <span className="text-label font-medium text-ink-4 font-num">{count}</span>}
      <span className="flex-1" />
      {children}
    </div>
  );
}

/** Completed tasks, collapsed by default. Reopening is one click on the circle. */
export function CompletedSection({ listId, tasks, ctx, label = 'Completed' }: { listId: string; tasks: Task[]; ctx?: MetaContext; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!tasks.length) return null;
  return (
    <section className="mt-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-[6px] pr-2 pl-1 text-ink-3 transition-colors hover:text-ink-2"
      >
        <ChevronRight className={cn('size-3.5 transition-transform duration-150', open && 'rotate-90')} />
        <span className="label-caps !text-inherit">{label}</span>
        <span className="text-label font-medium text-ink-4 font-num">{tasks.length}</span>
      </button>
      {open && (
        <div className="animate-fade">
          <TaskList listId={listId} tasks={tasks} ctx={ctx} sortable={false} />
        </div>
      )}
    </section>
  );
}
