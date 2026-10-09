import { ArrowUpRight, Ban, CalendarCheck, Cloud, Download, ImagePlus, Moon, Sun, Upload } from 'lucide-react';
import { ARTS, myPhotoUrl, PHOTOS, pickMyPhoto, setBackdrop, useBackdrop, type Backdrop } from './backdrop';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/store/workspace';
import { backUp, restore } from './backup';
import { useCloudState } from './icloud';
import { useAiProvider } from './aiProvider';
import { LOOKS, setLook, useLook, type Look } from './look';
import type { Key } from './i18n';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { apiBase, isNative } from '@/lib/native/platform';
import { readVersion, WEB_VERSION } from '@/lib/version';
import { describe, useLastRace } from '@/lib/voice/lastRace';
import { setAiConsent, useAiConsent } from './aiConsent';
import { AI_SERVICE_ENABLED } from '@/lib/voice/analyze';
import { LANGUAGES, localeOf, setLang, t, useLang } from './i18n';
import { toast } from '@/store/toast';
import {
  calendarConfigured,
  connect,
  disconnect,
  providers,
  refreshAccounts,
  useCalendars,
  type ProviderId,
} from './calendar';
import { Sheet } from './Sheet';
import { setTheme, useTheme, type Theme } from './theme';

const THEMES: Array<{ id: Theme; icon: typeof Sun; label: 'theme_dark' | 'theme_light' }> = [
  { id: 'dark', icon: Moon, label: 'theme_dark' },
  { id: 'light', icon: Sun, label: 'theme_light' },
];

/**
 * The calendar connection.
 *
 * Hidden entirely when the build has no app registration to talk to — an
 * option that cannot work is worse than no option.
 */
