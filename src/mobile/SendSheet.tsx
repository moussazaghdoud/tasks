import { Check, Copy, Forward, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Task } from '@/domain/types';
import { identity, setMyName, useMyName } from '@/lib/share/identity';
import { people as listPeople, usePeopleBook } from '@/lib/share/people';
import { cn } from '@/lib/platform';
import { Sheet } from './Sheet';
import { st } from './shareI18n';
import { announceName, send } from './sharing';

/**
 * Send a thought to people or a team, then say whether you keep it: there is
 * no default, because keeping a copy and handing it over are different
 * promises.
 */
export function SendSheet({ task, open, onClose }: { task: Task; open: boolean; onClose: () => void }) {
  const book = usePeopleBook();
  const everyone = listPeople();
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (!open) setChosen([]);
  }, [open]);

  const toggle = (ids: string[]) =>
    setChosen((now) => {
      const all = ids.every((id) => now.includes(id));
      return all ? now.filter((id) => !ids.includes(id)) : [...new Set([...now, ...ids])];
    });

  // A thought from no one arrives as "Someone": a name comes first.
  const myName = useMyName();
  const [name, setName] = useState('');

  const go = (mode: 'copy' | 'transfer') => {
    const to = everyone.filter((p) => chosen.includes(p.id));
    onClose();
    void send(task, to, mode);
  };

  const saveName = async () => {
    await identity();
    setMyName(name);
    // Those who already have us get the name too.
    if (everyone.length) announceName();
  };

  const row = 'flex h-[54px] w-full items-center gap-4 px-6 text-start text-[17px] text-ink transition-colors active:bg-wash-strong';
  const tick = (on: boolean) => (
    <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border', on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')}>
      {on && <Check className="size-4" strokeWidth={2.4} />}
    </span>
  );

  return (
    <Sheet open={open} onClose={onClose} label={st('send_title')} title={st('send_title')}>
      {!myName.trim() ? (
        <div className="px-6 pb-4">
          <p className="pb-3 text-[15px] leading-[22px] text-ink-3">{st('name_needed')}</p>
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder={st('my_name_placeholder')}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && saveName()}
            className="h-12 w-full rounded-[14px] border border-line bg-sunk px-4 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/50"
          />
          <button
            disabled={!name.trim()}
            onClick={saveName}
            className="mt-2.5 h-12 w-full rounded-[14px] bg-accent text-[16px] font-semibold text-on-accent disabled:opacity-35"
          >
            {st('continue')}
          </button>
        </div>
      ) : everyone.length === 0 ? (
        <p className="px-6 pb-4 text-[15px] leading-[22px] text-ink-3">{st('share_no_people')}</p>
      ) : (
        <>
          <div className="border-t border-line">
            {book.teams
              .filter((team) => team.members.some((id) => book.people[id]))
              .map((team) => {
                const ids = team.members.filter((id) => book.people[id]);
                return (
                  <button key={team.id} onClick={() => toggle(ids)} className={cn(row, 'border-b border-line')}>
                    {tick(ids.every((id) => chosen.includes(id)))}
                    <Users className="size-[19px] shrink-0 text-ink-3" strokeWidth={1.8} />
                    <span className="flex-1 truncate">{team.name}</span>
                    <span className="text-[14px] text-ink-4">{st('team_members', { n: ids.length })}</span>
                  </button>
                );
              })}
            {everyone.map((person) => (
              <button key={person.id} onClick={() => toggle([person.id])} className={cn(row, 'border-b border-line')}>
                {tick(chosen.includes(person.id))}
                <span className="flex-1 truncate">{person.name || st('someone')}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 px-6 pt-4 pb-2">
            <button
              disabled={!chosen.length}
              onClick={() => go('copy')}
              className="flex flex-col items-center gap-1 rounded-[16px] border border-line bg-sunk py-3 text-ink transition-opacity active:bg-wash-strong disabled:opacity-35"
            >
              <Copy className="size-5 text-accent" strokeWidth={1.9} />
              <span className="text-[16px] font-semibold">{st('send_copy')}</span>
              <span className="text-[12.5px] text-ink-3">{st('send_copy_note')}</span>
            </button>
            <button
              disabled={!chosen.length}
              onClick={() => go('transfer')}
              className="flex flex-col items-center gap-1 rounded-[16px] border border-line bg-sunk py-3 text-ink transition-opacity active:bg-wash-strong disabled:opacity-35"
            >
              <Forward className="size-5 text-accent" strokeWidth={1.9} />
              <span className="text-[16px] font-semibold">{st('send_transfer')}</span>
              <span className="text-[12.5px] text-ink-3">{st('send_transfer_note')}</span>
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
