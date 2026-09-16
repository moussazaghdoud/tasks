import { useDroppable } from '@dnd-kit/core';
import { Bookmark, CalendarArrowUp, CalendarDays, ChevronRight, Command, Flag, Inbox, Moon, PanelLeftClose, PanelLeftOpen, Plus, Sun, Sunrise } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn, MOD } from '@/lib/platform';
import { BUILTIN_VIEWS, useCounts, useProjects } from '@/store/selectors';
import { sameRoute, ui, useUi, type Route } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { Tooltip } from '@/components/ui/Tooltip';
import { Wordmark, BrandMark } from './BrandMark';
import { SettingsMenu } from './SettingsMenu';

interface NavItemProps {
  icon: ReactNode;
  label: string;
  route?: Route;
  count?: number;
  /** Drop target id — dragging a task here applies the matching action. */
  dropId?: string;
  collapsed: boolean;
  shortcut?: string;
  onClick?: () => void;
  ghost?: boolean;
}

function NavItem({ icon, label, route, count, dropId, collapsed, shortcut, onClick, ghost }: NavItemProps) {
  const current = useUi((s) => (route ? sameRoute(s.route, route) : false));
  const dragging = useUi((s) => s.dragging);
  const { setNodeRef, isOver } = useDroppable({ id: dropId ?? `nav:${label}`, disabled: !dropId, data: { type: 'target' } });

  const button = (
    <button
      ref={setNodeRef}
      onClick={onClick ?? (() => route && ui().navigate(route))}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'group/nav relative flex h-8 w-full items-center gap-2.5 rounded-[8px] text-ui transition-[background-color,color,box-shadow] duration-100',
        collapsed ? 'justify-center px-0' : 'px-2.5',
        current ? 'bg-raised font-medium text-ink shadow-[0_0_0_1px_rgb(29_28_26/0.05),0_1px_2px_rgb(29_28_26/0.05)]' : 'text-ink-2 hover:bg-sunk hover:text-ink',
        dragging && dropId && 'shadow-[inset_0_0_0_1px_var(--color-line-strong)]',
        isOver && '!bg-accent-soft !text-accent-ink !shadow-[inset_0_0_0_1.5px_var(--color-accent)]',
        ghost && 'animate-fade text-ink-3',
      )}
    >
      <span className={cn('flex size-4 shrink-0 items-center justify-center', current ? 'text-ink' : 'text-ink-3 group-hover/nav:text-ink-2', isOver && '!text-accent')}>{icon}</span>
      {!collapsed && <span className="flex-1 truncate text-left">{label}</span>}
      {!collapsed && count !== undefined && count > 0 && <span className="text-meta text-ink-3 font-num">{count}</span>}
      {collapsed && count !== undefined && count > 0 && <span className="absolute top-1 right-1.5 size-1.5 rounded-full bg-accent" />}
    </button>
  );
  return collapsed ? (
    <Tooltip label={label} shortcut={shortcut} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

function SectionLabel({ children, action, collapsed, onClick, open }: { children: ReactNode; action?: ReactNode; collapsed: boolean; onClick?: () => void; open?: boolean }) {
  if (collapsed) return <div className="mx-auto my-3 h-px w-5 bg-line-strong" />;
  return (
    <div className="group/sec mt-6 mb-1 flex h-7 items-center pr-1 pl-2.5">
      <button onClick={onClick} className={cn('flex flex-1 items-center gap-1 text-left', !onClick && 'cursor-default')} aria-expanded={onClick ? open : undefined}>
        <span className="label-caps !text-ink-3">{children}</span>
        {onClick && <ChevronRight className={cn('size-3 text-ink-4 transition-transform', open && 'rotate-90')} />}
      </button>
      {action}
    </div>
  );
}

export function Sidebar({ mobile }: { mobile?: boolean }) {
  const collapsed = useWorkspace((s) => s.user.preferences.sidebarCollapsed) && !mobile;
  const viewsExpanded = useWorkspace((s) => s.user.preferences.viewsExpanded);
  const savedViews = useWorkspace((s) => s.views);
  const projects = useProjects();
  const counts = useCounts();
  const dragging = useUi((s) => s.dragging);

  return (
    <nav aria-label="Main" className={cn('flex h-full flex-col', collapsed ? 'w-[60px] px-2.5' : 'w-[244px] px-3', mobile && 'w-full')}>
      <div className={cn('flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pl-2.5')}>
        {collapsed ? (
          <Tooltip label="Expand sidebar" shortcut="[" placement="right">
            <button aria-label="Expand sidebar" onClick={() => ws().setPreferences({ sidebarCollapsed: false })} className="grid size-9 place-items-center rounded-[8px] hover:bg-sunk">
              <BrandMark />
            </button>
          </Tooltip>
        ) : (
          <>
            <Wordmark />
            {!mobile && (
              <Tooltip label="Collapse sidebar" shortcut="[">
                <button aria-label="Collapse sidebar" onClick={() => ws().setPreferences({ sidebarCollapsed: true })} className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-sunk hover:text-ink">
                  <PanelLeftClose className="size-4" />
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>

      <div className="mb-3">
        {collapsed ? (
          <NavItem collapsed icon={<Command className="size-4" />} label="Search & commands" shortcut="mod+k" onClick={() => ui().openPalette()} />
        ) : (
          <button
            onClick={() => ui().openPalette()}
            className="flex h-9 w-full items-center gap-2.5 rounded-[9px] bg-paper/70 px-2.5 text-ui text-ink-3 shadow-[0_0_0_1px_rgb(29_28_26/0.06)] transition-colors hover:bg-paper hover:text-ink-2"
          >
            <Command className="size-4" />
            <span className="flex-1 text-left">Search or command</span>
            <span className="text-[11px] font-medium text-ink-4">{MOD} K</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 [scrollbar-gutter:stable]">
        <div className="flex flex-col gap-px">
          <NavItem collapsed={collapsed} icon={<Sun className="size-4" />} label="Today" route={{ name: 'today' }} count={counts.today} dropId="target:today" shortcut="1" />
          {dragging && <NavItem ghost collapsed={collapsed} icon={<Sunrise className="size-4" />} label="Tomorrow" dropId="target:tomorrow" />}
          {dragging && <NavItem ghost collapsed={collapsed} icon={<CalendarArrowUp className="size-4" />} label="Next week" dropId="target:nextweek" />}
          <NavItem collapsed={collapsed} icon={<CalendarDays className="size-4" />} label="Upcoming" route={{ name: 'upcoming' }} shortcut="2" />
          <NavItem collapsed={collapsed} icon={<Inbox className="size-4" />} label="Inbox" route={{ name: 'inbox' }} count={counts.inbox} dropId="target:inbox" shortcut="3" />
          <NavItem collapsed={collapsed} icon={<Flag className="size-4" />} label="Important" route={{ name: 'important' }} dropId="target:important" shortcut="4" />
          <NavItem collapsed={collapsed} icon={<Moon className="size-4" />} label="Later" route={{ name: 'later' }} dropId="target:later" shortcut="5" />
        </div>

        <SectionLabel
          collapsed={collapsed}
          action={
            <Tooltip label="New project">
              <button aria-label="New project" onClick={() => ui().setProjectDialog({})} className="grid size-6 place-items-center rounded-[6px] text-ink-4 opacity-0 transition hover:bg-sunk hover:text-ink group-hover/sec:opacity-100 focus-visible:opacity-100 max-md:opacity-100">
                <Plus className="size-3.5" />
              </button>
            </Tooltip>
          }
        >
          Projects
        </SectionLabel>
        <div className="flex flex-col gap-px">
          {projects.map((p) => (
            <NavItem key={p.id} collapsed={collapsed} icon={<ProjectGlyph project={p} size={15} />} label={p.name} route={{ name: 'project', id: p.id }} dropId={`target:project:${p.id}`} />
          ))}
          {projects.length === 0 && !collapsed && (
            <button onClick={() => ui().setProjectDialog({})} className="flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-ui text-ink-3 hover:bg-sunk hover:text-ink-2">
              <Plus className="size-4" /> New project
            </button>
          )}
        </div>

        {!collapsed && (
          <>
            <SectionLabel collapsed={collapsed} onClick={() => ws().setPreferences({ viewsExpanded: !viewsExpanded })} open={viewsExpanded}>
              Views
            </SectionLabel>
            {viewsExpanded && (
              <div className="flex animate-fade flex-col gap-px">
                {[...BUILTIN_VIEWS, ...Object.values(savedViews)].map((v) => (
                  <NavItem key={v.id} collapsed={collapsed} icon={<Bookmark className="size-[15px]" />} label={v.name} route={{ name: 'view', id: v.id }} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className={cn('shrink-0 border-t border-line/70 py-2.5', collapsed && 'flex flex-col items-center gap-1')}>
        {collapsed && (
          <Tooltip label="Expand sidebar" shortcut="[" placement="right">
            <button aria-label="Expand sidebar" onClick={() => ws().setPreferences({ sidebarCollapsed: false })} className="grid size-9 place-items-center rounded-[8px] text-ink-3 hover:bg-sunk hover:text-ink">
              <PanelLeftOpen className="size-4" />
            </button>
          </Tooltip>
        )}
        <SettingsMenu collapsed={collapsed} />
      </div>
    </nav>
  );
}
