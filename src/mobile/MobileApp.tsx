import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { Task } from '@/domain/types';
import { greeting, todayKey } from '@/lib/dates';
import { cn } from '@/lib/platform';
import { useWorkspace } from '@/store/workspace';
import { CaptureBar } from './CaptureBar';
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

  const { open, doneToday } = useMemo(() => {
    const all = Object.values(tasks).filter((t) => !t.archivedAt);
    const today = todayKey();
    const q = query?.trim().toLowerCase();
    const matches = (t: Task) => !q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q);
    return {
      // Newest thought first: what you just said is what you are thinking about.
      open: all
        .filter((t) => t.status !== 'done' && matches(t))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      doneToday: all
        .filter((t) => t.status === 'done' && t.completedAt?.slice(0, 10) === today && matches(t))
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    };
  }, [tasks, query]);

  const searching = query !== null;

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 shrink-0 bg-paper/92 pt-safe backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-5">
          {searching ? (
            <>
              <Search className="size-[18px] shrink-0 text-ink-3" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-4"
              />
              <button
                onClick={() => setQuery(null)}
                aria-label="Close search"
                className="-mr-2 grid size-11 place-items-center rounded-full text-ink-3 active:bg-wash-strong"
              >
                <X className="size-5" />
              </button>
            </>
          ) : (
            <>
              <h1 className="flex-1 truncate font-serif text-[26px] leading-8 tracking-[-0.01em] text-ink">
                {greeting()}
                {name ? `, ${name.split(' ')[0]}` : ''}
              </h1>
              <button
                onClick={() => setQuery('')}
                aria-label="Search"
                className="-mr-2 grid size-11 place-items-center rounded-full text-ink-3 active:bg-wash-strong"
              >
                <Search className="size-[20px]" strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[168px]">
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
                <button
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="h-11 text-[14px] text-ink-4 transition-colors active:text-ink-3"
                >
                  {doneToday.length} done today
                </button>
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
    </div>
  );
}

/**
 * The empty screen teaches the product in one line, then gets out of the way.
 * The microphone below it is the rest of the instruction.
 */
function Empty({ searching }: { searching: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-24">
      <p className="font-serif text-[24px] tracking-[-0.01em] text-ink-3">
        {searching ? 'Nothing found.' : 'What’s on your mind?'}
      </p>
      {!searching && <p className="mt-2 text-[15px] text-ink-4">Tap and speak.</p>}
    </div>
  );
}
