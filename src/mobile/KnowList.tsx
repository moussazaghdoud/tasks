import { BookOpen, CalendarDays, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { dueNow, FREE_PER_MONTH, reviewed, usedThisMonth, useDefinitions, type Definition } from '@/lib/know/store';
import { scheduleReviewNotice } from '@/lib/know/reviews';
import { usePro } from '@/lib/pro/store';
import { cn } from '@/lib/platform';
import { kt } from './knowI18n';
import { openDefinition } from './knowUi';

/**
 * The glossary: what is due for review first, then everything kept, newest
 * first. A term in review shows only its name until asked — the point is to
 * remember it before seeing it.
 */
export function KnowList({ query }: { query: string | null }) {
  const all = useDefinitions();
  const pro = usePro();
  const q = query?.trim().toLowerCase();
  const due = useMemo(() => (q ? [] : dueNow(new Date(), all)), [all, q]);
  const shown = useMemo(
    () =>
      q
        ? all.filter((d) => [d.term, d.sentence, ...d.bullets].some((s) => s.toLowerCase().includes(q)))
        : all,
    [all, q],
  );

  if (!all.length) {
    return (
      <div className="mx-auto max-w-[320px] pt-[12vh] text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
          <BookOpen className="size-7" strokeWidth={1.7} />
        </span>
        <p className="mt-5 text-[16px] leading-[23px] text-ink-2">{kt('empty')}</p>
        <p className="mt-3 text-[13.5px] leading-[19px] text-ink-4">{kt('empty_tip')}</p>
      </div>
    );
  }

  return (
    <div className="pt-1 pb-2">
      {due.length > 0 && (
        <section className="mb-5">
          <p className="px-2 pb-2 text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
            {kt('review_title')} · {due.length}
          </p>
          {due.map((d) => (
            <ReviewCard key={d.id} definition={d} />
          ))}
        </section>
      )}

      {shown.map((d) => (
        <button
          key={d.id}
          onClick={() => openDefinition(d.id)}
          className="thought-card mb-2 block w-full rounded-[15px] border border-line bg-sunk px-4 py-3.5 text-start active:opacity-80"
        >
          <span className="block text-[16px] font-semibold tracking-[-0.01em] text-ink">{d.term}</span>
          <span className="mt-1 block text-[14.5px] leading-[20px] text-ink-2">{d.sentence}</span>
          {d.bullets.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {d.bullets.map((b, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-[18px] text-ink-3">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-4" />
                  {b}
                </li>
              ))}
            </ul>
          )}
          <Meta definition={d} />
        </button>
      ))}

      {isNative() && !pro && (
        <p className="px-2 pt-3 text-center text-[12.5px] text-ink-4">
          {kt('free_left', { n: Math.max(0, FREE_PER_MONTH - usedThisMonth()) })}
        </p>
      )}
    </div>
  );
}

/** Where a definition came from: the meeting, Apple's model. */
function Meta({ definition: d }: { definition: Definition }) {
  if (!d.meeting && !d.byModel) return null;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.04em] text-ink-4 uppercase">
      {d.meeting && (
        <span className="flex items-center gap-1 text-tomorrow">
          <CalendarDays className="size-3" strokeWidth={2.1} />
          {kt('from_meeting', { subject: d.meeting.subject })}
        </span>
      )}
      {d.byModel && (
        <span className="flex items-center gap-1">
          <Sparkles className="size-3" strokeWidth={2.1} />
          {kt('by_model')}
        </span>
      )}
    </span>
  );
}

/** A term to recall: its name first, then — when asked — what it means. */
function ReviewCard({ definition: d }: { definition: Definition }) {
  const [open, setOpen] = useState(false);
  const answer = (knew: boolean) => {
    haptic(knew ? 'success' : 'light');
    reviewed(d.id, knew);
    void scheduleReviewNotice();
  };
  return (
    <div className="mb-2 rounded-[15px] border border-accent/25 bg-accent-soft px-4 py-3.5">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-[17px] font-semibold text-ink">{d.term}</span>
        {!open && (
          <button onClick={() => setOpen(true)} className="h-9 rounded-full bg-accent px-4 text-[14px] font-semibold text-on-accent">
            {kt('show')}
          </button>
        )}
      </div>
      {open && (
        <div className="animate-fade">
          <p className="mt-1.5 text-[14.5px] leading-[20px] text-ink-2">{d.sentence}</p>
          {d.bullets.map((b, i) => (
            <p key={i} className="mt-0.5 text-[13px] leading-[18px] text-ink-3">
              · {b}
            </p>
          ))}
          <div className="mt-3 flex gap-2">
            <button onClick={() => answer(true)} className={cn('h-10 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent')}>
              {kt('got_it')}
            </button>
            <button onClick={() => answer(false)} className="h-10 flex-1 rounded-full border border-line bg-raised text-[15px] font-medium text-ink-2">
              {kt('again')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
