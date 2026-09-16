import { CornerDownLeft, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Task } from '@/domain/types';
import { dueLabel } from '@/lib/dates';
import { markFresh } from '@/lib/fresh';
import { createId, nowIso } from '@/lib/id';
import { hostOf } from '@/lib/nlp';
import { cn } from '@/lib/platform';
import { toast } from '@/store/toast';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws, type NewTaskInput } from '@/store/workspace';
import { Kbd } from '@/components/ui/Kbd';
import { Chip, chipsFromParse, fieldsFromParse, useParsedInput, type ChipSpec } from './parsedInput';
import { parseTask, defaultDateOrder } from '@/lib/nlp';

export interface ComposerDefaults {
  fields: Partial<Task>;
  chip: Omit<ChipSpec, 'kinds' | 'tone'>;
}

interface TaskComposerProps {
  defaults?: ComposerDefaults;
  /** Whether a new task shows up in the current view; if not we say where it went. */
  isVisibleHere?: (t: Task) => boolean;
  placeholder?: string;
  variant?: 'page' | 'sheet';
  autoFocus?: boolean;
  onCreated?: (tasks: Task[]) => void;
  footer?: ReactNode;
}

export function destinationLabel(t: Task): string {
  if (t.dueDate) return dueLabel(t.dueDate);
  if (t.projectId) return ws().projects[t.projectId]?.name ?? 'project';
  if (t.deferred) return 'Later';
  return 'Inbox';
}

function linkRows(urls: string[]): Task['links'] {
  return urls.map((url) => ({ id: createId('l_'), url, title: hostOf(url), createdAt: nowIso() }));
}

/**
 * "What needs to be done?" — type, press Enter, the task exists.
 * Anything the parser understands appears as a chip you can dismiss.
 */
