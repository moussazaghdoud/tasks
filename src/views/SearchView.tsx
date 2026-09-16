import { Bookmark, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ID } from '@/domain/types';
import { BUILTIN_VIEWS, useQueryResults } from '@/store/selectors';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskList } from '@/components/tasks/TaskList';
import { HeaderButton, useRegisterVisible, ViewHeader } from './ViewHeader';

function Results({ query }: { query: string }) {
  const { filters, open, completed } = useQueryResults(query);
  useRegisterVisible(useMemo(() => [...open, ...completed].map((t) => t.id), [open, completed]));
  const empty = !open.length && !completed.length;
  return (
    <>
      {filters.chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-meta text-ink-3">Showing</span>
          {filters.chips.map((c) => (
            <span key={c} className="inline-flex h-6 items-center rounded-[6px] bg-accent-wash px-2 text-[12.5px] font-medium text-accent-ink">
              {c}
            </span>
          ))}
          {filters.text.length > 0 && <span className="text-meta text-ink-3">matching “{filters.text.join(' ')}”</span>}
        </div>
      )}
      {empty ? (
        <EmptyState title="No tasks match this search." compact>
          Try fewer words, or a filter like “overdue”, “#ips”, “@claire” or “completed last week”.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 && <TaskList listId="search" tasks={open} sortable={false} />}
          {completed.length > 0 && (
            <section className="mt-6">
              <h2 className="label-caps mb-1 pl-1">Completed · {completed.length}</h2>
              <TaskList listId="search-done" tasks={completed} sortable={false} />
            </section>
          )}
        </>
      )}
    </>
  );
}

export function SearchView({ q }: { q: string }) {
  const [value, setValue] = useState(q);
  const [naming, setNaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useUi((s) => s.navigate);
  useEffect(() => setValue(q), [q]);

  const save = (name: string) => {
    setNaming(false);
    if (!name.trim()) return;
    const view = ws().saveView(name, value.trim());
    ws().setPreferences({ viewsExpanded: true });
    navigate({ name: 'view', id: view.id });
    toast('View saved', { detail: 'Find it in the sidebar under Views' });
  };

  const actions = !value.trim() ? null : naming ? (
    <input
      autoFocus
      defaultValue={value.trim()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => setNaming(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save(e.currentTarget.value);
        if (e.key === 'Escape') setNaming(false);
      }}
      aria-label="View name"
      placeholder="Name this view"
      className="h-8 w-56 rounded-[8px] bg-raised px-3 text-ui shadow-composer-focus outline-none"
    />
  ) : (
    <HeaderButton onClick={() => setNaming(true)}>
      <Bookmark className="size-4" /> Save as view
    </HeaderButton>
  );

  return (
    <div>
      <ViewHeader title="Search" actions={actions} />
      <div className="mb-6 flex h-12 items-center gap-3 rounded-[12px] bg-raised px-4 shadow-composer focus-within:shadow-composer-focus">
        <Search className="size-[18px] text-ink-4" />
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            window.history.replaceState(null, '', `#/search?q=${encodeURIComponent(e.target.value)}`);
          }}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
          placeholder="Search tasks, notes, people — or “overdue”, “#ips”, “completed last week”"
          className="h-full flex-1 bg-transparent text-compose outline-none"
        />
        {value && (
          <button aria-label="Clear" onClick={() => setValue('')} className="grid size-6 place-items-center rounded-[6px] text-ink-3 hover:bg-wash-strong">
            <X className="size-4" />
          </button>
        )}
      </div>
      {value.trim() ? (
        <Results query={value} />
      ) : (
        <EmptyState title="Find anything." compact>
          Search looks through titles, notes, subtasks, projects and people.
        </EmptyState>
      )}
    </div>
  );
}

export function SavedViewPage({ id }: { id: ID }) {
  const saved = useWorkspace((s) => s.views[id]);
  const builtin = BUILTIN_VIEWS.find((v) => v.id === id);
  const view = saved ?? builtin;
  if (!view) return <EmptyState title="This view no longer exists." />;
  return (
    <div>
      <ViewHeader
        title={view.name}
        subtitle={builtin ? builtin.hint : <span>Saved search · “{view.query}”</span>}
        actions={
          saved && (
            <HeaderButton
              onClick={() => {
                ws().removeView(id);
                ui().navigate({ name: 'today' });
                toast('View removed');
              }}
            >
              <Trash2 className="size-4" /> Remove
            </HeaderButton>
          )
        }
      />
      <Results query={view.query} />
    </div>
  );
}
