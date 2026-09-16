import { FloatingOverlay, FloatingPortal } from '@floating-ui/react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import type { ID } from '@/domain/types';
import { useUi, type PickerKind } from '@/store/ui';
import { ActionMenu } from '@/components/actions/ActionMenu';
import { Popover } from '@/components/ui/Popover';
import { AssigneeSelector } from './AssigneeSelector';
import { DatePicker } from './DatePicker';
import type { PickerSize } from './ListPicker';
import { PrioritySelector } from './PrioritySelector';
import { ProjectSelector } from './ProjectSelector';
import { ReminderPicker } from './ReminderPicker';
import { EstimatePicker, RepeatPicker, StatusPicker } from './SimplePickers';

interface PickerContentProps {
  kind: PickerKind;
  taskIds: ID[];
  size: PickerSize;
  onDone: () => void;
  /** Called when Esc is pressed at the root of the flow. */
  onExit?: () => void;
  actionHeader?: React.ReactNode;
}

/** Renders the right picker for a kind; the action menu can drill into any picker and back. */
export function PickerContent({ kind, taskIds, size, onDone, onExit, actionHeader }: PickerContentProps) {
  const [stack, setStack] = useState<PickerKind[]>([kind]);
  const current = stack[stack.length - 1];
  const back = stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : onExit;
  const props = { taskIds, size, onDone, onBack: back };

  switch (current) {
    case 'actions':
      return <ActionMenu {...props} header={actionHeader} onPicker={(k) => setStack((s) => [...s, k])} />;
    case 'date':
      return <DatePicker key="date" {...props} />;
    case 'priority':
      return <PrioritySelector key="priority" {...props} />;
    case 'project':
      return <ProjectSelector key="project" {...props} />;
    case 'assign':
      return <AssigneeSelector key="assign" {...props} />;
    case 'remind':
      return <ReminderPicker key="remind" {...props} />;
    case 'repeat':
      return <RepeatPicker key="repeat" {...props} />;
    case 'estimate':
      return <EstimatePicker key="estimate" {...props} />;
    case 'status':
      return <StatusPicker key="status" {...props} />;
  }
}

/** The one picker in the app, driven by `ui.picker`: a popover by the task, or a bottom sheet on phones. */
export function GlobalPicker() {
  const picker = useUi((s) => s.picker);
  const close = useUi((s) => s.closePicker);
  const mobile = useIsMobile();
  if (mobile) {
    if (!picker) return null;
    return (
      <FloatingPortal>
        <FloatingOverlay lockScroll className="z-[70] flex animate-fade flex-col justify-end bg-[rgb(40_36_30/0.22)]" onClick={close}>
          <div className="max-h-[88dvh] animate-sheet-up overflow-y-auto rounded-t-[18px] bg-raised pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" />
            <PickerContent kind={picker.kind} taskIds={picker.taskIds} size="palette" onDone={close} />
          </div>
        </FloatingOverlay>
      </FloatingPortal>
    );
  }
  return (
    <Popover open={!!picker} onClose={close} anchor={picker?.anchor ?? null} label="Task actions">
      {picker && (
        <PickerContent
          key={`${picker.kind}-${picker.taskIds.join(',')}-${picker.anchor.x}-${picker.anchor.y}`}
          kind={picker.kind}
          taskIds={picker.taskIds}
          size="popover"
          onDone={close}
        />
      )}
    </Popover>
  );
}
