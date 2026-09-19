import { useEffect, useRef, useState } from 'react';

const BARS = 34;

/**
 * The voice made visible.
 *
 * The newest sample enters at the right and the history scrolls left, so the
 * shape tracks what you just said rather than jittering in place. Silence
 * shows as a thin resting line instead of nothing, which is the difference
 * between "listening" and "broken".
 */
export function Waveform({ level }: { level: number }) {
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0));
  const latest = useRef(0);
  latest.current = level;

  useEffect(() => {
    const id = setInterval(() => {
      setBars((prev) => [...prev.slice(1), latest.current]);
    }, 55);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-11 items-center justify-center gap-[3px]" aria-hidden>
      {bars.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-accent transition-[height,opacity] duration-100 ease-out"
          style={{
            // Always a visible dot, growing with the voice.
            height: `${4 + Math.min(1, v * 1.15) * 38}px`,
            opacity: 0.35 + Math.min(1, v) * 0.65,
          }}
        />
      ))}
    </div>
  );
}
