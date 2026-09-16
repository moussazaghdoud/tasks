import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { FloatingOverlay, FloatingPortal } from '@floating-ui/react';
import { cn } from '@/lib/platform';
import { Command } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ID } from '@/domain/types';
import { addDaysKey, nextWeekKey, todayKey } from '@/lib/dates';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { deferLater, moveTo, schedule } from '@/actions/taskActions';
import { useIsMobile, useIsWide } from '@/hooks/useMediaQuery';
import { TaskDetailPanel } from '@/components/detail/TaskDetailPanel';
import { listRegistry } from '@/components/tasks/TaskList';
import { SelectionBar } from '@/components/tasks/SelectionBar';
import { TodayView } from '@/views/TodayView';
import { UpcomingView } from '@/views/UpcomingView';
import { ImportantView, InboxView, LaterView } from '@/views/ListViews';
import { ProjectView } from '@/views/ProjectView';
import { SavedViewPage, SearchView } from '@/views/SearchView';
import { Sidebar } from './Sidebar';
import { MobileNavigation } from './MobileNavigation';
import { Wordmark } from './BrandMark';
import { VoiceButton } from '@/components/voice/VoiceButton';

function CurrentView() {
  const route = useUi((s) => s.route);
  switch (route.name) {
    case 'today':
      return <TodayView />;
    case 'upcoming':
      return <UpcomingView />;
    case 'inbox':
      return <InboxView />;
    case 'important':
      return <ImportantView />;
    case 'later':
      return <LaterView />;
    case 'project':
      return <ProjectView key={route.id} id={route.id} />;
    case 'search':
      return <SearchView q={route.q} />;
    case 'view':
      return <SavedViewPage key={route.id} id={route.id} />;
  }
}

const dataOf = (args: Parameters<CollisionDetection>[0], id: string | number) => args.droppableContainers.find((d) => d.id === id)?.data.current;

/**
 * Sidebar targets win when the pointer is over them; otherwise the task sorts
 * within whichever list is under the pointer (or its own list, if the pointer
 * is still over the main sheet).
 */
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const target = within.find((c) => String(c.id).startsWith('target:'));
  if (target) return [target];
  const list = within.find((c) => String(c.id).startsWith('list:'));
  let listId: string | undefined = list ? dataOf(args, list.id)?.listId : undefined;
  if (list && dataOf(args, list.id)?.empty) return [list];
  if (!listId) {
    const sheet = document.getElementById('main-sheet')?.getBoundingClientRect();
    const p = args.pointerCoordinates;
    if (!sheet || !p || p.x < sheet.left || p.x > sheet.right) return [];
    listId = args.active.data.current?.listId;
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((d) => d.data.current?.type === 'task' && d.data.current?.listId === listId),
  });
};

function handleDrop(e: DragEndEvent) {
  const { active, over } = e;
  if (!over) return;
  const id = String(active.id);
  const overId = String(over.id);
  const today = todayKey();

  if (overId.startsWith('target:')) {
    const t = overId.slice('target:'.length);
    if (t === 'today') schedule([id], today, undefined);
    else if (t === 'tomorrow') schedule([id], addDaysKey(today, 1), undefined);
    else if (t === 'nextweek') schedule([id], nextWeekKey(today, ws().user.preferences.weekStartsOn), undefined);
    else if (t === 'later') deferLater([id]);
    else if (t === 'important') {
      ws().setPriority([id], 'important');
      toast('Marked important');
    } else if (t === 'inbox') {
      const undo = ws().transact(() => {
        ws().setDue([id], null);
        ws().moveToProject([id], null);
        ws().updateTask(id, { deferred: false });
      });
      toast('Back in the Inbox', { action: { label: 'Undo', run: undo } });
    } else if (t.startsWith('project:')) moveTo([id], t.slice('project:'.length));
    return;
  }

  const from = active.data.current as { listId: string } | undefined;
  const to = over.data.current as { type: string; listId: string; date?: string } | undefined;
  if (!from || !to) return;
  const target = listRegistry.get(to.listId);
  if (!target) return;

  if (to.type === 'list') {
    if (to.date) schedule([id], to.date, undefined);
    return;
  }
  if (from.listId === to.listId) {
    if (id === overId) return;
    const ids = target.ids;
    const next = arrayMove(ids, ids.indexOf(id), ids.indexOf(overId));
    const i = next.indexOf(id);
    ws().reorder(id, next[i - 1] ?? null, next[i + 1] ?? null);
    return;
  }
  // Across lists (Upcoming days): take the target day, land just before the hovered task.
  const ids = target.ids.filter((x) => x !== id);
  const i = ids.indexOf(overId);
  const undo = ws().transact(() => {
    if (target.date) ws().setDue([id], target.date);
    ws().reorder(id, ids[i - 1] ?? null, ids[i] ?? null);
  });
  if (target.date) toast('Rescheduled', { action: { label: 'Undo', run: undo } });
}

