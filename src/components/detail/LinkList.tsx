import { ArrowUpRight, Link2, X } from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { hostOf } from '@/lib/nlp';
import { ws } from '@/store/workspace';

export const LinkList = forwardRef<HTMLInputElement, { task: Task; showInput: boolean }>(function LinkList({ task, showInput }, ref) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.trim().split(/\s+/);
    if (!parts[0]) return;
    const url = parts.find((p) => /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(p));
    if (!url) return;
    const title = parts.filter((p) => p !== url).join(' ');
    ws().addLink(task.id, url, title || undefined);
    setDraft('');
  };
  return (
    <div>
      <ul>
        {task.links.map((l) => (
          <li key={l.id} className="group/link flex min-h-8 items-center gap-3 rounded-[7px] pr-1 pl-1.5 hover:bg-wash">
            <Link2 className="size-[15px] shrink-0 text-ink-3" />
            <a href={l.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-baseline gap-2 text-ui text-ink hover:text-accent">
              <span className="truncate">{l.title}</span>
              {l.title !== hostOf(l.url) && <span className="shrink-0 text-meta text-ink-4">{hostOf(l.url)}</span>}
              <ArrowUpRight className="size-3.5 shrink-0 self-center text-ink-4 opacity-0 group-hover/link:opacity-100" />
            </a>
            <button
              aria-label="Remove link"
              onClick={() => ws().removeLink(task.id, l.id)}
              className="grid size-6 place-items-center rounded-[5px] text-ink-4 opacity-0 transition hover:bg-wash-strong hover:text-ink-2 group-hover/link:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {showInput && (
        <label className="flex min-h-8 items-center gap-3 pl-1.5 text-ink-3">
          <Link2 className="size-[15px] shrink-0" />
          <input
            ref={ref}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
              if (e.key === 'Escape') e.currentTarget.blur();
            }}
            onBlur={add}
            placeholder="Paste a link — optionally followed by a name"
            className="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none"
          />
        </label>
      )}
    </div>
  );
});