export function TaskComposer({ defaults, isVisibleHere, placeholder = 'What needs to be done?', variant = 'page', autoFocus, onCreated, footer }: TaskComposerProps) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [defaultOff, setDefaultOff] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const { result, dismiss, reset } = useParsedInput(value);
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const projects = useWorkspace((s) => s.projects);
  const people = useWorkspace((s) => s.people);
  const focusTick = useUi((s) => s.composerFocusTick);
  // Only react to focus requests made while this composer is mounted.
  const mountTick = useRef(focusTick);

  useEffect(() => {
    if (focusTick !== mountTick.current && variant === 'page' && window.matchMedia('(min-width: 768px)').matches) {
      inputRef.current?.focus();
    }
  }, [focusTick, variant]);

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => inputRef.current?.focus());
  }, [autoFocus]);

  // Context defaults reset when the view changes.
  const defaultsKey = defaults ? JSON.stringify(defaults.fields) : '';
  useEffect(() => setDefaultOff(false), [defaultsKey]);

  const detected = chipsFromParse(result, fmt, projects, people);
  const overridesDefault =
    defaults &&
    ((defaults.fields.dueDate !== undefined || defaults.fields.deferred) && (result.dueDate || result.recurrence)
      ? true
      : defaults.fields.projectId !== undefined && (result.projectId || result.newProjectName)
        ? true
        : defaults.fields.priority !== undefined && result.priority
          ? true
          : false);
  const showDefault = !!defaults && !defaultOff && !overridesDefault;
  const chips: ChipSpec[] = [
    ...(defaults && showDefault ? [{ ...defaults.chip, kinds: [], tone: 'default' as const }] : []),
    ...detected,
  ];

  const buildInput = (title: string, r = result, withDefaults = showDefault): NewTaskInput => ({
    ...(withDefaults ? defaults?.fields : {}),
    ...fieldsFromParse(r),
    title,
    links: linkRows(r.links),
  });

  const created = (tasks: Task[], openFirst: boolean) => {
    markFresh(tasks.map((t) => t.id));
    onCreated?.(tasks);
    const hidden = isVisibleHere ? tasks.filter((t) => !isVisibleHere(t)) : [];
    if (openFirst) ui().openTask(tasks[0].id);
    else if (hidden.length === 1) {
      const t = hidden[0];
      toast(`Added to ${destinationLabel(t)}`, { detail: t.title, action: { label: 'Open', run: () => ui().openTask(t.id) } });
    } else if (hidden.length > 1) {
      toast(`${hidden.length} tasks added elsewhere`);
    }
  };

  const submit = (openAfter: boolean) => {
    const title = result.title.trim();
    if (!title) return;
    const [task] = ws().addTasks([buildInput(title)]);
    setValue('');
    reset();
    created([task], openAfter);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[[ x]?\])\s+/i, '').trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const opts = {
      projects: Object.values(projects).map((p) => ({ id: p.id, name: p.name })),
      people: Object.values(people).map((p) => ({ id: p.id, name: p.name })),
      dateOrder: defaultDateOrder(),
    };
    const inputs = lines.map((line) => {
      const r = parseTask(line, opts);
      return buildInput(r.title || line, r);
    });
    let tasks: Task[] = [];
    const undo = ws().transact(() => {
      tasks = ws().addTasks(inputs);
    });
    markFresh(tasks.map((t) => t.id));
    toast(`${tasks.length} tasks added`, { detail: 'One per line', action: { label: 'Undo', run: undo } });
  };

  const syncScroll = () => {
    if (mirrorRef.current && inputRef.current) mirrorRef.current.style.transform = `translateX(${-inputRef.current.scrollLeft}px)`;
  };

  // Highlight detected phrases behind the input text.
  const segments: ReactNode[] = [];
  let last = 0;
  for (const t of result.tokens) {
    if (t.start > last) segments.push(value.slice(last, t.start));
    segments.push(
      <mark key={t.start} className="rounded-[4px] bg-accent-soft text-transparent shadow-[0_0_0_2px_var(--color-accent-soft)]">
        {value.slice(t.start, t.end)}
      </mark>,
    );
    last = t.end;
  }
  segments.push(value.slice(last));

  const sheet = variant === 'sheet';
  const expanded = chips.length > 0 && (focused || value.length > 0);

  return (
    <div
      className={cn(
        'group/composer relative rounded-[12px] bg-raised transition-shadow duration-150',
        focused ? 'shadow-composer-focus' : 'shadow-composer hover:shadow-[0_0_0_1px_rgb(29_28_26/0.1),0_1px_2px_rgb(29_28_26/0.04),0_6px_18px_-10px_rgb(29_28_26/0.14)]',
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <div className={cn('flex items-center gap-3 pr-3 pl-4', sheet ? 'h-14' : 'h-[52px]')}>
        <Plus className={cn('size-[18px] shrink-0 transition-colors', focused ? 'text-accent' : 'text-ink-4')} strokeWidth={2} />
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div ref={mirrorRef} aria-hidden className="pointer-events-none absolute inset-0 flex items-center text-compose whitespace-pre text-transparent">
            {segments}
          </div>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (!e.target.value) reset();
              requestAnimationFrame(syncScroll);
            }}
            onScroll={syncScroll}
            onSelect={syncScroll}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit(e.shiftKey);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                if (value) {
                  setValue('');
                  reset();
                } else inputRef.current?.blur();
              } else if (e.key === 'Backspace' && !value && showDefault) {
                setDefaultOff(true);
              }
            }}
            placeholder={placeholder}
            aria-label="New task"
            // Focus at mount, not a frame later: keystrokes right after "N" must land here.
            autoFocus={autoFocus}
            enterKeyHint="done"
            autoComplete="off"
            spellCheck
            className="relative h-8 w-full bg-transparent text-compose text-ink outline-none placeholder:text-ink-4"
          />
        </div>
        {!value && !focused && variant === 'page' && (
          <span className="shrink-0 max-md:hidden">
            <Kbd combo="n" subtle />
          </span>
        )}
        {value && (
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              submit(false);
            }}
            aria-label="Add task"
            className="flex h-7 shrink-0 animate-fade items-center gap-1.5 rounded-[7px] bg-accent px-2.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Add
            <CornerDownLeft className="size-3.5 opacity-70" />
          </button>
        )}
      </div>
      <div className={cn('grid transition-[grid-template-rows] duration-150 ease-out', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 pr-3 pb-3 pl-[46px]">
            {chips.map((c) => (
              <Chip key={c.id} spec={c} onDismiss={() => (c.tone === 'default' ? setDefaultOff(true) : dismiss(c.kinds))} />
            ))}
            {value && (
              <span className="ml-auto hidden text-meta text-ink-4 md:inline">
                <Kbd combo="shift+enter" subtle /> add & open
              </span>
            )}
          </div>
        </div>
      </div>
      {footer}
    </div>
  );
}
