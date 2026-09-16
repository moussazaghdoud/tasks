import type { ID } from '@/domain/types';
import { actionsFor, TASK_ACTIONS, type TaskActionDef } from '@/actions/registry';
import { smartItems } from '@/actions/smartItems';
import { useWorkspace } from '@/store/workspace';
import type { PickerKind } from '@/store/ui';
import { ListPicker, type PickItem, type PickerSize } from '@/components/pickers/ListPicker';
import { Sparkles } from 'lucide-react';

interface ActionMenuProps {
  taskIds: ID[];
  size: PickerSize;
  onDone: () => void;
  onPicker: (kind: PickerKind) => void;
  onBack?: () => void;
  header?: React.ReactNode;
}

/**
 * The universal "what do you want to do with it?" menu. Searchable; typing a
 * phrase ("fri 3pm", "move rainbow", "assign claire") offers the matching
 * transformation directly.
 */
export function ActionMenu({ taskIds, size, onDone, onPicker, onBack, header }: ActionMenuProps) {
  const tasks = useWorkspace((s) => s.tasks);
  const selected = taskIds.map((id) => tasks[id]).filter(Boolean);

  const select = (a: TaskActionDef) => {
    if (a.picker) onPicker(a.picker);
    else {
      a.run?.(taskIds);
      onDone();
    }
  };

  const items = (q: string): PickItem[] => {
    const defs = q.trim() ? TASK_ACTIONS.filter((a) => (!a.single || selected.length === 1) && (!a.visible || a.visible(selected))) : actionsFor(selected);
    const base: PickItem[] = defs.map((a) => {
      const Icon = a.icon;
      return {
        id: a.id,
        label: a.label(selected),
        text: `${a.label(selected)} ${a.keywords}`,
        icon: <Icon className="size-4" />,
        shortcut: a.shortcut,
        section: q.trim() ? undefined : a.section,
        danger: a.danger,
        onSelect: () => select(a),
      };
    });
    const smart = smartItems(q, taskIds, onDone);
    // "tomorrow" should offer one way to do it, not two.
    const hasDate = smart.some((i) => i.id === 'nl-date');
    return [...smart, ...base.filter((b) => !(hasDate && ['today', 'tomorrow', 'nextweek'].includes(b.id)))];
  };

  const title = selected.length === 1 ? selected[0].title : `${selected.length} tasks`;

  return (
    <ListPicker
      items={items}
      placeholder={size === 'palette' ? `What do you want to do with “${title}”?` : 'What do you want to do?'}
      onClose={onDone}
      onBack={onBack}
      size={size}
      header={header}
      leading={<Sparkles className="size-4 shrink-0 text-accent/70" />}
      empty="Try “tomorrow”, “fri 3pm”, “move ips” or “assign claire”."
    />
  );
}
