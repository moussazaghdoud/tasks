import { Keyboard, Mic, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/platform';
import { haptic } from '@/lib/native/bridge';
import { markFresh } from '@/lib/fresh';
import { analyzeMemo } from '@/lib/voice/analyze';
import { createFromDrafts, findTaskByTitle, type ConfirmedDraft } from '@/lib/voice/createFromDrafts';
import { defaultSpeechLang, startLevelMeter, startSpeech, type SpeechErrorCode, type SpeechSession } from '@/lib/voice/speech';
import { toast } from '@/store/toast';
import { ui, useUi } from '@/store/ui';
import { Sheet } from './Sheet';
import { Waveform } from './Waveform';

/** Stop on a long pause, so putting the phone down still captures the thought. */
const SILENCE_MS = 3200;

const ERROR_TEXT: Partial<Record<SpeechErrorCode, string>> = {
  'not-allowed': 'Allow the microphone in Settings to speak your thoughts.',
  'plugin-missing': 'Voice is missing from this build.',
  unsupported: 'Voice isn’t available on this device.',
  network: 'Transcription needs a connection.',
  'no-speech': 'I didn’t catch that.',
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

  const session = useRef<SpeechSession | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const lastSound = useRef(0);
  const heard = useRef('');
  const lang = useRef(defaultSpeechLang());
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
      const { tasks } = await analyzeMemo(said, lang.current);
      const drafts: ConfirmedDraft[] = tasks.length
        ? tasks.map((d) => {
            // If the memo is plainly about something already on the list, it
            // belongs there as a step — intelligence that costs no interaction.
            const related = d.relatedTo ? findTaskByTitle(d.relatedTo) : undefined;
            return related ? { ...d, stepOf: related.id } : d;
          })
        : [];

      if (!drafts.length) {
        setPhase('idle');
        setTranscript('');
        toast('Nothing to capture');
        return;
      }

      const { tasks: made, steps, undo } = createFromDrafts(drafts, said);
      markFresh(made.map((t) => t.id));
      haptic('success');
      setPhase('idle');
      setTranscript('');

      const label = made.length > 1 ? `${made.length} captured` : steps && !made.length ? 'Added as a step' : 'Captured';
      toast(label, { action: { label: 'Undo', run: undo } });
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

    session.current = startSpeech(lang.current, {
      onText: (final, interim) => {
        const text = [final, interim].filter(Boolean).join(' ').trim();
        heard.current = final || text;
        setTranscript(text);
        lastSound.current = Date.now();
      },
      onError: (code) => {
        teardown();
        setPhase('idle');
        setTranscript('');
        toast(ERROR_TEXT[code] ?? 'Something interrupted the recording.');
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
                {phase === 'listening' ? 'Listening' : 'One moment'}
              </p>
              <button
                onClick={cancel}
                aria-label="Cancel"
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
                {transcript || 'Say what’s on your mind…'}
              </p>
            </div>

            <div className="mt-4 mb-1">
              {phase === 'listening' ? <Waveform level={level} /> : <ThinkingLine />}
            </div>

            {phase === 'listening' && (
              <button
                onClick={finish}
                className="mt-2 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-accent-ink transition-transform active:scale-[0.985]"
              >
                Done
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
              aria-label="Capture a thought"
              className="capture-orb grid size-[70px] touch-none place-items-center rounded-full text-accent-ink transition-transform duration-150 select-none active:scale-95"
            >
              <Mic className="size-7" strokeWidth={2} />
            </button>
            <button
              onClick={() => setTyping(true)}
              aria-label="Type a thought"
              className="grid size-12 place-items-center rounded-full text-ink-3 transition-colors active:bg-wash-strong"
            >
              <Keyboard className="size-[22px]" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>

      <TypeSheet open={typing} onClose={() => setTyping(false)} onSubmit={(text) => void capture(text)} />
    </>
  );
}

function ThinkingLine() {
  return (
    <div className="flex h-11 items-center justify-center gap-1.5" aria-label="Working">
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
          placeholder="What’s on your mind?"
          className="w-full resize-none bg-transparent text-[20px] leading-[29px] text-ink outline-none placeholder:text-ink-4"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="mt-2 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-accent-ink transition-opacity disabled:opacity-30"
        >
          Capture
        </button>
      </div>
    </Sheet>
  );
}
