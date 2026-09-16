import { UserMinus, UserPlus } from 'lucide-react';
import { ME } from '@/domain/factories';
import { assignTo } from '@/actions/taskActions';
import { usePeople } from '@/store/selectors';
import { useWorkspace, ws } from '@/store/workspace';
import { Avatar } from '@/components/ui/Avatar';
import { ListPicker, type PickItem } from './ListPicker';
import type { PickerProps } from './DatePicker';

export function AssigneeSelector({ taskIds, size, onDone, onBack }: PickerProps) {
  const people = usePeople();
  const tasks = useWorkspace((s) => s.tasks);
  const userName = useWorkspace((s) => s.user.name);
  const current = taskIds.length === 1 ? tasks[taskIds[0]]?.assigneeId ?? null : undefined;

  const items = (q: string): PickItem[] => {
    const list: PickItem[] = people.map((p) => ({
      id: p.id,
      label: p.id === ME ? (userName ? `${userName} (you)` : 'Me') : p.name,
      text: p.id === ME ? `me myself ${userName}` : `${p.name} ${p.email ?? ''}`,
      icon: <Avatar person={p.id === ME ? { id: ME, name: userName || 'Me' } : p} size={18} />,
      hint: p.id !== ME && p.email ? p.email.split('@')[0] : undefined,
      selected: p.id === ME ? current === null || current === ME : current === p.id,
      onSelect: () => {
        assignTo(taskIds, p.id === ME ? null : p.id);
        onDone();
      },
    }));
    const name = q.trim();
    if (name && !people.some((p) => p.name.toLowerCase().startsWith(name.toLowerCase()))) {
      list.push({
        id: 'new',
        pinned: true,
        label: (
          <>
            Assign to <span className="font-medium text-ink">{name}</span>
          </>
        ),
        text: name,
        icon: <UserPlus className="size-4" />,
        hint: 'New person',
        onSelect: () => {
          const p = ws().addPerson(name);
          assignTo(taskIds, p.id);
          onDone();
        },
      });
    }
    if (current && current !== ME && !name) {
      list.push({
        id: 'unassign',
        label: 'Take it back',
        text: 'unassign remove',
        icon: <UserMinus className="size-4" />,
        onSelect: () => {
          assignTo(taskIds, null);
          onDone();
        },
      });
    }
    return list;
  };

  return <ListPicker items={items} placeholder="Assign to… (type a new name to add)" onClose={onDone} onBack={onBack} size={size} />;
}
