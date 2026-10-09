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

/**
 * A turning sphere of colour that swells with the voice, rippling outwards,
 * with three crisp waves running through it.
 */
export function VoiceOrb({ level }: Level) {
  return (
    <div className="voice-orb-wrap" style={levelStyle(level)} aria-hidden>
      <VoiceWaves level={level} />
      <span className="voice-orb-ring" />
      <span className="voice-orb-ring voice-orb-ring-late" />
      <span className="voice-orb" />
    </div>
  );
}

/**
 * Three sine waves in the palette — teal, indigo, rose — drawn sharp on a
 * canvas every frame. Their height follows the voice (eased, so they flow
 * rather than jump); at rest they still breathe a little, so silence reads as
 * listening, not as frozen. With Reduce Motion they stand still and only
 * their height answers.
 */
function VoiceWaves({ level }: Level) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(0);
  target.current = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.3);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const css = getComputedStyle(document.documentElement);
    const colours = ['--color-accent', '--color-tomorrow', '--color-day-6'].map((v) => css.getPropertyValue(v).trim() || '#1e676c');
    let amp = 0.08;
    let phase = 0;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // Ease toward the voice; never quite flat.
      amp += (Math.max(0.08, target.current) - amp) * 0.18;
      if (!still) phase += 0.07 + amp * 0.12;
      const mid = h / 2;
      colours.forEach((colour, i) => {
        const height = (mid - 3) * amp * (1 - i * 0.18);
        const k = (Math.PI * 2 * (1.4 + i * 0.35)) / w;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          // Tapered at both ends, full in the middle.
          const env = Math.sin((Math.PI * x) / w) ** 2;
          const y = mid + height * env * Math.sin(k * x + phase * (1 + i * 0.4) + i * 1.7);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.95 - i * 0.15;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} className="voice-waves" />;
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
