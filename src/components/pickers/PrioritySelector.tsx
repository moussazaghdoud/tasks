import { ArrowDown, Flag, Minus } from 'lucide-react';
import type { Priority } from '@/domain/types';
import { setPriority } from '@/actions/taskActions';
import { useWorkspace } from '@/store/workspace';
import { ListPicker, type PickItem } from './ListPicker';
import type { PickerProps } from './DatePicker';

export const PRIORITY_LABEL: Record<Priority, string> = { important: 'Important', normal: 'Normal', low: 'Low' };

export function PrioritySelector({ taskIds, size, onDone, onBack }: PickerProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const current = taskIds.length === 1 ? tasks[taskIds[0]]?.priority : undefined;
  const pick = (p: Priority) => () => {
    setPriority(taskIds, p);
    onDone();
  };
  const items: PickItem[] = [
    { id: 'important', label: 'Important', text: 'important high urgent p1', icon: <Flag className="size-4 text-ember" />, hint: 'Stands out everywhere', selected: current === 'important', shortcut: '1', onSelect: pick('important') },
    { id: 'normal', label: 'Normal', text: 'normal default p2', icon: <Minus className="size-4" />, selected: current === 'normal', shortcut: '2', onSelect: pick('normal') },
    { id: 'low', label: 'Low', text: 'low someday p3', icon: <ArrowDown className="size-4" />, hint: 'Quieter in lists', selected: current === 'low', shortcut: '3', onSelect: pick('low') },
  ];
  return (
    <ListPicker
      items={items}
      placeholder="Priority"
      onClose={onDone}
      onBack={onBack}
      size={size}
      onKeyDown={(e, q) => {
        if (q) return;
        const map: Record<string, Priority> = { '1': 'important', '2': 'normal', '3': 'low' };
        if (map[e.key]) {
          e.preventDefault();
          pick(map[e.key])();
          return true;
        }
      }}
    />
  );
}
