import { ArrowUpRight, CalendarCheck, Check, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { apiBase, isNative } from '@/lib/native/platform';
import { readVersion, WEB_VERSION } from '@/lib/version';
import { describe, useLastRace } from '@/lib/voice/lastRace';
import { setAiConsent, useAiConsent } from './aiConsent';
import { LANGUAGES, setLang, t, useLang } from './i18n';
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
                className="flex h-[62px] w-full items-center gap-4 px-6 text-left transition-colors active:bg-wash-strong disabled:opacity-50"
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
          className="flex h-[58px] w-full items-center gap-4 px-6 text-left transition-colors active:bg-wash-strong"
        >
          <span className="flex-1 text-[17px] text-ink">{t('ai_toggle')}</span>
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
                'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-transform duration-200',
                on && 'translate-x-5',
              )}
            />
          </span>
        </button>
      </div>
      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">{t('ai_setting_note')}</p>
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

      <p className="px-6 pb-2 text-[11px] font-semibold tracking-[0.16em] text-ink-4 uppercase">{t('language')}</p>

      <div className="border-t border-line">
        {LANGUAGES.map((option) => {
          const on = option.id === lang;
          return (
            <button
              key={option.id}
              onClick={() => {
                if (!on) {
                  haptic('medium');
                  setLang(option.id);
                }
              }}
              aria-pressed={on}
              className="flex h-[58px] w-full items-center gap-4 px-6 text-left transition-colors active:bg-wash-strong"
            >
              <span className={cn('flex-1 text-[17px]', on ? 'font-medium text-ink' : 'text-ink-2')}>{option.native}</span>
              {on && <Check className="size-[19px] shrink-0 text-accent" strokeWidth={2.4} />}
            </button>
          );
        })}
      </div>

      <p className="px-6 pt-3 text-[12.5px] leading-[18px] text-ink-3">{t('language_note')}</p>

      <AiSection />

      {calendarConfigured() && <CalendarSection />}

      <RaceSection />

      <AboutSection />
    </Sheet>
  );
}