function CalendarSection() {
  const calendars = useCalendars();
  const offered = providers();
  // Which one is signing in, and which one is asking for an address first.
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [asking, setAsking] = useState<ProviderId | null>(null);
  const [email, setEmail] = useState('');
  const plausible = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  useEffect(() => {
    void refreshAccounts();
  }, []);

  const signIn = async (id: ProviderId, address?: string) => {
    setBusy(id);
    try {
      await connect(id, address);
      haptic('success');
      setAsking(null);
      setEmail('');
    } catch (error) {
      // A cancelled sign-in is a decision, not a failure.
      if ((error as { code?: string })?.code !== 'cancelled') toast(t('connect_failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="mt-7 px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('calendar')}</p>

      <div className="border-t border-line">
        {offered.map((provider) => {
          const state = calendars.find((c) => c.id === provider.id);
          const connected = !!state?.connected;
          const working = busy === provider.id;

          return (
            <div key={provider.id}>
              <button
                disabled={!!busy}
                onClick={async () => {
                  if (connected) {
                    await disconnect(provider.id);
                    haptic('light');
                    return;
                  }
                  // Microsoft needs the address before it can choose a
                  // registration; Google asks for the account itself.
                  if (provider.asksEmail) setAsking(provider.id);
                  else void signIn(provider.id);
                }}
                className="flex h-[62px] w-full items-center gap-4 px-6 text-start transition-colors active:bg-wash-strong disabled:opacity-50"
              >
                <CalendarCheck
                  className={cn('size-[21px] shrink-0', connected ? 'text-accent' : 'text-ink-3')}
                  strokeWidth={1.8}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-ink">{provider.label}</span>
                  <span
                    className={cn('mt-0.5 block truncate text-[12.5px]', connected ? 'text-ink-3' : 'text-accent')}
                  >
                    {working ? t('connecting') : connected ? state?.account || t('connected_as') : t('connect_calendar')}
                  </span>
                </span>
                {connected && <span className="shrink-0 text-[14px] font-medium text-ember">{t('disconnect_calendar')}</span>}
              </button>

              {asking === provider.id && !connected && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (plausible) void signIn(provider.id, email);
                  }}
                  className="flex animate-fade flex-col gap-2 px-6 pb-3"
                >
                  <input
                    id="calendar-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('calendar_email_placeholder')}
                    aria-label={t('calendar_email_placeholder')}
                    className="h-12 w-full rounded-[14px] border border-line bg-sunk px-4 text-[16px] text-ink outline-none placeholder:text-ink-4 focus:border-accent/50"
                  />
                  <button
                    type="submit"
                    disabled={!plausible || !!busy}
                    className="h-12 w-full rounded-[14px] bg-accent text-[16px] font-semibold text-on-accent transition-opacity disabled:opacity-35"
                  >
                    {working ? t('connecting') : t('calendar_continue')}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">{t('calendar_note')}</p>
    </>
  );
}

/**
 * Whether notes are read by Claude or kept on the phone — the same choice
 * the first capture asks for, here so it can be changed at any time.
 */
function AiSection() {
  const on = useAiConsent() === 'granted';
  const provider = useAiProvider();
  // Named here too: the switch says to whom notes go, not "an LLM".
  const named = {
    name: provider === 'gemini' ? 'Gemini' : 'Claude',
    who: t(provider === 'gemini' ? 'ai_who_gemini' : 'ai_who_claude'),
  };
  return (
    <>
      <p className="mt-7 px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('ai_section')}</p>
      <div className="border-t border-line">
        <button
          role="switch"
          aria-checked={on}
          onClick={() => {
            haptic('light');
            setAiConsent(on ? 'denied' : 'granted');
          }}
          className="flex h-[58px] w-full items-center gap-4 px-6 text-start transition-colors active:bg-wash-strong"
        >
          <span className="flex-1 text-[17px] text-ink">{t('ai_toggle', named)}</span>
          {/* Drawn like the system switch, so it reads as one without a label. */}
          <span
            aria-hidden
            className={cn(
              'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200',
              on ? 'bg-accent' : 'bg-line-strong',
            )}
          >
            <span
              className={cn(
                'absolute top-[2px] start-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-transform duration-200',
                on && 'translate-x-5 rtl:-translate-x-5',
              )}
            />
          </span>
        </button>
      </div>
      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">
        {t('ai_setting_note', named)}
      </p>
    </>
  );
}

/**
 * The privacy policy and support pages, and which build this is.
 *
 * The policy has to be reachable from inside the app, not only from the App
 * Store listing. Links open in Safari: a page loaded into this web view would
 * replace the app, with no way back.
 */
/**
 * A miniature of each look — its paper, two of its cards and its orb — in
 * the theme already chosen, so the choice is made by eye, not by name.
 * Painted from fixed colours rather than the live tokens, which only ever
 * hold the look being worn.
 */
const LOOK_PREVIEW: Record<Look, { light: string[]; dark: string[]; font: string; radius: number; label: Key }> = {
  classic: { light: ['#faf9f6', '#e9e6de', '#e9e6de', '#1e676c'], dark: ['#232326', '#1e1e21', '#1e1e21', '#56b0f5'], font: 'var(--font-sans)', radius: 6, label: 'look_classic' },
  pinboard: { light: ['#c9a072', '#ffe58f', '#cdebd8', '#a8322a'], dark: ['#2e241b', '#5c4e22', '#2c4a3a', '#e8735e'], font: "'Caveat', var(--font-sans)", radius: 1, label: 'look_pinboard' },
  notebook: { light: ['#fbf7ee', '#fbf7ee', '#fbf7ee', '#22356b'], dark: ['#1d2131', '#1d2131', '#1d2131', '#9db4ff'], font: "'Kalam', var(--font-sans)", radius: 0, label: 'look_notebook' },
  bubbles: { light: ['#fbf8f3', '#ffd3c4', '#d7e6ff', '#e2563a'], dark: ['#17141c', '#4a2e28', '#24365a', '#ff7a59'], font: "'Nunito Variable', var(--font-sans)", radius: 12, label: 'look_bubbles' },
  sky: { light: ['#eceffa', '#ffffff', '#ffffff', '#4b5bd7'], dark: ['#0c1330', '#1c2550', '#1c2550', '#f3e7bf'], font: "'Sora Variable', var(--font-sans)", radius: 8, label: 'look_sky' },
  pebbles: { light: ['#ece5d8', '#4a4641', '#d9d2c5', '#2f2c29'], dark: ['#1e1c1a', '#3a3733', '#5a554e', '#e8e1d5'], font: "'Figtree Variable', var(--font-sans)", radius: 11, label: 'look_pebbles' },
  onething: { light: ['#e4dfd5', '#fffdf8', '#fffdf8', '#24211d'], dark: ['#1a1917', '#262420', '#262420', '#f2eee6'], font: "'Fraunces Variable', serif", radius: 7, label: 'look_onething' },
  nowlater: { light: ['#faf8f4', '#fff4e3', '#e9eef4', '#1f2430'], dark: ['#16181d', '#2e2619', '#1f2733', '#f1c27d'], font: "'IBM Plex Sans', var(--font-sans)", radius: 5, label: 'look_nowlater' },
  moodboard: { light: ['#eeeae3', '#ffffff', '#2a2622', '#2a2622'], dark: ['#1b1917', '#2b2825', '#f3d9a4', '#f3d9a4'], font: "'Fraunces Variable', serif", radius: 1, label: 'look_moodboard' },
  orbit: { light: ['#f3efe8', '#ffffff', '#ffffff', '#2c2720'], dark: ['#1c1a17', '#2a2723', '#2a2723', '#f3efe8'], font: "'Urbanist Variable', var(--font-sans)", radius: 11, label: 'look_orbit' },
};

function LookPicker({ dark }: { dark: boolean }) {
  const chosen = useLook();
  return (
    <div className="mb-5 flex gap-3 overflow-x-auto px-6 pb-1" role="radiogroup" aria-label={t('look_section')}>
      {LOOKS.map((id) => {
        const p = LOOK_PREVIEW[id];
        const [paper, card1, card2, accent] = dark ? p.dark : p.light;
        const on = id === chosen;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (on) return;
              haptic('light');
              setLook(id);
            }}
            className="flex w-[84px] shrink-0 flex-col items-center gap-1.5"
          >
            <span
              className={cn('relative block h-[104px] w-[84px] overflow-hidden rounded-[16px] border-2', on ? 'border-accent' : 'border-line')}
              style={{ background: paper }}
            >
              <span className="absolute left-2 right-2 top-3 h-[22px]" style={{ background: card1, borderRadius: p.radius, border: id === 'notebook' || id === 'sky' ? `1px solid ${accent}33` : undefined }} />
              <span className="absolute left-2 right-5 top-[42px] h-[22px]" style={{ background: card2, borderRadius: p.radius, border: id === 'notebook' || id === 'sky' ? `1px solid ${accent}33` : undefined }} />
              <span className="absolute bottom-2.5 left-1/2 size-[18px] -translate-x-1/2 rounded-full" style={{ background: accent }} />
            </span>
            <span className={cn('text-[12px]', on ? 'font-semibold text-accent' : 'text-ink-3')} style={{ fontFamily: p.font }}>
              {t(p.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A picture behind the list, chosen the way a style is: none, the app's own
 * art, the photographs it ships with, or one of the person's own.
 */
function BackdropPicker() {
  const chosen = useBackdrop();
  const [mine, setMine] = useState<string | null>(null);
  const version = chosen.kind === 'mine' ? chosen.version : 0;
  useEffect(() => {
    let live = true;
    void myPhotoUrl().then((url) => live && setMine(url ? `${url}?v=${version}` : null));
    return () => {
      live = false;
    };
  }, [version]);

  const tile = (on: boolean) =>
    cn('relative block h-[104px] w-[64px] shrink-0 overflow-hidden rounded-[16px] border-2', on ? 'border-accent' : 'border-line');
  const choose = (next: Backdrop) => {
    haptic('light');
    setBackdrop(next);
  };

  return (
    <div className="mb-5 flex gap-3 overflow-x-auto px-6 pb-1" role="radiogroup" aria-label={t('backdrop_section')}>
      <button role="radio" aria-checked={chosen.kind === 'none'} aria-label={t('backdrop_none')} onClick={() => choose({ kind: 'none' })} className={cn(tile(chosen.kind === 'none'), 'grid place-items-center bg-paper')}>
        <Ban className="size-5 text-ink-4" strokeWidth={1.8} />
      </button>
      {/* Photographs first, then the app's own art. */}
      {PHOTOS.map((photo, i) => {
        const on = chosen.kind === 'photo' && chosen.id === photo.id;
        return (
          <button key={photo.id} role="radio" aria-checked={on} aria-label={`${t('backdrop_section')} ${i + 1}`} onClick={() => choose({ kind: 'photo', id: photo.id })} className={tile(on)}>
            <img src={photo.src} alt="" className="absolute inset-0 size-full object-cover" />
          </button>
        );
      })}
      {ARTS.map((id, i) => {
        const on = chosen.kind === 'art' && chosen.id === id;
        return (
          <button key={id} role="radio" aria-checked={on} aria-label={`${t('backdrop_section')} ${PHOTOS.length + i + 1}`} onClick={() => choose({ kind: 'art', id })} className={tile(on)}>
            <span className={`backdrop-art-${id} absolute inset-0`} />
          </button>
        );
      })}
      {isNative() && (
        // Their own: tapping always opens the picker, so it can be changed;
        // once there is one, it shows in the tile.
        <button
          role="radio"
          aria-checked={chosen.kind === 'mine'}
          aria-label={t('backdrop_mine')}
          onClick={() => void pickMyPhoto().then((ok) => ok && haptic('success'))}
          className={cn(tile(chosen.kind === 'mine'), 'grid place-items-center bg-sunk')}
        >
          {mine ? (
            <img src={mine} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 px-1 text-center text-[10.5px] leading-[13px] text-ink-3">
              <ImagePlus className="size-5 text-accent" strokeWidth={1.8} />
              {t('backdrop_mine')}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Thoughts live only on this iPhone and leave with the app when it is
 * deleted. A backup is the file that brings them back.
 */
function BackupSection() {
  const count = useWorkspace((s) => Object.keys(s.tasks).length);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const save = async () => {
    setBusy(true);
    try {
      await backUp();
    } catch {
      toast(t('backup_failed'));
    } finally {
      setBusy(false);
    }
  };

  const bringBack = async (file: File) => {
    setBusy(true);
    try {
      const added = await restore(file);
      if (added === null) toast(t('restore_not_backup'));
      else if (added === 0) toast(t('restore_nothing'));
      else {
        haptic('success');
        toast(t('restore_done', { n: added }));
      }
    } catch {
      toast(t('backup_failed'));
    } finally {
      setBusy(false);
      if (picker.current) picker.current.value = '';
    }
  };

  const row = 'flex h-[58px] w-full items-center gap-4 px-6 text-start text-[17px] text-ink transition-colors active:bg-wash-strong disabled:opacity-40';
  return (
    <>
      <p className="mt-7 px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('backup_section')}</p>
      <div className="border-t border-line">
        <button onClick={() => void save()} disabled={busy || !count} className={row}>
          <Download className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
          <span className="flex-1">{t('backup_save')}</span>
          <span className="text-[14px] text-ink-4 tabular-nums">{t('thoughts_many', { n: count })}</span>
        </button>
        <button onClick={() => picker.current?.click()} disabled={busy} className={cn(row, 'border-t border-line')}>
          <Upload className="size-[20px] shrink-0 text-accent" strokeWidth={1.9} />
          <span className="flex-1">{t('backup_restore')}</span>
        </button>
        <input
          ref={picker}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => e.target.files?.[0] && void bringBack(e.target.files[0])}
        />
      </div>
      <CloudLine />
      <p className="px-6 pt-2 text-[12.5px] leading-[18px] text-ink-3">{t('backup_note')}</p>
    </>
  );
}

/** Where the copy in iCloud stands, in one line. */
function CloudLine() {
  const cloud = useCloudState();
  if (!isNative() || cloud.kind === 'unknown') return null;
  const text =
    cloud.kind === 'saved'
      ? t('icloud_saved', { time: new Date(cloud.at).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' }) })
      : cloud.kind === 'saving'
        ? t('icloud_saving')
        : cloud.kind === 'off'
          ? t('icloud_off')
          : t('icloud_error');
  return (
    <p className="flex items-center gap-1.5 px-6 pt-3 text-[13px] text-ink-2">
      <Cloud className={cn('size-4 shrink-0', cloud.kind === 'saved' ? 'text-accent' : 'text-ink-4')} strokeWidth={2} />
      {text}
    </p>
  );
}

function AboutSection() {
  const [version, setVersion] = useState(WEB_VERSION);
  useEffect(() => {
    void readVersion().then(setVersion);
  }, []);

  // Same origin on the web; the deployed server inside the app.
  const site = isNative() ? apiBase() : '';
  const canLink = !isNative() || !!site;

  return (
    <>
      <p className="mt-7 px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('about')}</p>
      {canLink && (
        <div className="border-t border-line">
          {[
            { href: `${site}/privacy`, label: t('privacy_policy') },
            { href: `${site}/support`, label: t('support') },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[58px] w-full items-center gap-4 px-6 text-[17px] text-ink transition-colors active:bg-wash-strong"
            >
              <span className="flex-1">{link.label}</span>
              <ArrowUpRight className="size-[18px] shrink-0 text-ink-4" strokeWidth={1.8} />
            </a>
          ))}
        </div>
      )}
      <p className="px-6 pt-3 text-[12.5px] text-ink-4 tabular-nums">Hence {version}</p>
    </>
  );
}

/**
 * What each language made of the last thing you said.
 *
 * Only shown after a capture with several languages listening, because that
 * is the only case anyone needs it: it is the difference between "it picked
 * English over French" and "French never ran at all", which from a phone is
 * otherwise invisible. Selectable, so it can be sent to me in a message.
 */
function RaceSection() {
  const race = useLastRace();
  if (!race || race.candidates.length < 2) return null;
  return (
    <>
      <p className="mt-7 px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">
        {t('voice_diagnostics')}
      </p>
      <div className="mx-6 rounded-[14px] border border-line bg-sunk px-4 py-3">
        {race.candidates.map((c) => (
          <p key={c.locale} className="text-[12px] leading-[18px] break-words text-ink-3 select-text">
            {describe(c, race.won)}
          </p>
        ))}
      </div>
      <p className="px-6 pt-2 text-[12.5px] leading-[18px] text-ink-4">{t('voice_diagnostics_note')}</p>
    </>
  );
}

/**
 * Settings.
 *
 * Grouped into named sections rather than one flat list, so the next setting
 * arrives without the sheet being redesigned around it.
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lang = useLang();
  const theme = useTheme();

  return (
    <Sheet open={open} onClose={onClose} label={t('settings')} title={t('settings')}>
      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('appearance')}</p>

      {/* Two halves of one control, so the choice reads at a glance rather
          than as a list you have to compare. */}
      <div className="mx-6 mb-5 flex h-11 rounded-full border border-line bg-sunk p-[3px]">
        {THEMES.map(({ id, icon: Icon, label }) => {
          const on = id === theme;
          return (
            <button
              key={id}
              onClick={() => {
                if (on) return;
                haptic('light');
                setTheme(id);
              }}
              aria-pressed={on}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-full text-[14px] transition-colors',
                on ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent/25' : 'font-medium text-ink-3',
              )}
            >
              <Icon className="size-[17px]" strokeWidth={1.9} />
              {t(label)}
            </button>
          );
        })}
      </div>

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('look_section')}</p>
      <LookPicker dark={theme === 'dark'} />

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('backdrop_section')}</p>
      <BackdropPicker />

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('language')}</p>

      {/* Each language a pill, written in itself, wrapping onto as many rows
          as it needs: seven of them take two or three lines instead of
          seven rows. The chosen one is lit like Dark/Light above. */}
      <div className="flex flex-wrap gap-2 px-6" role="radiogroup" aria-label={t('language')}>
        {LANGUAGES.map((option) => {
          const on = option.id === lang;
          return (
            <button
              key={option.id}
              lang={option.locale}
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (!on) {
                  haptic('medium');
                  setLang(option.id);
                }
              }}
              className={cn(
                'h-10 rounded-full border px-4 text-[15px] transition-colors',
                on
                  ? 'border-accent/25 bg-accent-soft font-semibold text-accent ring-1 ring-accent/25'
                  : 'border-line bg-sunk font-medium text-ink-2 active:bg-wash-strong',
              )}
            >
              {option.native}
            </button>
          );
        })}
      </div>

      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">{t('language_note')}</p>

      {/* No AI service in this version: nothing to switch on or off. */}
      {AI_SERVICE_ENABLED && <AiSection />}

      {calendarConfigured() && <CalendarSection />}

      <RaceSection />

      <BackupSection />

      <AboutSection />
    </Sheet>
  );
}
