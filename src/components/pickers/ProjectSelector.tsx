import { Inbox, Plus } from 'lucide-react';
import { moveTo } from '@/actions/taskActions';
import { useProjects } from '@/store/selectors';
import { useWorkspace, ws } from '@/store/workspace';
import { ProjectGlyph, ACCENTS } from '@/components/ui/ProjectGlyph';
import { ListPicker, type PickItem } from './ListPicker';
import type { PickerProps } from './DatePicker';

export function ProjectSelector({ taskIds, size, onDone, onBack }: PickerProps) {
  const projects = useProjects();
  const tasks = useWorkspace((s) => s.tasks);
  const current = taskIds.length === 1 ? tasks[taskIds[0]]?.projectId ?? null : undefined;

  const items = (q: string): PickItem[] => {
    const list: PickItem[] = [
      {
        id: 'inbox',
        label: 'No project',
        text: 'inbox none no project',
        icon: <Inbox className="size-4" />,
        selected: current === null,
        onSelect: () => {
          moveTo(taskIds, null);
          onDone();
        },
      },
      ...projects.map((p) => ({
        id: p.id,
        label: p.name,
        text: p.name,
        icon: <ProjectGlyph project={p} />,
        selected: current === p.id,
        onSelect: () => {
          moveTo(taskIds, p.id);
          onDone();
        },
      })),
    ];
    const name = q.trim();
    if (name && !projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      list.push({
        id: 'create',
        pinned: true,
        label: (
          <>
            Create project <span className="font-medium text-ink">“{name}”</span>
          </>
        ),
        text: name,
        icon: <Plus className="size-4" />,
        onSelect: () => {
          const p = ws().addProject({ name, accent: ACCENTS[projects.length % ACCENTS.length] });
          moveTo(taskIds, p.id);
          onDone();
        },
      });
    }
    return list;
  };

  return <ListPicker items={items} placeholder="Move to project…" onClose={onDone} onBack={onBack} size={size} />;
}
