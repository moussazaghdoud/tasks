import { CalendarDays, Flag, Inbox, Layers, Moon, Sun } from 'lucide-react';
import { VoiceButton } from '@/components/voice/VoiceButton';
import { FloatingOverlay, FloatingPortal } from '@floating-ui/react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/platform';
import { isInbox, isLater, useCounts } from '@/store/selectors';
import { ui, useUi, type Route } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { useToday } from '@/hooks/useToday';
import { TaskComposer, type ComposerDefaults } from '@/components/tasks/TaskComposer';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import type { Task } from '@/domain/types';
import { Sidebar } from './Sidebar';

function Tab({ icon, label, active, onClick, badge }: { icon: ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[10.5px] font-medium', active ? 'text-ink' : 'text-ink-3')}>
      <span className={cn('flex size-6 items-center justify-center', active && '[&_svg]:stroke-[2.3]')}>{icon}</span>
      {label}
      {!!badge && <span className="absolute top-1.5 left-[calc(50%+6px)] min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 text-white font-num">{badge}</span>}
    </button>
  );
}

/** Bottom navigation for phones. Capture is the center, largest target. */
export function MobileNavigation() {
  const route = useUi((s) => s.route);
  const counts = useCounts();
  const is = (r: Route['name']) => route.name === r;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/92 pb-safe backdrop-blur-md md:hidden">
      <div className="flex h-[60px] items-stretch px-2">
        <Tab icon={<Sun className="size-[21px]" />} label="Today" active={is('today')} onClick={() => ui().navigate({ name: 'today' })} />
        <Tab icon={<CalendarDays className="size-[21px]" />} label="Upcoming" active={is('upcoming')} onClick={() => ui().navigate({ name: 'upcoming' })} />
        {/* Home already has the microphone in the middle of the screen. */}
        {!is('today') && (
          <div className="flex flex-1 items-center justify-center">
            <VoiceButton variant="nav" />
          </div>
        )}
        <Tab icon={<Inbox className="size-[21px]" />} label="Inbox" active={is('inbox')} onClick={() => ui().navigate({ name: 'inbox' })} badge={counts.inbox} />
        <Tab icon={<Layers className="size-[21px]" />} label="Menu" active={['project', 'important', 'later', 'view', 'search'].includes(route.name)} onClick={() => ui().setSidebarOpenMobile(true)} />
      </div>
    </nav>
  );
}

export function useRouteDefaults(): { defaults?: ComposerDefaults; isVisibleHere?: (t: Task) => boolean } {
  const route = useUi((s) => s.route);
  const today = useToday();
  const project = useWorkspace((s) => (route.name === 'project' ? s.projects[route.id] : undefined));
  switch (route.name) {
    case 'today':
      return { defaults: { fields: { dueDate: today }, chip: { id: 'ctx', icon: <Sun className="size-3.5" />, label: 'Today' } }, isVisibleHere: (t) => !!t.dueDate && t.dueDate <= today };
    case 'project':
      return project
        ? { defaults: { fields: { projectId: project.id }, chip: { id: 'ctx', icon: <ProjectGlyph project={project} size={12} />, label: project.name } }, isVisibleHere: (t) => t.projectId === project.id }
        : {};
    case 'important':
      return { defaults: { fields: { priority: 'important' }, chip: { id: 'ctx', icon: <Flag className="size-3.5 text-ember" />, label: 'Important' } }, isVisibleHere: (t) => t.priority === 'important' };
    case 'later':
      return { defaults: { fields: { deferred: true }, chip: { id: 'ctx', icon: <Moon className="size-3.5" />, label: 'Later' } }, isVisibleHere: isLater };
    case 'inbox':
      return { isVisibleHere: isInbox };
    case 'upcoming':
      return { isVisibleHere: (t) => !!t.dueDate && t.dueDate > today };
    default:
      return {};
  }
}

/** Phone capture: a sheet above the keyboard with the composer focused. */
export function CaptureSheet() {
  const open = useUi((s) => s.captureOpen);
  const setCapture = useUi((s) => s.setCapture);
  const ctx = useRouteDefaults();
  if (!open) return null;
  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll className="z-[70] flex animate-fade flex-col justify-end bg-[rgb(40_36_30/0.22)]" onClick={() => setCapture(false)}>
        <div className="animate-sheet-up rounded-t-[18px] bg-desk px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-strong" />
          <TaskComposer variant="sheet" autoFocus defaults={ctx.defaults} isVisibleHere={ctx.isVisibleHere} />
          <p className="px-2 pt-2 text-meta text-ink-3">Try “Call Thierry tomorrow 3pm #ips”. Paste a list to add many.</p>
        </div>
      </FloatingOverlay>
    </FloatingPortal>
  );
}

export function MobileDrawer() {
  const open = useUi((s) => s.sidebarOpenMobile);
  const setOpen = useUi((s) => s.setSidebarOpenMobile);
  if (!open) return null;
  return (
    <FloatingPortal>
      <FloatingOverlay lockScroll className="z-[65] animate-fade bg-[rgb(40_36_30/0.22)] md:hidden" onClick={() => setOpen(false)}>
        <div className="h-full w-[82%] max-w-[320px] animate-drawer bg-desk pt-safe pb-safe shadow-float" onClick={(e) => e.stopPropagation()}>
          <Sidebar mobile />
        </div>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
