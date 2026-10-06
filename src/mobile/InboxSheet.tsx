import { Ban, Bell, Flag, Inbox, UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { useInbox, type Incoming } from '@/lib/share/mailbox';
import { personOf, usePeopleBook } from '@/lib/share/people';
import { Sheet } from './Sheet';
import { dayTimeIn } from './i18n';
import { st } from './shareI18n';
import { acceptRequest, acceptThought, block, declineRequest, declineThought, report } from './sharing';

const nameOf = (id: string): string => personOf(id)?.name || st('someone');

/**
 * What can be shown now: thoughts from people in the book. The rest wait
 * behind their sender's request, and appear once it is accepted.
 */
function useVisibleInbox() {
  usePeopleBook();
  const { requests, thoughts } = useInbox();
  const shown = thoughts.filter((item) => personOf(item.from));
  const waiting = (id: string) => thoughts.filter((item: Incoming) => item.from === id).length;
  return { requests, thoughts: shown, waiting };
}

/** The line over the list when something has arrived. Tapping it opens what came. */
export function InboxBanner({ onOpen }: { onOpen: () => void }) {
  const { requests, thoughts } = useVisibleInbox();
  const n = requests.length + thoughts.length;
  if (!n) return null;
  const text =
    n > 1
      ? st('inbox_banner_many', { n })
      : thoughts[0]
        ? st('inbox_banner_one', { name: nameOf(thoughts[0].from) })
        : st('request_text', { name: requests[0].card.name || st('someone') });
  return (
    <button
      onClick={onOpen}
      className="mx-1 mt-1 mb-2 flex w-[calc(100%-0.5rem)] animate-fade items-center gap-3 rounded-[16px] border border-accent/25 bg-accent-soft px-4 py-3 text-start active:opacity-80"
    >
      <Inbox className="size-5 shrink-0 text-accent" strokeWidth={1.9} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-accent">{text}</span>
    </button>
  );
}

/** What others sent: people asking to be added, and thoughts to accept or decline. */
export function InboxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { requests, thoughts, waiting } = useVisibleInbox();
  const empty = !requests.length && !thoughts.length;
  // Nothing left to decide: the sheet has done its job.
  useEffect(() => {
    if (open && empty) onClose();
  }, [open, empty, onClose]);

  const small = 'flex h-8 items-center gap-1 px-1 text-[13px] font-medium text-ink-4 active:opacity-60';
  const choice = (accept: () => void, decline: () => void) => (
    <div className="mt-3 flex gap-2">
      <button onClick={accept} className="h-10 flex-1 rounded-full bg-accent text-[15px] font-semibold text-on-accent active:opacity-80">
        {st('accept')}
      </button>
      <button onClick={decline} className="h-10 flex-1 rounded-full border border-line bg-sunk text-[15px] font-medium text-ink-2 active:bg-wash-strong">
        {st('decline')}
      </button>
    </div>
  );
  const safety = (person: { id: string; name: string }) => (
    <div className="mt-1.5 flex gap-3">
      <button onClick={() => block(person)} className={small}>
        <Ban className="size-3.5" strokeWidth={2} />
        {st('person_block')}
      </button>
      <button onClick={() => report(person)} className={small}>
        <Flag className="size-3.5" strokeWidth={2} />
        {st('person_report')}
      </button>
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} label={st('inbox_title')} title={st('inbox_title')}>
      {requests.map((request) => (
        <div key={request.id} className="border-t border-line px-6 py-4">
          <p className="flex items-center gap-2.5 text-[16px] leading-[22px] text-ink">
            <UserPlus className="size-5 shrink-0 text-accent" strokeWidth={1.9} />
            {st('request_text', { name: request.card.name || st('someone') })}
          </p>
          {waiting(request.card.id) > 0 && (
            <p className="mt-1 ps-[30px] text-[13px] text-ink-3">{st('waiting_thoughts', { n: waiting(request.card.id) })}</p>
          )}
          {choice(
            () => acceptRequest(request),
            () => declineRequest(request),
          )}
          {safety({ id: request.card.id, name: request.card.name })}
        </div>
      ))}
      {thoughts.map((item) => (
        <div key={item.id} className="border-t border-line px-6 py-4">
          <p className="text-[12.5px] font-medium text-ink-4">
            {(item.thought.mode === 'transfer' ? st('transferred_by', { name: nameOf(item.from) }) : st('from_person', { name: nameOf(item.from) })) +
              ' · ' +
              dayTimeIn(new Date(item.at))}
          </p>
          <p className="mt-1 text-[17px] leading-[24px] whitespace-pre-line text-ink">{item.thought.title}</p>
          {item.thought.notes && <p className="mt-1 text-[14px] leading-[20px] whitespace-pre-line text-ink-3">{item.thought.notes}</p>}
          {item.thought.reminderAt && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-3">
              <Bell className="size-3.5" strokeWidth={2} />
              {dayTimeIn(new Date(item.thought.reminderAt))}
            </p>
          )}
          {choice(
            () => acceptThought(item),
            () => declineThought(item),
          )}
          {safety({ id: item.from, name: nameOf(item.from) })}
        </div>
      ))}
    </Sheet>
  );
}
