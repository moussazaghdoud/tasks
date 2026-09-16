import { CalendarDays, Check, Flag, FolderInput, Sun, Trash2, X } from 'lucide-react';
import { todayKey } from '@/lib/dates';
import { anchorFromElement, ui, useUi } from '@/store/ui';
import { completeTasks, deleteTasks, schedule, toggleImportant } from '@/actions/taskActions';
import { Tooltip } from '@/components/ui/Tooltip';

/** Appears when several tasks are selected; every action applies to all of them. */
export function SelectionBar() {
  const selection = useUi((s) => s.selection);
  if (selection.length === 0) return null;
  const btn = 'grid size-9 place-items-center rounded-[8px] text-white/75 transition-colors hover:bg-white/10 hover:text-white';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 max-md:bottom-[calc(76px+env(safe-area-inset-bottom))]">
      <div role="toolbar" aria-label="Selected tasks" className="pointer-events-auto flex animate-toast items-center gap-0.5 rounded-[12px] bg-[#26241f] py-1 pr-1 pl-3.5 text-ui text-white shadow-float">
        <span className="mr-2 font-medium font-num">{selection.length} selected</span>
        <Tooltip label="Today" shortcut="t">
          <button aria-label="Today" className={btn} onClick={() => schedule(selection, todayKey(), null)}>
            <Sun className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Schedule" shortcut="d">
          <button aria-label="Schedule" className={btn} onClick={(e) => ui().openPicker({ kind: 'date', taskIds: selection, anchor: anchorFromElement(e.currentTarget) })}>
            <CalendarDays className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Important" shortcut="i">
          <button aria-label="Toggle important" className={btn} onClick={() => toggleImportant(selection)}>
            <Flag className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Move" shortcut="m">
          <button aria-label="Move to project" className={btn} onClick={(e) => ui().openPicker({ kind: 'project', taskIds: selection, anchor: anchorFromElement(e.currentTarget) })}>
            <FolderInput className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Complete" shortcut="mod+enter">
          <button aria-label="Complete" className={btn} onClick={() => void completeTasks(selection)}>
            <Check className="size-4" />
          </button>
        </Tooltip>
        <Tooltip label="Delete" shortcut="backspace">
          <button aria-label="Delete" className={btn} onClick={() => deleteTasks(selection)}>
            <Trash2 className="size-4" />
          </button>
        </Tooltip>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <Tooltip label="Clear selection" shortcut="esc">
          <button aria-label="Clear selection" className={btn} onClick={() => ui().setSelection([])}>
            <X className="size-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
