import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { ui } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { Chip, chipsFromParse, fieldsFromParse, useParsedInput } from './parsedInput';

/**
 * Inline title editing. Understands the same language as the composer, so
 * "Call Nicolas friday" reschedules while renaming; chips show what will apply.
 */
export function InlineTitleEditor({ task }: { task: Task }) {
  const [value, setValue] = useState(task.title);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const { result, dismiss } = useParsedInput(value, task.title);
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const projects = useWorkspace((s) => s.projects);
  const people = useWorkspace((s) => s.people);
  const chips = chipsFromParse(result, fmt, projects, people);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    ui().setEditing(null);
    if (!save) return;
    const title = (result.title || value).trim();
    if (!title) return;
    const hasAttrs = result.tokens.length > 0;
    if (!hasAttrs && title === task.title) return;
    const undo = ws().transact(() => {
      ws().renameTask(task.id, title);
      if (!hasAttrs) return;
      const f = fieldsFromParse(result);
      if (f.dueDate) ws().setDue([task.id], f.dueDate, f.dueTime ?? null);
      if (f.priority) ws().setPriority([task.id], f.priority);
      if (f.projectId !== undefined) ws().moveToProject([task.id], f.projectId);
      if (f.assigneeId !== undefined) ws().assign([task.id], f.assigneeId);
      if (f.recurrence) ws().setRecurrence([task.id], f.recurrence);
      if (f.estimatedMinutes) ws().setEstimate([task.id], f.estimatedMinutes);
      for (const url of result.links) ws().addLink(task.id, url);
    });
    if (hasAttrs) toast('Updated', { detail: chips.map((c) => (typeof c.label === 'string' ? c.label : '')).filter(Boolean).join(' · '), action: { label: 'Undo', run: undo } });
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={value}
        aria-label="Task title"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        }}
        className="h-8 min-w-0 flex-1 rounded-[6px] bg-raised pl-1 text-task text-ink shadow-[0_0_0_1px_var(--color-line-strong)] outline-none focus:shadow-[0_0_0_1px_rgb(30_103_108/0.45)]"
      />
      {chips.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {chips.map((c) => (
            <Chip key={c.id} spec={c} compact onDismiss={() => dismiss(c.kinds)} />
          ))}
        </div>
      )}
    </div>
  );
}
