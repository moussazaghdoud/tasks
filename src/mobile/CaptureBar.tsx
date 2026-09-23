import { Keyboard, Mic, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { markFresh } from '@/lib/fresh';
import { analyzeMemo } from '@/lib/voice/analyze';
import { createFromDrafts, findTaskByTitle, type ConfirmedDraft } from '@/lib/voice/createFromDrafts';
import { startLevelMeter, startSpeech, type SpeechErrorCode, type SpeechSession } from '@/lib/voice/speech';
import { extractReminder } from '@/lib/voice/spokenReminder';
import { ensureNotificationPermission } from '@/lib/native/notifications';
import { toast } from '@/store/toast';
import { ui, useUi } from '@/store/ui';
import { AiConsentSheet } from './AiConsentSheet';
import { aiConsent, setAiConsent } from './aiConsent';
import { dayTimeIn, speechLocale, t } from './i18n';
import { currentSpace, spaceOf } from './space';
import { setReminder } from './thoughtActions';
import { Sheet } from './Sheet';
import { Waveform } from './Waveform';

/** Stop on a long pause, so putting the phone down still captures the thought. */
const SILENCE_MS = 3200;

const errorText = (code: SpeechErrorCode): string => {
  switch (code) {
    case 'not-allowed':
      return t('err_not_allowed');
    case 'plugin-missing':
      return t('err_plugin');
    case 'unsupported':
      return t('err_unsupported');
    case 'network':
      return t('err_network');
    case 'no-speech':
      return t('err_no_speech');
    default:
      return t('err_other');
  }
};

type Phase = 'idle' | 'listening' | 'thinking';

/**
 * The one action in the app, kept under the thumb.
 *
 * At rest it is a microphone. While you speak it becomes the recording surface
 * itself — waveform, live words, one obvious way to finish — rather than
 * throwing a modal over your list. When you stop, the thought is captured and
 * the surface goes away. There is no review step: a confirmation screen after
 * every sentence is the friction this product exists to remove, and an Undo in
 * the toast covers the rare miss.
 */
export function CaptureBar() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [level, setLevel] = useState(0);
  const [typing, setTyping] = useState(false);
  /** Set while the one-time AI question is on screen; resolves the capture waiting on it. */
  const [consentAnswer, setConsentAnswer] = useState<((allow: boolean) => void) | null>(null);

  const session = useRef<SpeechSession | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const lastSound = useRef(0);
  const heard = useRef('');
  /** Explain the fallback once per session, not after every sentence. */
  const noticed = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  const teardown = useCallback(() => {
    stopMeter.current?.();
    stopMeter.current = null;
    session.current = null;
    setLevel(0);
  }, []);

  /** Turn what was said into captured thoughts. */
  const capture = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said) {
        setPhase('idle');
        setTranscript('');
        return;
      }
      setPhase('thinking');

      // Nothing leaves the phone for Claude without a yes. Asked once, here,
      // where the question means something; the answer is remembered.
      let cloud = aiConsent() === 'granted';
      if (aiConsent() === 'unset') {
        cloud = await new Promise<boolean>((resolve) => setConsentAnswer(() => resolve));
        setConsentAnswer(null);
      }

      // "Remind me tomorrow at nine" is read here, on the phone, before
      // anything else sees the words: the analyser is then handed the thought
      // without the asking, so "remind me" never ends up in the title.
      const { at: remindAt, text: stripped } = extractReminder(said);
      const subject = stripped || said;

      // Claude is told which language this was spoken in, so the thought it
      // writes back comes out in the same one.
      const { tasks, source, notice } = await analyzeMemo(subject, speechLocale(), { cloud });
      const drafts: ConfirmedDraft[] = tasks.length
        ? tasks.map((d) => {
            // If the memo is plainly about something already on the list, it
            // belongs there as a step — intelligence that costs no interaction.
            // Only within this half, though: quietly filing a private thought
            // onto a work task would be the worst kind of helpful.
            const related = d.relatedTo ? findTaskByTitle(d.relatedTo) : undefined;
            return related && spaceOf(related) === currentSpace() ? { ...d, stepOf: related.id } : d;
          })
        : [];

      // The analyser sometimes finds nothing actionable — a half sentence, a
      // language it was not expecting, pure thinking aloud. Throwing the words
      // away is the one thing this app must never do, so keep them verbatim
      // and let the person decide. A messy line beats a lost thought.
      if (!drafts.length) {
        drafts.push({
          title: subject.length > 160 ? `${subject.slice(0, 159)}…` : subject,
          notes: '',
          dueDate: null,
          dueTime: null,
          priority: 'normal',
          project: null,
          assignee: null,
          subtasks: [],
          recurrence: null,
          estimatedMinutes: null,
          relatedTo: null,
        });
      }

      // Read at the moment of capture, not when this component mounted: the
      // thought belongs to whichever half was open when it was spoken.
      const { tasks: made, steps, undo } = createFromDrafts(drafts, said, currentSpace());
      markFresh(made.map((t) => t.id));
      haptic('success');
      setPhase('idle');
      setTranscript('');

      // The reminder goes on the thought that was just made. Asking for the
      // notification permission here is the one moment it explains itself:
      // the person has just said out loud that they want to be reminded.
      // When the memo joined an existing thought as a step, the reminder
      // belongs to that thought rather than to nothing.
      const remindOn = made[0]?.id ?? drafts.find((d) => d.stepOf)?.stepOf;
      if (remindAt && remindOn) {
        void ensureNotificationPermission().then(() => setReminder(remindOn, remindAt));
      }

      const label = remindAt
        ? t('captured_reminded', { when: dayTimeIn(remindAt) })
        : made.length > 1
          ? t('captured_many', { n: made.length })
          : steps && !made.length
            ? t('captured_step')
            : t('captured');
      // Say which engine read the memo. Without this the on-device fallback is
      // indistinguishable from Claude having a bad day, and a server that
      // quietly stopped answering looks like the app getting worse.
      // Mark on-device results only when that was not the person's own
      // choice: someone who said "keep it on my iPhone" does not need telling.
      const chosenLocal = !cloud;
      toast(source === 'local' && !chosenLocal ? `${label} · ${t('on_device_suffix')}` : label, {
        action: { label: t('undo'), run: undo },
      });
      if (source === 'local' && !chosenLocal && notice && !noticed.current) {
        noticed.current = true;
        setTimeout(() => toast(notice), 2600);
      }
    },
    [],
  );

  const finish = useCallback(() => {
    if (!session.current) return;
    session.current.stop();
    session.current = null;
    stopMeter.current?.();
    stopMeter.current = null;
    setLevel(0);
    void capture(heard.current);
  }, [capture]);

  const cancel = useCallback(() => {
    session.current?.abort();
    teardown();
    setPhase('idle');
    setTranscript('');
    heard.current = '';
  }, [teardown]);

  const start = useCallback(() => {
    if (phase !== 'idle') return;
    haptic('medium');
    heard.current = '';
    setTranscript('');
    setPhase('listening');
    lastSound.current = Date.now();

    session.current = startSpeech(speechLocale(), {
      onText: (final, interim) => {
        const text = [final, interim].filter(Boolean).join(' ').trim();
        heard.current = final || text;
        setTranscript(text);
        lastSound.current = Date.now();
      },
      onError: (code) => {
        teardown();
        // An error part-way through — a call, a lost connection — must not
        // cost the words already heard. Keep them; only report the error when
        // there was nothing to keep.
        const kept = heard.current.trim();
        if (kept) {
          session.current = null;
          void capture(kept);
          return;
        }
        setPhase('idle');
        setTranscript('');
        toast(errorText(code));
      },
      onEnd: () => {
        // The recogniser can end on its own; treat it as finishing.
        if (session.current) {
          session.current = null;
          teardown();
          void capture(heard.current);
        }
      },
    });

    void startLevelMeter(setLevel).then((stop) => {
      // Guard against a session that ended while the meter was starting.
      if (session.current) stopMeter.current = stop;
      else stop();
    });
  }, [phase, capture, teardown]);

  // The home-screen shortcut (/?capture=voice) asks for the microphone before
  // this component exists, so pick the request up once we are mounted.
  const requested = useUi((s) => s.voiceOpen);
  useEffect(() => {
    if (requested && phase === 'idle') {
      ui().setVoice(false);
      start();
    }
  }, [requested, phase, start]);

  // Leaving the app mid-sentence — the home gesture, a notification tapped —
  // suspends the microphone. Finish with what was said rather than come back
  // to a screen still "listening" to nothing.
  useEffect(() => {
    if (phase !== 'listening') return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') finish();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [phase, finish]);

  // A long pause ends the recording on its own.
  useEffect(() => {
    if (phase !== 'listening') return;
    const id = setInterval(() => {
      if (heard.current && Date.now() - lastSound.current > SILENCE_MS) finish();
    }, 400);
    return () => clearInterval(id);
  }, [phase, finish]);

  useEffect(() => () => teardown(), [teardown]);

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [transcript]);

  const busy = phase !== 'idle';

  return (
    <>
      {/* Dim the list while listening: attention belongs to the words. */}
      {busy && <div className="fixed inset-0 z-40 animate-fade bg-[rgb(24_22_19/0.18)]" onClick={cancel} aria-hidden />}

      <div className="fixed inset-x-0 bottom-0 z-50">
        {busy ? (
          <div className="animate-sheet-up rounded-t-[28px] border-t border-line bg-raised px-5 pt-5 pb-[max(18px,env(safe-area-inset-bottom))] shadow-float">
            <div className="flex items-start justify-between">
              <p className="pt-1 text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">
                {phase === 'listening' ? t('listening') : t('thinking')}
              </p>
              <button
                onClick={cancel}
                aria-label={t('cancel')}
                className="-mt-1.5 -mr-1.5 grid size-10 place-items-center rounded-full text-ink-3 active:bg-wash-strong"
              >
                <X className="size-5" />
              </button>
            </div>

            <div ref={scroller} className="mt-3 max-h-[34dvh] min-h-[76px] overflow-y-auto">
              <p
                className={cn(
                  'text-[22px] leading-[31px] tracking-[-0.01em]',
                  transcript ? 'text-ink' : 'text-ink-4',
                  phase === 'thinking' && 'text-ink-3',
                )}
              >
                {transcript || t('say_something')}
              </p>
            </div>

            <div className="mt-4 mb-1">
              {phase === 'listening' ? <Waveform level={level} /> : <ThinkingLine />}
            </div>

            {phase === 'listening' && (
              <button
                onClick={finish}
                className="mt-2 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-on-accent transition-transform active:scale-[0.985]"
              >
                {t('done')}
              </button>
            )}
          </div>
        ) : (
          <div className="relative flex items-end justify-center gap-6 px-6 pb-[max(16px,env(safe-area-inset-bottom))]">
            {/* Thoughts fade out under the orb rather than colliding with it. */}
            <div className="pointer-events-none absolute inset-x-0 -top-14 bottom-0 -z-10 bg-gradient-to-t from-paper via-paper to-transparent" />
            {/* A spacer keeps the orb centred with one control beside it. */}
            <span className="size-12" aria-hidden />
            <button
              onPointerDown={start}
              aria-label={t('capture')}
              className="capture-orb grid size-[70px] touch-none place-items-center rounded-full text-on-accent transition-transform duration-150 select-none active:scale-95"
            >
              <Mic className="size-7" strokeWidth={2} />
            </button>
            <button
              onClick={() => setTyping(true)}
              aria-label={t('type_placeholder')}
              className="grid size-12 place-items-center rounded-full text-ink-3 transition-colors active:bg-wash-strong"
            >
              <Keyboard className="size-[22px]" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      <TypeSheet open={typing} onClose={() => setTyping(false)} onSubmit={(text) => void capture(text)} />
      <AiConsentSheet
        open={!!consentAnswer}
        onChoose={(allow) => {
          // Only a button press is an answer to remember; swiping the sheet
          // away keeps this note on the phone and asks again next time.
          if (allow !== null) setAiConsent(allow ? 'granted' : 'denied');
          consentAnswer?.(allow === true);
        }}
      />
    </>
  );
}

function ThinkingLine() {
  return (
    <div className="flex h-11 items-center justify-center gap-1.5" role="status" aria-label={t('thinking')}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-[voice-breathe_1.1s_ease-in-out_infinite] rounded-full bg-accent"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/** Typing is the quiet alternative, and it opens only when asked for. */
function TypeSheet({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [open]);

  const submit = () => {
    const value = text.trim();
    onClose();
    if (value) onSubmit(value);
  };

  return (
    <Sheet open={open} onClose={onClose} label="Type a thought">
      <div className="px-5 pb-2">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder={t('type_placeholder')}
          className="w-full resize-none bg-transparent text-[20px] leading-[29px] text-ink outline-none placeholder:text-ink-4"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="mt-2 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-on-accent transition-opacity disabled:opacity-30"
        >
          {t('capture')}
        </button>
      </div>
    </Sheet>
  );
}
