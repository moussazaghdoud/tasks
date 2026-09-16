import { FloatingFocusManager, FloatingPortal, useFloating } from '@floating-ui/react';
import { ArrowRight, CalendarArrowUp, CalendarDays, Flag, FolderInput, Moon, Sun, Sunrise, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ID } from '@/domain/types';
import { addDaysKey, nextWeekKey, relativeTime, todayKey } from '@/lib/dates';
import { cn, isTypingTarget } from '@/lib/platform';
import { isInbox, useInboxData } from '@/store/selectors';
import { useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { Kbd } from '@/components/ui/Kbd';
import { PickerContent } from '@/components/pickers/PickerContent';

type Outcome = 'today' | 'tomorrow' | 'nextweek' | 'later' | 'scheduled' | 'filed' | 'deleted' | 'skipped';

function TriageBody({ onExit }: { onExit: () => void }) {
  const { open } = useInboxData();
  const [queue] = useState<ID[]>(() => open.map((t) => t.id));
  const [index, setIndex] = useState(0);
  const [picker, setPicker] = useState<'date' | 'project' | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const tasks = useWorkspace((s) => s.tasks);
  const weekStartsOn = useWorkspace((s) => s.user.preferences.weekStartsOn);

  // Skip anything that left the inbox by other means.
  const currentId = queue.slice(index).find((id) => tasks[id] && isInbox(tasks[id]));
  const current = currentId ? tasks[currentId] : undefined;
  const position = currentId ? queue.indexOf(currentId) : queue.length;

  const advance = (o: Outcome) => {
    setOutcomes((x) => [...x, o]);
    setPicker(null);
    setIndex(position + 1);
  };

  const today = todayKey();
  const act = (o: Outcome) => {
    if (!current) return;
    const id = current.id;
    const s = ws();
    if (o === 'today') s.setDue([id], today);
    if (o === 'tomorrow') s.setDue([id], addDaysKey(today, 1));
    if (o === 'nextweek') s.setDue([id], nextWeekKey(today, weekStartsOn));
    if (o === 'later') s.defer([id]);
    if (o === 'deleted') {
      const undo = s.transact(() => s.remove([id]));
      toast('Deleted', { detail: current.title, action: { label: 'Undo', run: () => (undo(), setIndex(position)) } });
    }
    advance(o);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picker || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, () => void> = {
        '1': () => act('today'),
        t: () => act('today'),
        '2': () => act('tomorrow'),
        '3': () => act('nextweek'),
        '4': () => act('later'),
        l: () => act('later'),
        d: () => setPicker('date'),
        p: () => setPicker('project'),
        m: () => setPicker('project'),
        i: () => current && ws().toggleImportant([current.id]),
        Backspace: () => act('deleted'),
        Delete: () => act('deleted'),
        ArrowRight: () => advance('skipped'),
        s: () => advance('skipped'),
        Escape: onExit,
      };
      const fn = map[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!current) {
    const sorted = outcomes.filter((o) => o !== 'skipped').length;
    const skipped = outcomes.length - sorted;
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="font-serif text-[34px] leading-10 text-ink">{outcomes.length ? 'Inbox sorted.' : 'Nothing waiting for you.'}</p>
        {outcomes.length > 0 && (
          <p className="mt-3 text-ink-3">
            {sorted} {sorted === 1 ? 'task' : 'tasks'} organized{skipped ? `, ${skipped} left in the Inbox` : ''}.
          </p>
        )}
        <button onClick={onExit} className="mt-8 h-10 rounded-[10px] bg-accent px-5 font-medium text-white hover:bg-accent-hover">
          Done
        </button>
      </div>
    );
  }

  const Btn = ({ k, icon, label, onClick, tone }: { k: string; icon: React.ReactNode; label: string; onClick: () => void; tone?: 'danger' }) => (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-11 items-center gap-2.5 rounded-[10px] bg-raised pr-2.5 pl-3 text-ui font-medium shadow-composer transition-[box-shadow,color] hover:shadow-pop',
        tone === 'danger' ? 'text-ink-3 hover:text-ember' : 'text-ink-2 hover:text-ink',
      )}
    >
      <span className="text-ink-3 group-hover:text-current">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <Kbd combo={k} subtle />
    </button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col px-6 pt-[10vh] pb-10 max-md:pt-6">
      <div className="flex items-center gap-3 text-meta text-ink-3">
        <span className="font-num">
          {position + 1} of {queue.length}
        </span>
        <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-wash-strong">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(position / queue.length) * 100}%` }} />
        </div>
      </div>

      <div key={current.id} className="mt-10 animate-rise">
        <p className="text-meta text-ink-3">Captured {relativeTime(current.createdAt)}</p>
        <h1 className="mt-2 text-[30px] leading-[38px] font-semibold tracking-[-0.02em] text-ink max-md:text-[25px] max-md:leading-8">
          {current.priority === 'important' && <Flag className="mr-2 mb-1 inline size-5 text-ember" fill="currentColor" />}
          {current.title}
        </h1>
        {current.notes && <p className="mt-3 line-clamp-3 text-[14.5px] leading-6 text-ink-3">{current.notes}</p>}
      </div>

      <p className="mt-10 mb-3 label-caps">When will you do it?</p>
      {picker ? (
        <div className="animate-pop overflow-hidden rounded-pop bg-raised shadow-pop">
          <PickerContent
            kind={picker}
            taskIds={[current.id]}
            size="palette"
            onDone={() => advance(picker === 'date' ? 'scheduled' : 'filed')}
            onExit={() => setPicker(null)}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Btn k="1" icon={<Sun className="size-4" />} label="Today" onClick={() => act('today')} />
            <Btn k="2" icon={<Sunrise className="size-4" />} label="Tomorrow" onClick={() => act('tomorrow')} />
            <Btn k="3" icon={<CalendarArrowUp className="size-4" />} label="Next week" onClick={() => act('nextweek')} />
            <Btn k="4" icon={<Moon className="size-4" />} label="Later" onClick={() => act('later')} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Btn k="d" icon={<CalendarDays className="size-4" />} label="Pick date" onClick={() => setPicker('date')} />
            <Btn k="p" icon={<FolderInput className="size-4" />} label="Project" onClick={() => setPicker('project')} />
            <Btn k="i" icon={<Flag className="size-4" />} label={current.priority === 'important' ? 'Unmark' : 'Important'} onClick={() => ws().toggleImportant([current.id])} />
            <Btn k="backspace" icon={<Trash2 className="size-4" />} label="Delete" tone="danger" onClick={() => act('deleted')} />
          </div>
          <button onClick={() => advance('skipped')} className="mt-5 inline-flex items-center gap-1.5 self-start rounded-[7px] px-2 py-1 text-meta font-medium text-ink-3 hover:bg-wash-strong hover:text-ink-2">
            Leave in Inbox <ArrowRight className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

export function TriageMode() {
  const open = useUi((s) => s.triageOpen);
  const setTriage = useUi((s) => s.setTriage);
  const { refs, context } = useFloating({ open });
  if (!open) return null;
  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} initialFocus={-1}>
        <div ref={refs.setFloating} role="dialog" aria-label="Triage inbox" className="fixed inset-0 z-[75] flex animate-fade flex-col overflow-y-auto bg-paper">
          <div className="flex h-14 shrink-0 items-center justify-between px-5 pt-safe">
            <span className="text-meta font-medium text-ink-3">Triage · Inbox</span>
            <button onClick={() => setTriage(false)} className="flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-meta font-medium text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink">
              <Kbd combo="esc" subtle /> Exit
              <X className="size-4" />
            </button>
          </div>
          <TriageBody onExit={() => setTriage(false)} />
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}
