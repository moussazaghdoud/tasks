import { Ban, Check, Flag, Plus, ScanLine, Send, Trash2, UserMinus, Users } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { scanCode } from '@/lib/native/photos';
import { cardLink } from '@/lib/share/card';
import { identity, setMyName, useMyName } from '@/lib/share/identity';
import { people as listPeople, removeTeam, saveTeam, usePeopleBook, type Person, type Team } from '@/lib/share/people';
import { cn } from '@/lib/platform';
import { toast } from '@/store/toast';
import { Sheet } from './Sheet';
import { t } from './i18n';
import { st } from './shareI18n';
import { addFromText, block, remove, report } from './sharing';

const LABEL = 'px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase';
const ROW = 'flex h-[58px] w-full items-center gap-4 px-6 text-start text-[17px] text-ink transition-colors active:bg-wash-strong disabled:opacity-40';
const PILL = 'flex h-9 items-center gap-1.5 rounded-full border border-line bg-sunk px-3.5 text-[14px] font-medium active:bg-wash-strong';

/**
 * The people this Hence can send thoughts to, and your own code for them to
 * scan. No account and no directory: a person is added by their code, and
 * the code is all anyone needs to add you.
 */
export function PeopleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const myName = useMyName();
  const [name, setName] = useState(myName);
  const [qr, setQr] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Team> | null>(null);
  useEffect(() => setName(myName), [myName]);
  // Subscribing re-renders on any change; the sorted list is read after it.
  const book = usePeopleBook();
  const everyone = listPeople();

  // The code carries the name, so it is redrawn when the name changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void identity().then(async (me) => {
      const next = cardLink({ id: me.id, name: me.name, publicKey: me.keys.publicKey });
      const image = await QRCode.toDataURL(next, { margin: 1, width: 480, errorCorrectionLevel: 'M' });
      if (live) {
        setLink(next);
        setQr(image);
      }
    });
    return () => {
      live = false;
    };
  }, [open, myName]);

  useEffect(() => {
    if (!open) {
      setOpenPerson(null);
      setEditing(null);
    }
  }, [open]);

  const named = myName.trim().length > 0;
  const needName = () => {
    toast(st('name_needed'));
    return false;
  };

  const sendCode = async () => {
    if (!named) return needName();
    const text = st('send_my_code_message', { link });
    try {
      if (isNative()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ text, dialogTitle: st('send_my_code') });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        toast(t('copied'));
      }
    } catch {
      /* dismissed */
    }
  };

  const scan = async () => {
    if (!named) return needName();
    const codes = await scanCode();
    if (codes === null) return;
    if (!codes.some((code) => addFromText(code))) toast(st('scan_none'));
  };

  return (
    <Sheet open={open} onClose={onClose} label={st('people_title')} title={st('people_title')}>
      <p className={LABEL}>{st('my_name_label')}</p>
      <div className="px-6">
        <input
          value={name}
          maxLength={40}
          placeholder={st('my_name_placeholder')}
          onChange={(e) => setName(e.target.value)}
          onBlur={async () => {
            await identity();
            setMyName(name);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="h-12 w-full rounded-[14px] border border-line bg-sunk px-4 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/50"
        />
      </div>

      <p className={cn(LABEL, 'mt-6')}>{st('my_code')}</p>
      <div className="flex flex-col items-center px-6">
        <div className={cn('rounded-[20px] bg-white p-3', !named && 'opacity-30')}>
          {qr ? <img src={qr} alt={st('my_code')} className="size-[200px]" /> : <div className="size-[200px]" />}
        </div>
        <p className="pt-3 text-center text-[12.5px] leading-[18px] text-ink-3">{named ? st('my_code_note') : st('name_needed')}</p>
      </div>
      <div className="mt-3 border-t border-line">
        <button onClick={() => void sendCode()} className={ROW}>
          <Send className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
          <span className="flex-1">{st('send_my_code')}</span>
        </button>
        {isNative() && (
          <button onClick={() => void scan()} className={cn(ROW, 'border-t border-line')}>
            <ScanLine className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
            <span className="flex-1">{st('scan_code')}</span>
          </button>
        )}
      </div>

      <p className={cn(LABEL, 'mt-6')}>{st('people_title')}</p>
      {everyone.length === 0 ? (
        <p className="px-6 pb-2 text-[14px] leading-[20px] text-ink-3">{st('people_empty')}</p>
      ) : (
        <div className="border-t border-line">
          {everyone.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              open={openPerson === person.id}
              onToggle={() => setOpenPerson(openPerson === person.id ? null : person.id)}
            />
          ))}
        </div>
      )}

      {everyone.length > 0 && (
        <>
          <p className={cn(LABEL, 'mt-6')}>{st('teams_title')}</p>
          <div className="border-t border-line">
            {book.teams.map((team) =>
              editing?.id === team.id ? (
                <TeamEditor key={team.id} team={editing} people={everyone} onDone={() => setEditing(null)} />
              ) : (
                <button key={team.id} onClick={() => setEditing(team)} className={cn(ROW, 'border-b border-line')}>
                  <Users className="size-[20px] shrink-0 text-ink-3" strokeWidth={1.8} />
                  <span className="flex-1 truncate">{team.name}</span>
                  <span className="text-[14px] text-ink-4">{st('team_members', { n: team.members.length })}</span>
                </button>
              ),
            )}
            {editing && !editing.id ? (
              <TeamEditor team={editing} people={everyone} onDone={() => setEditing(null)} />
            ) : (
              <button onClick={() => setEditing({ name: '', members: [] })} className={ROW}>
                <Plus className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
                <span className="flex-1">{st('team_new')}</span>
              </button>
            )}
          </div>
        </>
      )}

      <p className="px-6 pt-4 pb-2 text-[12.5px] leading-[18px] text-ink-3">{st('people_note')}</p>
    </Sheet>
  );
}

