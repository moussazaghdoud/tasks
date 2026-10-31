import { Bell, CornerDownLeft, Mic } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { ME } from '@/domain/factories';
import { cn } from '@/lib/platform';
import { ws } from '@/store/workspace';
import { dayTimeIn } from './i18n';
import { understand } from './understood';

/**
 * Listening, made visible.
 *
 * Two layers, each answering one question. The halo: is it hearing me, and
 * how loud? — rings leave the microphone with the voice. The words: what did
 * it get? — each arrives lit and settles, and what the app has understood
 * keeps its colour: the reminder, a name from the list, a spoken new line
 * shown as one.
 */

type Level = { level: number };
/**
 * The microphone reports ordinary speech as roughly 0.15–0.5. A square root
 * lifts the quiet end, so a soft voice already moves things and a raised one
 * fills the range — linear, the orb barely stirred.
 */
const levelStyle = (level: number) =>
  ({ '--level': Math.min(1, Math.sqrt(Math.max(0, level)) * 1.3).toFixed(3) }) as React.CSSProperties;

/**
 * The halo: a microphone in a disc, a soft glow around it, and rings that
 * leave it while you speak — more often and wider as the voice rises, few
 * and faint in a pause. Calm enough to sit beside the words, and nobody has
 * to be told it is listening.
 */
export function VoiceOrb({ level }: Level) {
  return (
    <div className="voice-halo" style={levelStyle(level)} aria-hidden>
      <HaloRings level={level} />
      <span className="voice-halo-glow" />
      <span className="voice-halo-disc">
        <Mic className="size-[22px]" strokeWidth={2.2} />
      </span>
    </div>
  );
}

/**
 * The rings, drawn on a canvas: each one is born at the disc with the
 * strength of the voice at that moment and widens as it fades. With Reduce
 * Motion no rings leave; the glow alone answers the voice.
 */
function HaloRings({ level }: Level) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef(0);
  target.current = Math.min(1, Math.sqrt(Math.max(0, level)) * 1.3);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const colour = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#1e676c';
    const LIFE = 1400;
    const DISC = 23;
    let rings: Array<{ born: number; strength: number }> = [];
    let eased = 0;
    let last = 0;
    let frame = 0;

    const draw = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      eased += (target.current - eased) * 0.2;
      // A louder voice sends rings more often.
      if (!still && now - last > 380 - eased * 200) {
        rings.push({ born: now, strength: eased });
        last = now;
      }
      rings = rings.filter((r) => now - r.born < LIFE);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      for (const ring of rings) {
        const k = (now - ring.born) / LIFE;
        ctx.globalAlpha = (1 - k) * (0.15 + 0.5 * ring.strength);
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, DISC + k * (18 + 40 * (0.3 + ring.strength)), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} className="voice-halo-rings" />;
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
