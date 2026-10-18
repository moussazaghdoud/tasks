import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Space } from '@/domain/types';
import { confirmAction, haptic } from '@/lib/native/bridge';
import { cn } from '@/lib/platform';
import { Sheet } from './Sheet';
import { t } from './i18n';

export interface Composed {
  text: string;
  notes: string;
  space: Space;
}

const SPACES: Space[] = ['business', 'private'];

/**
 * Writing a thought, new or not: one window for both, so typing one and
 * changing one feel the same.
 *
 * Which half it belongs to sits at the top — Business or Private, set to
 * where the person is and changed in one tap. The words get all the room
 * above the keyboard; Return starts a new line and Save keeps it. The cross
 * leaves, asking first when something was changed. Changing a thought also
 * shows its note below, to change or to add.
 */
export function Composer({
  open,
  label,
  initialText,
  initialNotes = '',
  showNotes = false,
  initialSpace,
  photo,
  onClose,
  onSave,
}: {
  open: boolean;
  label: string;
  initialText: string;
  initialNotes?: string;
  /** Changing a thought: its note, to change or to add, below the words. */
  showNotes?: boolean;
  initialSpace: Space;
  /** A photograph waiting for its words: shown, and enough on its own to save. */
  photo?: string | null;
  onClose: () => void;
  onSave: (composed: Composed) => void;
}) {
  const [text, setText] = useState(initialText);
  const [notes, setNotes] = useState(initialNotes);
  const [space, setSpace] = useState<Space>(initialSpace);
  const field = useRef<HTMLTextAreaElement>(null);
  const withNotes = showNotes;

  // Start from what is there, every time it opens, with the caret at the end:
  // people come back to correct the tail of a sentence, not its head.
  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setNotes(initialNotes);
    setSpace(initialSpace);
    requestAnimationFrame(() => {
      const el = field.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [open, initialText, initialNotes, initialSpace]);

  const changed = text !== initialText || notes !== initialNotes || space !== initialSpace;
  const canSave = !!text.trim() || !!photo;

  const save = () => {
    if (!canSave) return;
    onClose();
    onSave({ text: text.trim(), notes: notes.trim(), space });
  };

  /** Leaving without saving — the cross, a swipe down, a tap beside it. */
  const cancel = async () => {
    if (changed && (text.trim() || notes.trim())) {
      const sure = await confirmAction(t('discard_body'), t('discard_title'), {
        ok: t('discard_ok'),
        cancel: t('keep_editing'),
      });
      if (!sure) {
        field.current?.focus();
        return;
      }
    }
    onClose();
  };

  // All the room above the keyboard (the web view has already shrunk to it),
  // less what else the window holds.
  const height = photo ? 'calc(64dvh - 214px)' : withNotes ? 'calc(86dvh - 300px)' : 'calc(86dvh - 194px)';

  return (
    // Opens the keyboard at once, so it waits for it rather than jumping.
    <Sheet open={open} onClose={() => void cancel()} label={label} waitForKeyboard>
      <div className="px-5 pb-2">
        <div className="-mt-2 mb-2 flex items-center justify-between">
          {/* Business or Private: where the thought goes. */}
          <div role="radiogroup" aria-label={label} className="flex h-9 rounded-full border border-line bg-sunk p-[3px]">
            {SPACES.map((id) => {
              const on = id === space;
              return (
                <button
                  key={id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (on) return;
                    haptic('light');
                    setSpace(id);
                  }}
                  className={cn(
                    'rounded-full px-3.5 text-[13.5px] transition-colors',
                    on ? 'bg-accent-soft font-semibold text-accent ring-1 ring-accent/25' : 'font-medium text-ink-3',
                  )}
                >
                  {t(id)}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => void cancel()}
            aria-label={t('cancel')}
            className="-me-2 grid size-10 place-items-center rounded-full text-ink-3 active:bg-wash-strong"
          >
            <X className="size-5" strokeWidth={2} />
          </button>
        </div>

        {photo && (
          <img src={photo} alt={t('photo_attached')} className="mb-3 max-h-[22dvh] w-full rounded-[16px] border border-line object-cover" />
        )}

        <textarea
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Return starts a new line; Save keeps it. Cmd/Ctrl+Return saves too.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
          placeholder={t('type_placeholder')}
          aria-label={t('a11y_thought')}
          style={{ height }}
          className="min-h-[96px] w-full resize-none bg-transparent text-[20px] leading-[29px] text-ink outline-none placeholder:text-ink-4"
        />

        {withNotes && (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={t('edit_note_placeholder')}
            aria-label={t('edit_note_placeholder')}
            className="mt-2 w-full resize-none rounded-[16px] border border-line bg-sunk px-4 py-3 text-[15px] leading-[22px] text-ink-2 outline-none placeholder:text-ink-4 focus:border-accent/50"
          />
        )}

        <button
          onClick={save}
          disabled={!canSave}
          className="mt-2 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold tracking-[-0.01em] text-on-accent transition-opacity disabled:opacity-30"
        >
          {t('save')}
        </button>
      </div>
    </Sheet>
  );
}
