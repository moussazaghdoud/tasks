import {
  Ban,
  Check,
  ClipboardPaste,
  Flag,
  Image,
  Pencil,
  Plus,
  ScanLine,
  Send,
  Trash2,
  TriangleAlert,
  Undo2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { forget, useOutbox } from '@/lib/share/outbox';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { haptic, openAppSettings } from '@/lib/native/bridge';
import { isNative } from '@/lib/native/platform';
import { scanCode } from '@/lib/native/photos';
import { cardLink } from '@/lib/share/card';
import { identity, setMyName, useMyName } from '@/lib/share/identity';
import { noticeStatus, useMailError, type NoticeStatus } from '@/lib/share/mailbox';
import { people as listPeople, removeTeam, renamePerson, saveTeam, usePeopleBook, type Person, type Team } from '@/lib/share/people';
import { cn } from '@/lib/platform';
import { toast } from '@/store/toast';
import { Sheet } from './Sheet';
import { dayTimeIn, t } from './i18n';
import { st } from './shareI18n';
import {
  addFromText,
  addPending,
  allowNotices,
  announceName,
  block,
  pasteCode,
  remove,
  report,
  resend,
  restore,
  usePendingCard,
} from './sharing';

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
  const pending = usePendingCard();
  const mailError = useMailError();

  // Opening People is when receiving starts to matter: ask for notices now.
  useEffect(() => {
    if (open) void allowNotices();
  }, [open]);

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

  const scan = async (from: 'camera' | 'library') => {
    if (!named) return needName();
    const codes = await scanCode(from);
    if (codes === null) return;
    if (!codes.some((code) => addFromText(code))) toast(st('scan_none'));
  };

  const paste = () => (named ? void pasteCode() : needName());

  const saveName = async () => {
    await identity();
    const clean = name.trim();
    const changed = clean !== myName.trim();
    setMyName(clean);
    if (!clean) return;
    // Someone's link was waiting for a name; otherwise the new name goes to everyone.
    if (pending) addPending();
    else if (changed && everyone.length) announceName();
  };

  return (
    <Sheet open={open} onClose={onClose} label={st('people_title')} title={st('people_title')}>
      {pending && (
        <p className="mx-6 mb-3 rounded-[14px] border border-accent/25 bg-accent-soft px-4 py-3 text-[14px] leading-[20px] text-accent">
          {st('pending_name', { name: pending.name || st('someone') })}
        </p>
      )}
      <p className={LABEL}>{st('my_name_label')}</p>
      <div className="px-6">
        <input
          value={name}
          maxLength={40}
          autoFocus={!!pending}
          placeholder={st('my_name_placeholder')}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
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
          <>
            <button onClick={() => void scan('camera')} className={cn(ROW, 'border-t border-line')}>
              <ScanLine className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
              <span className="flex-1">{st('scan_code')}</span>
            </button>
            <button onClick={() => void scan('library')} className={cn(ROW, 'border-t border-line')}>
              <Image className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
              <span className="flex-1">{st('scan_photo')}</span>
            </button>
            <button onClick={paste} className={cn(ROW, 'border-t border-line')}>
              <ClipboardPaste className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
              <span className="flex-1">{st('paste_code')}</span>
            </button>
          </>
        )}
      </div>
      {mailError && (
        <p className="flex gap-2 px-6 pt-3 text-[12.5px] leading-[18px] break-words text-ember select-text">
          <TriangleAlert className="mt-px size-4 shrink-0" strokeWidth={2} />
          {st('mail_error', { why: mailError })}
        </p>
      )}
      {isNative() && open && <NoticeLine />}
      <OutboxSection />

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

/**
 * The three links a notice of arrival depends on, each with a tick or a
 * cross — so "no notification" says which one is missing.
 */