function PersonRow({ person, open, onToggle }: { person: Person; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-line">
      <button onClick={onToggle} className={ROW}>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent">
          {(person.name || '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 truncate">{person.name || st('someone')}</span>
      </button>
      {open && (
        <div className="flex animate-fade flex-wrap gap-2 px-6 pb-4">
          <button onClick={() => remove(person)} className={cn(PILL, 'text-ink-2')}>
            <UserMinus className="size-4" strokeWidth={1.9} />
            {st('person_remove')}
          </button>
          <button onClick={() => block(person)} className={cn(PILL, 'text-ember')}>
            <Ban className="size-4" strokeWidth={1.9} />
            {st('person_block')}
          </button>
          <button onClick={() => report(person)} className={cn(PILL, 'text-ink-2')}>
            <Flag className="size-4" strokeWidth={1.9} />
            {st('person_report')}
          </button>
        </div>
      )}
    </div>
  );
}

/** A team is only a name for several people at once, kept on this phone. */
function TeamEditor({ team, people, onDone }: { team: Partial<Team>; people: Person[]; onDone: () => void }) {
  const [name, setName] = useState(team.name ?? '');
  const [members, setMembers] = useState<string[]>(team.members ?? []);
  const toggle = (id: string) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const ready = name.trim().length > 0 && members.length > 0;

  return (
    <div className="animate-fade border-b border-line px-6 py-3">
      <input
        autoFocus={!team.id}
        value={name}
        maxLength={40}
        placeholder={st('team_name_placeholder')}
        onChange={(e) => setName(e.target.value)}
        className="h-11 w-full rounded-[12px] border border-line bg-sunk px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/50"
      />
      <div className="mt-2.5 flex flex-wrap gap-2">
        {people.map((p) => {
          const on = members.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => toggle(p.id)}
              aria-pressed={on}
              className={cn(
                'flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px]',
                on ? 'border-accent/25 bg-accent-soft font-semibold text-accent' : 'border-line bg-sunk text-ink-2',
              )}
            >
              {on && <Check className="size-4" strokeWidth={2.2} />}
              {p.name || st('someone')}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {team.id && (
          <button
            onClick={() => {
              removeTeam(team.id!);
              onDone();
            }}
            className={cn(PILL, 'text-ember')}
          >
            <Trash2 className="size-4" strokeWidth={1.9} />
            {st('team_delete')}
          </button>
        )}
        <span className="flex-1" />
        <button onClick={onDone} className="h-9 px-3 text-[15px] text-ink-3">
          {t('cancel')}
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            saveTeam({ id: team.id, name, members });
            haptic('light');
            onDone();
          }}
          className="h-9 rounded-full bg-accent px-4 text-[15px] font-semibold text-on-accent disabled:opacity-30"
        >
          {t('save')}
        </button>
      </div>
    </div>
  );
}
