import { ArrowRight, AtSign, CalendarDays, CornerDownRight, Flag, Hash, Hourglass, Plus, Repeat, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { recurrenceLabel } from '@/domain/recurrence';
import { dueLabel, formatDuration } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { findPerson, findProject, findTaskByTitle } from '@/lib/voice/createFromDrafts';
import type { VoiceTaskDraft } from '@/lib/voice/types';
import { useWorkspace } from '@/store/workspace';
import { Chip, type ChipSpec } from '@/components/tasks/parsedInput';
import { whenLabel } from '@/components/pickers/DatePicker';
import { AutoTextarea } from '@/components/detail/AutoTextarea';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { Avatar } from '@/components/ui/Avatar';
import { Kbd } from '@/components/ui/Kbd';

type Field = 'when' | 'priority' | 'project' | 'assignee' | 'recurrence' | 'estimate';

function destination(d: VoiceTaskDraft): string {
  if (d.dueDate) return dueLabel(d.dueDate);
  if (d.project) return findProject(d.project)?.name ?? d.project;
  return 'Inbox';
}

function DraftCard({
  draft,
  index,
  onChange,
  onRemove,
  removable,
  asStep,
  onAsStep,
}: {
  draft: VoiceTaskDraft;
  index: number;
  onChange: (d: VoiceTaskDraft) => void;
  onRemove: () => void;
  removable: boolean;
  asStep: boolean;
  onAsStep: (on: boolean) => void;
}) {
  const fmt = useWorkspace((s) => s.user.preferences.timeFormat);
  const [newSub, setNewSub] = useState('');
  const related = draft.relatedTo ? findTaskByTitle(draft.relatedTo) : undefined;
  const project = draft.project ? findProject(draft.project) : undefined;
  const person = draft.assignee ? findPerson(draft.assignee) : undefined;

  const clear = (f: Field) => {
    const next = { ...draft };
    if (f === 'when') Object.assign(next, { dueDate: null, dueTime: null, recurrence: null });
    if (f === 'priority') next.priority = 'normal';
    if (f === 'project') next.project = null;
    if (f === 'assignee') next.assignee = null;
    if (f === 'recurrence') next.recurrence = null;
    if (f === 'estimate') next.estimatedMinutes = null;
    onChange(next);
  };

  const chips: Array<ChipSpec & { field: Field }> = [];
  if (draft.dueDate) {
    chips.push({ id: 'when', field: 'when', kinds: [], tone: 'detected', icon: <CalendarDays className="size-3.5" />, label: whenLabel(draft.dueDate, draft.dueTime, fmt) });
  }
  if (draft.recurrence) {
    chips.push({ id: 'rec', field: 'recurrence', kinds: [], tone: 'detected', icon: <Repeat className="size-3.5" />, label: recurrenceLabel(draft.recurrence, draft.dueDate) });
  }
  if (draft.priority !== 'normal') {
    chips.push({
      id: 'prio',
      field: 'priority',
      kinds: [],
      tone: 'detected',
      icon: <Flag className={cn('size-3.5', draft.priority === 'important' && 'text-ember')} />,
      label: draft.priority === 'important' ? 'Important' : 'Low priority',
    });
  }
  if (draft.project) {
    chips.push({
      id: 'proj',
      field: 'project',
      kinds: [],
      tone: 'detected',
      icon: project ? <ProjectGlyph project={project} size={12} /> : <Hash className="size-3.5" />,
      label: project ? project.name : `New project “${draft.project}”`,
    });
  }
  if (draft.assignee) {
    chips.push({
      id: 'who',
      field: 'assignee',
      kinds: [],
      tone: 'detected',
      icon: person ? <Avatar person={person} size={14} /> : <AtSign className="size-3.5" />,
      label: person ? person.name : `${draft.assignee} (new)`,
    });
  }
  if (draft.estimatedMinutes) {
    chips.push({ id: 'est', field: 'estimate', kinds: [], tone: 'detected', icon: <Hourglass className="size-3.5" />, label: formatDuration(draft.estimatedMinutes) });
  }

  return (
    <li className="group/draft animate-rise rounded-[12px] bg-paper px-4 pt-3 pb-3.5 shadow-[0_0_0_1px_rgb(29_28_26/0.06)]" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="flex items-start gap-3">
        <span className="mt-[7px] size-[18px] shrink-0 rounded-full border-[1.5px] border-ink-4" aria-hidden />
        <AutoTextarea
          value={draft.title}
          aria-label="Task title"
          onChange={(e) => onChange({ ...draft, title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          className="min-w-0 flex-1 bg-transparent py-1 text-[16px] leading-6 font-medium tracking-[-0.005em] text-ink outline-none"
        />
        {removable && (
          <button aria-label="Remove this task" onClick={onRemove} className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[7px] text-ink-4 transition-colors hover:bg-wash-strong hover:text-ember">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="pl-[30px]">
        {related && (
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <CornerDownRight className="size-3.5" />
              {asStep ? 'Becomes a step of' : 'Related to'} <span className="font-medium text-ink-2">“{related.title}”</span>
            </span>
            <button
              onClick={() => onAsStep(!asStep)}
              className="rounded-[5px] px-1.5 py-0.5 font-medium text-accent-ink transition-colors hover:bg-accent-wash"
            >
              {asStep ? 'Keep as its own task' : 'Add as a step there'}
            </button>
          </p>
        )}
        {chips.length > 0 && !asStep && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Chip key={c.id} spec={c} onDismiss={() => clear(c.field)} />
            ))}
          </div>
        )}

        {(draft.notes || draft.subtasks.length > 0) && !asStep && (
          <div className="mt-2.5 space-y-1.5">
            {draft.notes && (
              <AutoTextarea
                value={draft.notes}
                aria-label="Notes"
                onChange={(e) => onChange({ ...draft, notes: e.target.value })}
                className="w-full rounded-[6px] bg-transparent px-1 py-0.5 -mx-1 text-ui leading-5 text-ink-2 outline-none focus:bg-wash"
              />
            )}
            {draft.subtasks.length > 0 && (
              <ul>
                {draft.subtasks.map((s, i) => (
                  <li key={i} className="group/sub flex min-h-7 items-center gap-2.5 text-ui text-ink-2">
                    <span className="size-[13px] shrink-0 rounded-[3px] border-[1.5px] border-ink-4" aria-hidden />
                    <span className="flex-1">{s}</span>
                    <button
                      aria-label="Remove step"
                      onClick={() => onChange({ ...draft, subtasks: draft.subtasks.filter((_, j) => j !== i) })}
                      className="grid size-6 place-items-center rounded-[5px] text-ink-4 opacity-0 transition hover:bg-wash-strong group-hover/sub:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={cn('mt-2.5 flex items-center justify-between gap-3', asStep && 'hidden')}>
          <span className="inline-flex items-center gap-1.5 text-meta text-ink-3">
            <ArrowRight className="size-3.5" />
            Goes to <span className="font-medium text-ink-2">{destination(draft)}</span>
          </span>
          <label className="flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
            <Plus className="size-3.5 shrink-0" />
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSub.trim()) {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange({ ...draft, subtasks: [...draft.subtasks, newSub.trim()] });
                  setNewSub('');
                }
              }}
              placeholder="Add a step"
              className="w-28 min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-3 focus:w-40"
            />
          </label>
        </div>
      </div>
    </li>
  );
}

interface VoiceReviewProps {
  drafts: VoiceTaskDraft[];
  onChange: (drafts: VoiceTaskDraft[]) => void;
  /** Indexes the user chose to file as a step on the related task. */
  steps: Set<number>;
  onSteps: (next: Set<number>) => void;
  transcript: string;
  source: 'claude' | 'local';
  notice?: string;
  onAdd: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

export function VoiceReview({ drafts, onChange, steps, onSteps, transcript, source, notice, onAdd, onRetry, onDiscard }: VoiceReviewProps) {
  const [showHeard, setShowHeard] = useState(false);
  const valid = drafts.filter((d) => d.title.trim());

  return (
    <div className="flex max-h-[min(78vh,720px)] flex-col">
      <div className="shrink-0 px-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[26px] leading-8 text-ink">
            {drafts.length === 0 ? 'Nothing to do in that.' : drafts.length === 1 ? 'Here’s your task.' : `${drafts.length} tasks.`}
          </h2>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium',
              source === 'claude' ? 'bg-accent-wash text-accent-ink' : 'bg-wash-strong text-ink-3',
            )}
            title={source === 'claude' ? 'Analyzed by Claude' : 'Analyzed on your device'}
          >
            {source === 'claude' && <Sparkles className="size-3" />}
            {source === 'claude' ? 'Claude' : 'On-device'}
          </span>
        </div>
        <button onClick={() => setShowHeard((s) => !s)} className="mt-1.5 block max-w-full text-left text-meta text-ink-3 hover:text-ink-2">
          <span className="text-ink-4">You said </span>
          <span className={cn('italic', !showHeard && 'line-clamp-1')}>“{transcript}”</span>
        </button>
        {notice && <p className="mt-1 text-[11.5px] text-ink-4">{notice}</p>}
      </div>

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pt-4 pb-2">
        {drafts.map((d, i) => (
          <DraftCard
            key={i}
            index={i}
            draft={d}
            removable={drafts.length > 1}
            asStep={steps.has(i)}
            onAsStep={(on) => {
              const next = new Set(steps);
              if (on) next.add(i);
              else next.delete(i);
              onSteps(next);
            }}
            onChange={(next) => onChange(drafts.map((x, j) => (j === i ? next : x)))}
            onRemove={() => onChange(drafts.filter((_, j) => j !== i))}
          />
        ))}
        {drafts.length === 0 && <li className="py-2 text-ui text-ink-3">Try again and say what needs to be done — a person, an action, maybe a day.</li>}
      </ul>

      <div className="flex shrink-0 items-center gap-2 border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button onClick={onRetry} className="h-9 rounded-[9px] px-3 text-ui font-medium text-ink-2 transition-colors hover:bg-wash-strong">
          Record again
        </button>
        <button onClick={onDiscard} className="h-9 rounded-[9px] px-3 text-ui font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink-2">
          Discard
        </button>
        <span className="flex-1" />
        {valid.length > 0 && (
          <button
            onClick={onAdd}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-accent pr-2.5 pl-3.5 text-ui font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {steps.size === 0
              ? valid.length === 1
                ? 'Add task'
                : `Add ${valid.length} tasks`
              : steps.size === valid.length
                ? steps.size === 1
                  ? 'Add step'
                  : `Add ${steps.size} steps`
                : `Add ${valid.length} items`}
            <Kbd combo="enter" className="max-md:hidden [&_kbd]:bg-white/15 [&_kbd]:text-white [&_kbd]:shadow-none" />
          </button>
        )}
      </div>
    </div>
  );
}
