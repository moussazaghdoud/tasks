import { ArrowUpRight, CalendarDays, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { writeOwn } from '@/lib/know/define';
import { definitions, forget, keep, update, useDefinitions } from '@/lib/know/store';
import { toast } from '@/store/toast';
import { Sheet, SheetAction, SheetDivider } from './Sheet';
import { t } from './i18n';
import { kt } from './knowI18n';
import { closeKnow, openEditor, useKnowSheet } from './knowUi';

/**
 * One definition: read it, follow it to its source, change it, or let it
 * go. The same sheet writes a definition from scratch — when nothing was
 * found, or for the company's own words, which no encyclopedia knows.
 */
export function KnowSheet() {
  const state = useKnowSheet();
  const all = useDefinitions();
  const definition = state.open && state.id ? all.find((d) => d.id === state.id) : undefined;

  if (!state.open) return null;
  if (state.editing) return <KnowEditor id={state.id} term={state.term} />;
  if (!definition) return null;

  const remove = () => {
    const kept = definitions().find((d) => d.id === definition.id);
    forget(definition.id);
    closeKnow();
    haptic('light');
    toast(kt('deleted'), {
      action: {
        label: t('undo'),
        run: () => {
          if (kept) keep(kept);
        },
      },
    });
  };

  return (
    <Sheet open onClose={closeKnow} label={definition.term}>
      <div className="px-6 pb-3">
        <h2 className="text-[24px] leading-8 font-bold tracking-[-0.02em] text-ink">{definition.term}</h2>
        <p className="mt-2 text-[17px] leading-[25px] text-ink">{definition.sentence}</p>
        {definition.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {definition.bullets.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-[21px] text-ink-2">
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" />
                {b}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 space-y-1.5 text-[13px] text-ink-3">
          {definition.meeting && (
            <p className="flex items-center gap-1.5 text-tomorrow">
              <CalendarDays className="size-3.5" strokeWidth={2} />
              {kt('from_meeting', { subject: definition.meeting.subject })}
            </p>
          )}
          {definition.byModel && (
            <p className="flex items-center gap-1.5">
              <Sparkles className="size-3.5" strokeWidth={2} />
              {kt('by_model')}
            </p>
          )}
          {definition.source && (
            <a href={definition.source.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-accent">
              {kt('source', { title: definition.source.title })}
              <ArrowUpRight className="size-3.5" strokeWidth={2} />
            </a>
          )}
        </div>
      </div>
      <SheetDivider />
      <SheetAction icon={Pencil} label={kt('edit')} onClick={() => openEditor({ id: definition.id })} />
      <SheetAction icon={Trash2} label={kt('delete')} tone="danger" onClick={remove} />
    </Sheet>
  );
}

/** Writing or changing a definition: the term, a sentence, a point per line. */
function KnowEditor({ id, term: asked }: { id?: string; term?: string }) {
  const existing = id ? definitions().find((d) => d.id === id) : undefined;
  const [term, setTerm] = useState(existing?.term ?? asked ?? '');
  const [sentence, setSentence] = useState(existing?.sentence ?? '');
  const [points, setPoints] = useState(existing?.bullets.join('\n') ?? '');
  useEffect(() => {
    setTerm(existing?.term ?? asked ?? '');
    setSentence(existing?.sentence ?? '');
    setPoints(existing?.bullets.join('\n') ?? '');
  }, [id, asked, existing?.term, existing?.sentence, existing?.bullets]);

  const ready = term.trim() && sentence.trim();
  const save = () => {
    if (!ready) return;
    const bullets = points.split('\n').map((p) => p.trim()).filter(Boolean);
    if (existing) update(existing.id, { term: term.trim(), sentence: sentence.trim(), bullets });
    else writeOwn(term, sentence, bullets);
    haptic('success');
    closeKnow();
  };

  const field = 'w-full rounded-[14px] border border-line bg-sunk px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/50';
  return (
    <Sheet open onClose={closeKnow} label={kt('edit')}>
      <div className="flex items-center gap-3 px-6 pt-1 pb-3">
        <button onClick={closeKnow} className="-ms-2 h-11 shrink-0 px-2 text-[17px] text-ink-3 active:opacity-60">
          {t('cancel')}
        </button>
        <span className="flex-1" />
        <button onClick={save} disabled={!ready} className="-me-2 h-11 shrink-0 px-2 text-[17px] font-semibold text-accent disabled:opacity-30">
          {kt('save')}
        </button>
      </div>
      <div className="space-y-3 px-5 pb-4">
        <label className="block">
          <span className="px-1 text-[12px] font-semibold tracking-[0.06em] text-ink-4 uppercase">{kt('term_label')}</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} maxLength={80} className={`mt-1 ${field}`} />
        </label>
        <label className="block">
          <span className="px-1 text-[12px] font-semibold tracking-[0.06em] text-ink-4 uppercase">{kt('sentence_label')}</span>
          <textarea value={sentence} onChange={(e) => setSentence(e.target.value)} rows={3} className={`mt-1 resize-none ${field}`} />
        </label>
        <label className="block">
          <span className="px-1 text-[12px] font-semibold tracking-[0.06em] text-ink-4 uppercase">{kt('points_label')}</span>
          <textarea value={points} onChange={(e) => setPoints(e.target.value)} rows={4} className={`mt-1 resize-none ${field}`} />
        </label>
      </div>
    </Sheet>
  );
}
