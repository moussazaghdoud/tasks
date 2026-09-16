import { FloatingFocusManager, FloatingOverlay, FloatingPortal, useFloating } from '@floating-ui/react';
import { Keyboard, Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { markFresh } from '@/lib/fresh';
import { cn, isModEvent, isTypingTarget } from '@/lib/platform';
import { analyzeMemo } from '@/lib/voice/analyze';
import { createFromDrafts } from '@/lib/voice/createFromDrafts';
import { defaultSpeechLang, speechSupported, startLevelMeter, startSpeech, type SpeechErrorCode, type SpeechSession } from '@/lib/voice/speech';
import type { VoiceTaskDraft } from '@/lib/voice/types';
import { toast, useToasts } from '@/store/toast';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { destinationLabel } from '@/components/tasks/TaskComposer';
import { AutoTextarea } from '@/components/detail/AutoTextarea';
import { Kbd } from '@/components/ui/Kbd';
import { VoiceReview } from './VoiceReview';

type Phase = 'listening' | 'typing' | 'analyzing' | 'review' | 'error';

const SILENCE_MS = 2600;

const ERRORS: Record<SpeechErrorCode, { title: string; body: string }> = {
  'not-allowed': { title: 'Microphone access is blocked.', body: 'Allow the microphone for this site in your browser’s address bar, then try again.' },
  'no-speech': { title: 'I didn’t catch anything.', body: 'Check your microphone, then try again and start speaking right away.' },
  'audio-capture': { title: 'No microphone found.', body: 'Connect a microphone, or type your memo instead.' },
  network: { title: 'Voice recognition needs a connection.', body: 'Your browser transcribes speech online. Type your memo instead, or try again.' },
  unsupported: { title: 'Voice isn’t available in this browser.', body: 'Use Chrome, Edge or Safari for voice. You can type or paste your memo meanwhile.' },
  other: { title: 'Something interrupted the recording.', body: 'Try again, or type your memo instead.' },
};

const LANGS: Array<[string, string]> = [
  ['en-US', 'EN'],
  ['fr-FR', 'FR'],
];

/** Lets the mic button finish a hold-to-talk recording on release. */
let finishFromOutside: (() => void) | null = null;
export const finishVoiceRecording = () => finishFromOutside?.();

function VoiceBody({ onClose }: { onClose: () => void }) {
  const savedLang = useWorkspace((s) => s.user.preferences.voiceLang);
  const lang = savedLang ?? defaultSpeechLang();
  const [phase, setPhase] = useState<Phase>(speechSupported() ? 'listening' : 'typing');
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<SpeechErrorCode | null>(speechSupported() ? null : 'unsupported');
  const [drafts, setDrafts] = useState<VoiceTaskDraft[]>([]);
  const [transcript, setTranscript] = useState('');
  const [result, setResult] = useState<{ source: 'claude' | 'local'; notice?: string }>({ source: 'local' });
  const [session, setSession] = useState(0);

  const orbRef = useRef<HTMLButtonElement>(null);
  const speech = useRef<SpeechSession | null>(null);
  const textRef = useRef({ final: '', interim: '' });
  const lastHeard = useRef(Date.now());
  const finishing = useRef(false);
  const reviewShownAt = useRef(0);

  const analyze = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) {
        setError('no-speech');
        setPhase('error');
        return;
      }
      setTranscript(clean);
      setPhase('analyzing');
      const r = await analyzeMemo(clean, lang);
      setDrafts(r.tasks);
      setResult({ source: r.source, notice: r.notice });
      reviewShownAt.current = Date.now();
      setPhase('review');
    },
    [lang],
  );

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    speech.current?.stop();
    // Give the recognizer a beat to deliver its last words, then analyze.
    setTimeout(() => {
      speech.current?.abort();
      const { final, interim } = textRef.current;
      void analyze(`${final} ${interim}`);
    }, 450);
  }, [analyze]);

  // Listening session: speech + level meter + silence detection.
  useEffect(() => {
    if (phase !== 'listening') return;
    finishing.current = false;
    textRef.current = { final: '', interim: '' };
    setFinalText('');
    setInterim('');
    lastHeard.current = Date.now();

    speech.current = startSpeech(lang, {
      onText: (f, i) => {
        textRef.current = { final: f, interim: i };
        setFinalText(f);
        setInterim(i);
        lastHeard.current = Date.now();
      },
      onError: (code) => {
        if (finishing.current) return;
        if (code === 'no-speech' && (textRef.current.final || textRef.current.interim)) return;
        finishing.current = true;
        setError(code);
        setPhase('error');
      },
      onEnd: () => {
        // The browser may end the session on its own (e.g. after a pause on mobile).
        if (!finishing.current && (textRef.current.final || textRef.current.interim)) finish();
      },
    });

    let stopMeter: () => void = () => {};
    void startLevelMeter((level) => {
      const el = orbRef.current;
      if (el) el.style.setProperty('--level', level.toFixed(3));
    }).then((stop) => (stopMeter = stop));

    const silence = setInterval(() => {
      const { final, interim } = textRef.current;
      if ((final || interim) && Date.now() - lastHeard.current > SILENCE_MS) finish();
    }, 250);

    finishFromOutside = finish;
    return () => {
      clearInterval(silence);
      stopMeter();
      speech.current?.abort();
      if (finishFromOutside === finish) finishFromOutside = null;
    };
  }, [phase, lang, finish, session]);

  const restart = () => {
    setError(null);
    setDrafts([]);
    setTyped('');
    setPhase(speechSupported() ? 'listening' : 'typing');
    setSession((s) => s + 1);
  };

  const add = () => {
    const valid = drafts.filter((d) => d.title.trim()).map((d) => ({ ...d, title: d.title.trim() }));
    if (!valid.length) return;
    const { tasks, undo } = createFromDrafts(valid, transcript);
    markFresh(tasks.map((t) => t.id));
    onClose();
    const first = tasks[0];
    toast(tasks.length === 1 ? `Added to ${destinationLabel(first)}` : `${tasks.length} tasks added`, {
      detail: tasks.length === 1 ? first.title : tasks.map((t) => t.title).join(' · '),
      action: { label: 'Undo', run: undo },
      secondary: tasks.length === 1 ? { label: 'Open', run: () => ui().openTask(first.id) } : undefined,
    });
  };

  // Keyboard: Space/Enter finish listening, Enter adds in review, Esc backs out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (phase === 'listening' && (e.key === ' ' || e.key === 'Enter') && !typing) {
        e.preventDefault();
        finish();
      } else if (phase === 'review' && e.key === 'Enter' && !e.shiftKey) {
        // A confirmation needs a deliberate keypress, not one that was already in flight.
        if (e.repeat || Date.now() - reviewShownAt.current < 300) return;
        const t = e.target;
        if (t instanceof HTMLInputElement) return; // "Add a step" handles its own Enter
        if (t instanceof HTMLTextAreaElement && t.getAttribute('aria-label') === 'Notes' && !isModEvent(e)) return; // new line in notes
        e.preventDefault();
        add();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const switchLang = (next: string) => {
    ws().setPreferences({ voiceLang: next });
    if (phase === 'listening') setSession((s) => s + 1);
  };

  const langPills = (
    <div className="flex rounded-full bg-wash-strong p-0.5" role="group" aria-label="Language">
      {LANGS.map(([code, label]) => (
        <button
          key={code}
          onClick={() => switchLang(code)}
          aria-pressed={lang.slice(0, 2) === code.slice(0, 2)}
          className={cn(
            'h-6 rounded-full px-2.5 text-[11px] font-semibold tracking-wide transition-colors',
            lang.slice(0, 2) === code.slice(0, 2) ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (phase === 'review') {
    return (
      <VoiceReview
        drafts={drafts}
        onChange={setDrafts}
        transcript={transcript}
        source={result.source}
        notice={result.notice}
        onAdd={add}
        onRetry={restart}
        onDiscard={onClose}
      />
    );
  }

  if (phase === 'analyzing') {
    return (
      <div className="px-6 py-8" aria-live="polite">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
            <span className="relative size-3 rounded-full bg-accent" />
          </span>
          <span className="label-caps !text-accent-ink">Understanding</span>
        </div>
        <p className="mt-4 font-serif text-[22px] leading-8 text-ink-3 italic">“{transcript}”</p>
        <div className="mt-6 space-y-2" aria-hidden>
          <div className="h-3 w-2/3 animate-pulse rounded-full bg-wash-strong" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-wash-strong [animation-delay:150ms]" />
        </div>
      </div>
    );
  }

  if (phase === 'typing') {
    return (
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-[24px] leading-8 text-ink">Write it the way you’d say it.</h2>
          {speechSupported() && (
            <button onClick={restart} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-meta font-medium text-ink-2 hover:bg-wash-strong">
              <Mic className="size-3.5" /> Speak instead
            </button>
          )}
        </div>
        {error === 'unsupported' && <p className="mt-1 text-meta text-ink-3">{ERRORS.unsupported.body}</p>}
        <AutoTextarea
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              // Keep this Enter from also confirming the review that may appear instantly.
              e.stopPropagation();
              void analyze(typed);
            }
          }}
          aria-label="Memo"
          placeholder="“Remind me to call Thierry tomorrow about the partner terms, it’s urgent. And ask Claire to send the deck by Friday.”"
          className="mt-4 min-h-[96px] w-full rounded-[10px] bg-paper px-3.5 py-3 text-[15px] leading-6 text-ink shadow-[inset_0_0_0_1px_var(--color-line)] outline-none placeholder:text-ink-4 focus:shadow-[inset_0_0_0_1px_rgb(30_103_108/0.45)]"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-meta text-ink-4">
            <Kbd combo="enter" subtle /> analyze · <Kbd combo="shift+enter" subtle /> new line
          </span>
          <button
            disabled={!typed.trim()}
            onClick={() => void analyze(typed)}
            className="h-9 rounded-[9px] bg-accent px-4 text-ui font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Create task
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'error' && error) {
    const e = ERRORS[error];
    return (
      <div className="p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-wash-strong text-ink-3">
            <MicOff className="size-5" />
          </span>
          <div>
            <p className="font-serif text-[22px] leading-7 text-ink">{e.title}</p>
            <p className="mt-1 text-ui text-ink-3">{e.body}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setPhase('typing')} className="inline-flex h-9 items-center gap-2 rounded-[9px] px-3 text-ui font-medium text-ink-2 hover:bg-wash-strong">
            <Keyboard className="size-4" /> Type instead
          </button>
          {error !== 'unsupported' && (
            <button onClick={restart} className="h-9 rounded-[9px] bg-accent px-4 text-ui font-medium text-white hover:bg-accent-hover">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  // Listening
  const heard = finalText || interim;
  return (
    <div className="px-6 pt-5 pb-5">
      <div className="flex items-center justify-between">
        <span className="label-caps !text-accent-ink">Listening</span>
        {langPills}
      </div>

      <div className="flex flex-col items-center py-6">
        <button
          ref={orbRef}
          onClick={finish}
          aria-label="Stop and create task"
          className="voice-orb relative grid size-20 place-items-center rounded-full bg-accent text-white"
        >
          <span className="voice-ring absolute inset-0 rounded-full bg-accent/20" aria-hidden />
          <span className="voice-ring voice-ring-2 absolute inset-0 rounded-full bg-accent/10" aria-hidden />
          <Mic className="relative size-8" strokeWidth={2} />
        </button>
      </div>

      <div className="min-h-[88px]" aria-live="polite">
        {heard ? (
          <p className="text-center font-serif text-[24px] leading-[32px] text-ink">
            {finalText}
            {interim && <span className="text-ink-3"> {interim}</span>}
          </p>
        ) : (
          <p className="text-center text-[15px] leading-6 text-ink-3">
            Say what needs to be done.
            <br />
            <span className="text-ink-4">“Call Thierry tomorrow about the partner terms — it’s urgent.”</span>
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button onClick={() => setPhase('typing')} className="inline-flex h-9 items-center gap-2 rounded-[9px] px-2.5 text-ui font-medium text-ink-3 hover:bg-wash-strong hover:text-ink-2">
          <Keyboard className="size-4" /> Type instead
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="h-9 rounded-[9px] px-3 text-ui font-medium text-ink-2 hover:bg-wash-strong">
            Cancel
          </button>
          <button
            onClick={finish}
            disabled={!heard}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-accent pr-2.5 pl-3.5 text-ui font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Done <Kbd combo="space" className="max-md:hidden [&_kbd]:bg-white/15 [&_kbd]:text-white [&_kbd]:shadow-none" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** The voice capture surface: a card above the mic button, a bottom sheet on phones. */
export function VoiceCapture() {
  const open = useUi((s) => s.voiceOpen);
  const setVoice = useUi((s) => s.setVoice);
  const { refs, context } = useFloating({ open });
  // The mic opens this on press; the same tap's click must not count as "tap outside".
  const pressedBackdrop = useRef(false);
  // Earlier notices would sit on top of the card; reminders stay.
  useEffect(() => {
    if (open) useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.tone === 'reminder') }));
  }, [open]);
  if (!open) return null;
  const close = () => setVoice(false);
  return (
    <FloatingPortal>
      <FloatingOverlay
        lockScroll
        className="z-[72] flex animate-fade items-end justify-center bg-[rgb(40_36_30/0.2)] backdrop-blur-[1.5px] md:px-4 md:pb-24"
        onPointerDown={(e) => (pressedBackdrop.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) close();
          pressedBackdrop.current = false;
        }}
      >
        <FloatingFocusManager context={context} initialFocus={-1}>
          <div
            ref={refs.setFloating}
            role="dialog"
            aria-label="Voice capture"
            onClick={(e) => e.stopPropagation()}
            className="w-full animate-sheet-up overflow-hidden rounded-t-[18px] bg-raised shadow-float md:max-w-[600px] md:animate-rise md:rounded-sheet"
          >
            <VoiceBody onClose={close} />
          </div>
        </FloatingFocusManager>
      </FloatingOverlay>
    </FloatingPortal>
  );
}