function NoticeLine() {
  const [status, setStatus] = useState<NoticeStatus | null>(null);
  const refresh = () => void noticeStatus().then(setStatus);
  useEffect(() => {
    // The permission prompt may still be on screen: look again once it is answered.
    refresh();
    const id = setTimeout(refresh, 4000);
    return () => clearTimeout(id);
  }, []);
  if (!status) return null;

  const allowed = status.permission === 'authorized' || status.permission === 'provisional';
  const mark = (ok: boolean, label: string) => (
    <span className={cn('flex items-center gap-1', ok ? 'text-accent' : 'text-ember')}>
      {ok ? <Check className="size-3.5" strokeWidth={2.4} /> : <X className="size-3.5" strokeWidth={2.4} />}
      {label}
    </span>
  );
  return (
    <div className="px-6 pt-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-medium">
        <span className="text-ink-3">{st('notices_title')}</span>
        {mark(allowed, st('notice_permission'))}
        {mark(status.registered, st('notice_push'))}
        {status.subscribed && mark(true, st('notice_icloud'))}
      </p>
      {/* Without iCloud's own notice, the background look still announces
          arrivals — later rather than at once. */}
      {allowed && !status.subscribed && (
        <p className="pt-1 text-[12px] leading-[17px] text-ink-4">{st('notice_background')}</p>
      )}
      {(!allowed || !status.registered) && (
        <div className="flex gap-2 pt-2">
          {!allowed && (
            <button onClick={() => void openAppSettings()} className={cn(PILL, 'text-accent')}>
              {st('open_settings')}
            </button>
          )}
          <button
            onClick={async () => {
              await allowNotices();
              setTimeout(refresh, 1500);
            }}
            className={cn(PILL, 'text-accent')}
          >
            {st('retry')}
          </button>
        </div>
      )}
    </div>
  );
}

/** What was sent and not picked up yet: kept, so nothing is lost on the way. */
function OutboxSection() {
  const waiting = useOutbox();
  if (!waiting.length) return null;
  return (
    <>
      <p className={cn(LABEL, 'mt-6')}>{st('outbox_title')}</p>
      <div className="border-t border-line">
        {waiting.map((entry) => (
          <div key={`${entry.ref}-${entry.to.id}`} className="border-b border-line px-6 py-3">
            <p className="truncate text-[16px] text-ink">{entry.thought.title}</p>
            <p className="pt-0.5 text-[12.5px] text-ink-4">
              {st('to_person', { name: entry.to.name || st('someone') })} · {dayTimeIn(new Date(entry.sentAt))}
              {entry.mode === 'transfer' ? ` · ${st('send_transfer')}` : ''}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button onClick={() => void resend(entry)} className={cn(PILL, 'text-accent')}>
                <Send className="size-4" strokeWidth={1.9} />
                {st('resend')}
              </button>
              {entry.mode === 'transfer' && (
                <button onClick={() => restore(entry)} className={cn(PILL, 'text-accent')}>
                  <Undo2 className="size-4" strokeWidth={1.9} />
                  {st('restore')}
                </button>
              )}
              <button onClick={() => forget(entry)} className={cn(PILL, 'text-ink-3')}>
                {st('dismiss')}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="px-6 pt-2 text-[12.5px] leading-[18px] text-ink-3">{st('outbox_note')}</p>
    </>
  );
}

function PersonRow({ person, open, onToggle }: { person: Person; open: boolean; onToggle: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(person.name);
  useEffect(() => {
    if (!open) setRenaming(false);
  }, [open]);

  return (
    <div className="border-b border-line">
      {renaming ? (
        <div className="px-6 py-2">
          <input
            autoFocus
            value={name}
            maxLength={40}
            placeholder={st('my_name_placeholder')}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              renamePerson(person.id, name);
              setRenaming(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="h-11 w-full rounded-[12px] border border-line bg-sunk px-3.5 text-[16px] text-ink outline-none focus:border-accent/50"
          />
        </div>
      ) : (
        <button onClick={onToggle} className={ROW}>
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent">
            {(person.name || '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="flex-1 truncate">{person.name || st('someone')}</span>
        </button>
      )}
      {open && !renaming && (
        <div className="flex animate-fade flex-wrap gap-2 px-6 pb-4">
          <button
            onClick={() => {
              setName(person.name);
              setRenaming(true);
            }}
            className={cn(PILL, 'text-ink-2')}
          >
            <Pencil className="size-4" strokeWidth={1.9} />
            {st('person_rename')}
          </button>
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
