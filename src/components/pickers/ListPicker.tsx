import { Check, Search } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/platform';
import { Kbd } from '@/components/ui/Kbd';

export interface PickItem {
  id: string;
  label: ReactNode;
  /** Text used for filtering. */
  text: string;
  icon?: ReactNode;
  hint?: ReactNode;
  shortcut?: string;
  section?: string;
  selected?: boolean;
  danger?: boolean;
  /** Always shown regardless of the query (e.g. parsed suggestions). */
  pinned?: boolean;
  /** The task this item represents, if any (palette search results). */
  taskId?: string;
  onSelect: () => void;
}

export type PickerSize = 'popover' | 'palette';

interface ListPickerProps {
  items: PickItem[] | ((query: string) => PickItem[]);
  placeholder: string;
  onClose: () => void;
  /** Esc goes back one step instead of closing, when provided. */
  onBack?: () => void;
  size?: PickerSize;
  filter?: boolean;
  empty?: ReactNode;
  /** Rendered between the input and the list. */
  header?: ReactNode;
  /** Rendered below the list (e.g. a calendar). */
  footer?: ReactNode;
  initialQuery?: string;
  onQueryChange?: (q: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, query: string, active: PickItem | undefined) => boolean | void;
  /** Rendered under the list, e.g. keyboard hints for the active item. */
  hints?: (active: PickItem | undefined) => ReactNode;
  leading?: ReactNode;
  className?: string;
  /** Width for the popover size. */
  widthClass?: string;
  /** Focus the input even on touch devices (search-first surfaces). */
  forceFocus?: boolean;
}

function matchScore(text: string, q: string): number {
  const t = text.toLowerCase();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) return -1;
    score += i === 0 ? 3 : /\s/.test(t[i - 1] ?? '') ? 2 : 1;
  }
  return score;
}

export function ListPicker({
  items,
  placeholder,
  onClose,
  onBack,
  size = 'popover',
  filter = true,
  empty = 'No matches',
  header,
  footer,
  initialQuery = '',
  onQueryChange,
  onKeyDown,
  hints,
  leading,
  className,
  widthClass = 'w-[296px] max-w-[calc(100vw-24px)]',
  forceFocus,
}: ListPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const usingKeyboard = useRef(false);

  const visible = useMemo(() => {
    const all = typeof items === 'function' ? items(query) : items;
    if (!filter || !query.trim()) return all;
    return all
      .map((it, i) => ({ it, i, s: it.pinned ? 100 : matchScore(`${it.text}`, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.it);
  }, [items, query, filter]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (active >= visible.length) setActive(Math.max(0, visible.length - 1));
  }, [visible.length, active]);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (usingKeyboard.current) el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    // On touch devices, don't summon the keyboard for what is usually a tap.
    if (!forceFocus && window.matchMedia('(pointer: coarse)').matches) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown?.(e, query, visible[active])) return;
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      usingKeyboard.current = true;
      setActive((a) => (visible.length ? (a + 1) % visible.length : 0));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      usingKeyboard.current = true;
      setActive((a) => (visible.length ? (a - 1 + visible.length) % visible.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      visible[active]?.onSelect();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query && size === 'palette') setQuery('');
      else if (onBack) onBack();
      else onClose();
    } else if (e.key === 'Backspace' && !query && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const big = size === 'palette';
  let lastSection: string | undefined;

  return (
    <div className={cn('flex min-h-0 flex-col', big ? 'w-full' : widthClass, className)}>
      <div className={cn('flex shrink-0 items-center gap-2.5 border-b border-line', big ? 'h-14 px-5' : 'h-11 px-3.5')}>
        {leading ?? <Search className={cn('shrink-0 text-ink-4', big ? 'size-[18px]' : 'size-4')} />}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onQueryChange?.(e.target.value);
          }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls="picker-list"
          aria-activedescendant={visible[active] ? `pick-${visible[active].id}` : undefined}
          className={cn('min-w-0 flex-1 bg-transparent outline-none', big ? 'text-[16.5px]' : 'text-ui')}
        />
      </div>
      {header}
      <div
        ref={listRef}
        id="picker-list"
        role="listbox"
        onMouseMove={() => (usingKeyboard.current = false)}
        className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', big ? 'max-h-[min(56vh,440px)] p-2' : 'max-h-[320px] p-1.5')}
      >
        {visible.length === 0 && <div className={cn('text-ink-3', big ? 'px-3 py-6 text-ui' : 'px-2.5 py-3 text-meta')}>{empty}</div>}
        {visible.map((it, i) => {
          const showSection = it.section && it.section !== lastSection;
          lastSection = it.section;
          return (
            <Fragment key={it.id}>
              {showSection && (
                <div className={cn('label-caps !text-[10.5px] text-ink-4', big ? 'px-3 pt-3 pb-1.5' : 'px-2.5 pt-2.5 pb-1', i === 0 && '!pt-1')}>
                  {it.section}
                </div>
              )}
              <div
                id={`pick-${it.id}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => !usingKeyboard.current && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => it.onSelect()}
                className={cn(
                  'flex cursor-default items-center gap-2.5 rounded-[7px] transition-colors duration-75',
                  big ? 'h-10 px-3 text-[14px]' : 'h-8 px-2.5 text-ui',
                  i === active ? 'bg-wash-strong text-ink' : 'text-ink-2',
                  it.danger && (i === active ? '!bg-ember-soft !text-ember' : 'text-ember'),
                )}
              >
                {it.icon && <span className={cn('flex shrink-0 items-center justify-center text-ink-3', big ? 'w-5' : 'w-4', it.danger && 'text-ember')}>{it.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="shrink-0 text-meta text-ink-3">{it.hint}</span>}
                {it.selected && <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2.5} />}
                {it.shortcut && !it.selected && <Kbd combo={it.shortcut} subtle />}
              </div>
            </Fragment>
          );
        })}
      </div>
      {footer}
      {hints?.(visible[active])}
    </div>
  );
}
