import { Plus, X } from 'lucide-react';
import { forwardRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { cn } from '@/lib/platform';
import { ws } from '@/store/workspace';

function SubCheck({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'grid size-[15px] shrink-0 place-items-center rounded-[4px] border-[1.5px] transition-colors',
        done ? 'border-accent bg-accent text-white' : 'border-ink-4 hover:border-accent',
      )}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6.2 4.8 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export const SubtaskList = forwardRef<HTMLInputElement, { task: Task; size?: 'panel' | 'focus' }>(function SubtaskList({ task, size = 'panel' }, addRef) {
  const [draft, setDraft] = useState('');
  const big = size === 'focus';

  const add = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean);
    for (const l of lines) ws().addSubtask(task.id, l);
  };

  return (
    <div>
      <ul className="flex flex-col">
        {task.subtasks.map((s) => (
          <li key={s.id} className={cn('group/sub flex items-center gap-3 rounded-[7px] pr-1 pl-1.5 hover:bg-wash', big ? 'min-h-10' : 'min-h-8')}>
            <SubCheck done={s.done} onToggle={() => ws().updateSubtask(task.id, s.id, { done: !s.done })} label={s.title} />
            <input
              defaultValue={s.title}
              key={s.title}
              aria-label="Subtask"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) ws().removeSubtask(task.id, s.id);
                else if (v !== s.title) ws().updateSubtask(task.id, s.id, { title: v });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = s.title;
                  e.currentTarget.blur();
                }
                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault();
                  ws().moveSubtask(task.id, s.id, e.key === 'ArrowUp' ? -1 : 1);
                }
              }}
              className={cn(
                'min-w-0 flex-1 bg-transparent outline-none',
                big ? 'text-[15px]' : 'text-ui',
                s.done ? 'text-ink-3 line-through decoration-ink-4' : 'text-ink',
              )}
            />
            <button
              aria-label="Remove subtask"
              onClick={() => ws().removeSubtask(task.id, s.id)}
              className="grid size-6 place-items-center rounded-[5px] text-ink-4 opacity-0 transition hover:bg-wash-strong hover:text-ink-2 group-hover/sub:opacity-100 focus-visible:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <label className={cn('flex items-center gap-3 rounded-[7px] pl-1.5 text-ink-3', big ? 'min-h-10' : 'min-h-8')}>
        <Plus className="size-[15px] shrink-0" />
        <input
          ref={addRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.includes('\n')) {
              e.preventDefault();
              add(text);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              add(draft);
              setDraft('');
            }
            if (e.key === 'Escape') e.currentTarget.blur();
          }}
          placeholder={task.subtasks.length ? 'Add another step' : 'Break it into steps'}
          className={cn('min-w-0 flex-1 bg-transparent text-ink outline-none', big ? 'text-[15px]' : 'text-ui')}
        />
      </label>
    </div>
  );
});