function DragPreview({ id }: { id: ID }) {
  const task = useWorkspace((s) => s.tasks[id]);
  if (!task) return null;
  return (
    <div className="flex h-10 max-w-[440px] cursor-grabbing items-center gap-3 rounded-row bg-raised pr-4 pl-3 shadow-float">
      <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-ink-4" />
      <span className="truncate text-task text-ink">{task.title}</span>
    </div>
  );
}

function MobileTopBar() {
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-between bg-paper/90 px-4 backdrop-blur-md md:hidden">
      <Wordmark />
      <button aria-label="Search or command" onClick={() => ui().openPalette()} className="grid size-9 place-items-center rounded-[9px] text-ink-2 hover:bg-wash-strong">
        <Command className="size-[18px]" />
      </button>
    </div>
  );
}

function MobileSheet({ taskId, onClose }: { taskId: ID; onClose: () => void }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll className="z-[60] flex animate-fade flex-col justify-end bg-[rgb(40_36_30/0.22)]" onClick={onClose}>
        <div
          className="flex h-[92dvh] animate-sheet-up flex-col rounded-t-[18px] bg-raised shadow-float"
          style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: start.current === null ? 'transform 200ms var(--ease-out)' : 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex h-6 shrink-0 touch-none items-center justify-center"
            onTouchStart={(e) => (start.current = e.touches[0].clientY)}
            onTouchMove={(e) => start.current !== null && setDy(Math.max(0, e.touches[0].clientY - start.current))}
            onTouchEnd={() => {
              start.current = null;
              if (dy > 110) onClose();
              setDy(0);
            }}
          >
            <span className="h-1 w-9 rounded-full bg-line-strong" />
          </div>
          <div className="min-h-0 flex-1">
            <TaskDetailPanel taskId={taskId} onClose={onClose} variant="sheet" />
          </div>
        </div>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

export function AppShell() {
  const route = useUi((s) => s.route);
  const openTaskId = useUi((s) => s.openTaskId);
  const panelTask = useWorkspace((s) => (openTaskId ? s.tasks[openTaskId] : undefined));
  const hasSelection = useUi((s) => s.selection.length > 0);
  const mobile = useIsMobile();
  const wide = useIsWide();
  const [activeId, setActiveId] = useState<ID | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 320, tolerance: 8 } }),
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [route]);

  const closePanel = () => ui().openTask(null);
  const panelVariant = mobile ? 'sheet' : wide ? 'docked' : 'overlay';

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={(e: DragStartEvent) => {
        setActiveId(String(e.active.id));
        ui().setDragging(true);
        ui().closePicker();
      }}
      onDragEnd={(e) => {
        setActiveId(null);
        ui().setDragging(false);
        handleDrop(e);
      }}
      onDragCancel={() => {
        setActiveId(null);
        ui().setDragging(false);
      }}
    >
      <div className="flex h-dvh overflow-hidden">
        {!mobile && (
          <aside className="h-full shrink-0 transition-[width] duration-200">
            <Sidebar />
          </aside>
        )}
        <main className="relative h-full min-w-0 flex-1 md:py-2 md:pr-2">
          <div
            id="main-sheet"
            ref={scrollRef}
            className="h-full overflow-y-auto bg-paper md:rounded-sheet md:shadow-sheet [scrollbar-gutter:stable]"
          >
            <MobileTopBar />
            <div
              className={cn(
                'mx-auto w-full max-w-[760px] px-10 max-lg:px-8 max-md:px-4',
                // Home centers itself in the viewport, so it gets slimmer padding.
                route.name === 'today' ? 'pt-6 pb-24 max-md:pt-2 max-md:pb-28' : 'pt-14 pb-40 max-md:pt-3 max-md:pb-36',
              )}
            >
              <CurrentView />
            </div>
          </div>
          {/* Home has its own microphone in the middle of the screen. */}
          {!mobile && !hasSelection && route.name !== 'today' && (
            <div className="pointer-events-none absolute inset-x-0 bottom-7 z-30 flex justify-center">
              <VoiceButton />
            </div>
          )}
        </main>
        {panelTask && panelVariant === 'docked' && (
          <aside className="h-full w-[440px] shrink-0 py-2 pr-2">
            <div className="h-full animate-panel overflow-hidden rounded-sheet bg-raised shadow-sheet">
              <TaskDetailPanel taskId={panelTask.id} onClose={closePanel} variant="docked" />
            </div>
          </aside>
        )}
      </div>

      {panelTask && panelVariant === 'overlay' && (
        <div className="fixed top-2 right-2 bottom-2 z-40 w-[min(440px,calc(100vw-80px))] animate-panel overflow-hidden rounded-sheet bg-raised shadow-float">
          <TaskDetailPanel taskId={panelTask.id} onClose={closePanel} variant="overlay" />
        </div>
      )}
      {panelTask && panelVariant === 'sheet' && <MobileSheet taskId={panelTask.id} onClose={closePanel} />}

      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>{activeId && <DragPreview id={activeId} />}</DragOverlay>

      {mobile && <MobileNavigation />}
      <SelectionBar />
    </DndContext>
  );
}
