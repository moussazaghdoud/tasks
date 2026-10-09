import { Bell, CornerDownLeft } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { ME } from '@/domain/factories';
import { cn } from '@/lib/platform';
import { ws } from '@/store/workspace';
import { dayTimeIn } from './i18n';
import { understand } from './understood';

/**
 * Listening, made visible.
 *
 * Three layers, each answering one question. The aurora behind the sheet:
 * is it hearing me? — it breathes with the voice. The orb: how loud? — it
 * swells and turns. The words: what did it get? — each arrives lit and
 * settles, and what the app has understood keeps its colour: the reminder,
 * a name from the list, a spoken new line shown as one.
 */

type Level = { level: number };
/**
 * The microphone reports ordinary speech as roughly 0.15–0.5. A square root
 * lifts the quiet end, so a soft voice already moves things and a raised one
 * fills the range — linear, the orb barely stirred.
 */
const levelStyle = (level: number) =>
  ({ '--level': Math.min(1, Math.sqrt(Math.max(0, level)) * 1.3).toFixed(3) }) as React.CSSProperties;

/** Soft colour drifting behind the sheet, brighter as the voice rises. */
export function Aurora({ level }: Level) {
  return (
    <div className="voice-aurora" style={levelStyle(level)} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

/** A turning sphere of colour that swells with the voice, rippling outwards. */
export function VoiceOrb({ level }: Level) {
  return (
    <div className="voice-orb-wrap" style={levelStyle(level)} aria-hidden>
      <span className="voice-orb-ring" />
      <span className="voice-orb-ring voice-orb-ring-late" />
      <span className="voice-orb" />
    </div>
  );
}

/** The names the person talks about: people and live projects on the list. */
function knownNames(): string[] {
  const s = ws();
  return [
    ...Object.values(s.people)
      .filter((p) => p.id !== ME)
      .map((p) => p.name),
    ...Object.values(s.projects)
      .filter((p) => !p.archivedAt)
      .map((p) => p.name),
  ];
}

/** A word, a run of spaces, or one Chinese character — each its own arrival. */
const TOKENS = /\s+|[㐀-鿿]|[^\s㐀-鿿]+/g;

/**
 * The words as they are heard. New ones arrive lit and settle into ink;
 * words already shown never replay. What is understood keeps its colour.
 */
export function LiveTranscript({ text, placeholder, muted }: { text: string; placeholder: string; muted?: boolean }) {
  const shown = useRef(0);
  const names = useMemo(knownNames, []);
  const { segments, at } = useMemo(() => understand(text, names), [text, names]);

  let index = 0;
  const words = segments.map((segment, s) => {
    if (segment.kind === 'newline') {
      const fresh = index++ >= shown.current;
      return (
        <span key={`n${s}`} className={cn('said-newline', fresh && 'word-in')} aria-label="↵">
          <CornerDownLeft className="size-[15px]" strokeWidth={2.4} />
        </span>
      );
    }
    const tokens = segment.text.match(TOKENS) ?? [];
    return (
      <span key={s} className={segment.kind === 'when' ? 'said-when' : segment.kind === 'name' ? 'said-name' : undefined}>
        {tokens.map((token, k) =>
          /^\s+$/.test(token) ? (
            token
          ) : (
            <span key={k} className={index++ >= shown.current ? 'word-in' : undefined}>
              {token}
            </span>
          ),
        )}
      </span>
    );
  });
  const total = index;
  // After this render, every word on screen counts as already shown.
  useEffect(() => {
    shown.current = total;
  });
  // A new recording starts from nothing.
  useEffect(() => {
    if (!text) shown.current = 0;
  }, [text]);

  return (
    <>
      <p
        className={cn(
          'live-words text-[22px] leading-[31px] tracking-[-0.01em]',
          text ? 'text-ink' : 'text-ink-4',
          muted && 'text-ink-3',
        )}
      >
        {text ? words : placeholder}
      </p>
      {/* The reminder, as soon as it is understood: the moment it will ring. */}
      {at && (
        <p className="mt-2 inline-flex animate-pop items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-[13px] font-semibold text-accent">
          <Bell className="size-3.5" strokeWidth={2.2} />
          {dayTimeIn(at)}
        </p>
      )}
    </>
  );
}
