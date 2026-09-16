import { Mic } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '@/lib/platform';
import { useUi } from '@/store/ui';
import { Kbd } from '@/components/ui/Kbd';
import { finishVoiceRecording } from './VoiceCapture';

const HOLD_MS = 450;

/**
 * The capture button in the middle. Tap to talk, tap again (or pause) to finish.
 * Press and hold works like a walkie-talkie: release to finish.
 */
export function VoiceButton({ variant = 'floating' }: { variant?: 'floating' | 'nav' | 'hero' }) {
  const setVoice = useUi((s) => s.setVoice);
  const pressedAt = useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pressedAt.current = Date.now();
    setVoice(true);
  };
  const onPointerUp = () => {
    const started = pressedAt.current;
    pressedAt.current = null;
    if (started && Date.now() - started > HOLD_MS) finishVoiceRecording();
  };

  if (variant === 'hero') {
    return (
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setVoice(true);
          }
        }}
        aria-label="Speak a task"
        aria-keyshortcuts="V"
        className={cn(
          'voice-fab group/hero grid size-[88px] touch-none place-items-center rounded-full bg-accent text-white select-none',
          'transition-[transform,background-color] duration-200 hover:scale-[1.04] hover:bg-accent-hover active:scale-[0.97]',
        )}
      >
        <Mic className="size-9 transition-transform duration-200 group-hover/hero:scale-105" strokeWidth={1.9} />
      </button>
    );
  }

  if (variant === 'nav') {
    return (
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Speak a task"
        className="voice-fab grid size-[52px] touch-none place-items-center rounded-full bg-accent text-white transition-transform select-none active:scale-95"
      >
        <Mic className="size-6" strokeWidth={2.1} />
      </button>
    );
  }

  return (
    <div className="group pointer-events-none flex flex-col-reverse items-center gap-2">
      <button
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setVoice(true);
          }
        }}
        aria-label="Speak a task"
        aria-keyshortcuts="V"
        className={cn(
          'voice-fab pointer-events-auto grid size-14 place-items-center rounded-full bg-accent text-white transition-[transform,background-color] duration-150 select-none',
          'hover:scale-[1.05] hover:bg-accent-hover active:scale-95',
        )}
      >
        <Mic className="size-6" strokeWidth={2.1} />
      </button>
      <span className="flex items-center gap-1.5 rounded-full bg-raised/90 px-2.5 py-1 text-[11.5px] font-medium text-ink-3 opacity-0 shadow-[0_0_0_1px_rgb(29_28_26/0.06)] backdrop-blur transition-opacity duration-150 group-hover:opacity-100">
        Speak a task <Kbd combo="v" subtle />
      </span>
    </div>
  );
}
