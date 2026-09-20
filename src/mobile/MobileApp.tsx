import { Search, Settings2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Space, Task } from '@/domain/types';
import { todayKey } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { haptic } from '@/lib/native/bridge';
import { CaptureBar } from './CaptureBar';
import { greetingIn, t, useLang } from './i18n';
import { SettingsSheet } from './SettingsSheet';
import { spaceOf, useSpace } from './space';
import { SpaceTabs } from './SpaceTabs';
import { ThoughtRow } from './ThoughtRow';
import { ThoughtSheet } from './ThoughtSheet';

/**
 * The whole application on a phone.
 *
 * One surface, because the product is one idea: the things you asked it to
 * remember. There is no tab bar, no sidebar and no second screen to learn —
 * what you captured is the content, the microphone is the action, and
 * everything else waits inside a sheet until you ask for it.
 */
export function MobileApp() {
  const tasks = useWorkspace((s) => s.tasks);
  const name = useWorkspace((s) => s.user.name);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const space = useSpace();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Subscribe so every caption on this screen re-renders when the language changes.
  useLang();

  // Premium Dark is the phone's theme. It goes on <html> rather than this
  // element so sheets and toasts — which portal to the end of <body> — are
  // painted from the same tokens.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    return () => root.removeAttribute('data-theme');
  }, []);

  const { open, doneToday, counts } = useMemo(() => {
    const live = Object.values(tasks).filter((t) => !t.archivedAt);
    const today = todayKey();
    const q = query?.trim().toLowerCase();
    const matches = (t: Task) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q);
    // Both halves are counted before filtering, so the other tab can say how
    // much is waiting over there without you having to look.
    const counts: Record<Space, number> = { business: 0, private: 0 };
    for (const t of live) if (t.status !== 'done') counts[spaceOf(t)]++;

    const all = live.filter((t) => spaceOf(t) === space);
    return {
      counts,
      // Important first, then newest: what you just said is what you are
      // thinking about, unless you have said something matters more.
      open: all
        .filter((t) => t.status !== 'done' && matches(t))
        .sort((a, b) => {
          const rank = (t: Task) => (t.priority === 'important' ? 0 : 1);
          return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
        }),
      doneToday: all
        .filter((t) => t.status === 'done' && t.completedAt?.slice(0, 10) === today && matches(t))
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    };
  }, [tasks, query, space]);

  const searching = query !== null;

  return (
    <div className="flex h-dvh flex-col bg-paper font-display">
      <header className="sticky top-0 z-30 shrink-0 bg-paper/88 pt-safe backdrop-blur-xl">
        <div className="flex min-h-[74px] items-center gap-2 px-[22px] pt-2 pb-3">
          {searching ? (
            <>
              <Search className="size-[18px] shrink-0 text-ink-3" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search')}
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-4"
              />
              <button
                onClick={() => setQuery(null)}
                aria-label={t('cancel')}
                className="-mr-2 grid size-11 place-items-center rounded-full text-ink-3 active:bg-wash-strong"
              >
                <X className="size-5" />
              </button>
            </>
          ) : (
            <>
              {/* The greeting is the quiet line; the count is the headline,
                  because the number of things you are carrying is the thing
                  you actually want to know. */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] leading-5 font-medium tracking-[0.01em] text-ink-3">
                  {greetingIn()}
                  {name ? `, ${name.split(' ')[0]}` : ''}
                </p>
                <h1 className="mt-[3px] text-[26px] leading-8 font-bold tracking-[-0.03em] text-ink">
                  {open.length === 0 ? t('nothing_kept') : open.length === 1 ? t('thoughts_one') : t('thoughts_many', { n: open.length })}
                </h1>
              </div>
              <button
                onClick={() => setQuery('')}
                aria-label={t('search')}
                className="grid size-11 shrink-0 place-items-center rounded-full text-ink-3 transition-colors active:bg-wash-strong"
              >
                <Search className="size-[20px]" strokeWidth={1.8} />
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label={t('settings')}
                className="-mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-ink-3 transition-colors active:bg-wash-strong"
              >
                <Settings2 className="size-[20px]" strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
        {!searching && (
          <div className="px-[22px] pb-3">
            <SpaceTabs active={space} counts={counts} />
          </div>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-[184px]">
        {open.length === 0 && doneToday.length === 0 ? (
          <Empty searching={searching} />
        ) : (
          <>
            <ul className="pt-1">
              {open.map((t) => (
                <li key={t.id}>
                  <ThoughtRow task={t} onOpen={() => setOpenId(t.id)} />
                </li>
              ))}
            </ul>

            {doneToday.length > 0 && (
              <div className={cn(open.length > 0 && 'mt-6')}>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    aria-expanded={showDone}
                    className="h-11 px-2 text-[13px] font-medium tracking-[0.03em] text-ink-4 transition-colors active:text-ink-3"
                  >
                    {t('done_today', { n: doneToday.length })}
                  </button>
                  {/* Clearing finished thoughts is a sweep, not a selection:
                      you are never picking which of them to keep. One tap does
                      it, and the undo covers the misfire. */}
                  <button
                    onClick={() => {
                      const ids = doneToday.map((task) => task.id);
                      const undo = ws().transact(() => ws().remove(ids));
                      haptic('medium');
                      toast(t('deleted_many', { n: ids.length }), { action: { label: t('undo'), run: undo } });
                    }}
                    className="h-11 px-2 text-[13px] font-medium tracking-[0.03em] text-ink-4 transition-colors active:text-ember"
                  >
                    {t('clear_done')}
                  </button>
                </div>
                {showDone && (
                  <ul className="animate-fade">
                    {doneToday.map((t) => (
                      <li key={t.id}>
                        <ThoughtRow task={t} onOpen={() => setOpenId(t.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </main>

      <CaptureBar />
      <ThoughtSheet taskId={openId} onClose={() => setOpenId(null)} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/**
 * The empty screen teaches the product in one line, then gets out of the way.
 * The microphone below it is the rest of the instruction.
 */
function Empty({ searching }: { searching: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-28">
      <p className="text-[21px] font-semibold tracking-[-0.025em] text-ink-2">
        {searching ? t('empty_search') : t('empty_title')}
      </p>
      {!searching && <p className="mt-2.5 text-[14px] text-ink-4">{t('empty_hint')}</p>}
    </div>
  );
}
