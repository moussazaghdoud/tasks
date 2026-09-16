import { Archive, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ID } from '@/domain/types';
import { useProjectData } from '@/store/selectors';
import { ui } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { Popover } from '@/components/ui/Popover';
import { ProjectGlyph } from '@/components/ui/ProjectGlyph';
import { ListPicker } from '@/components/pickers/ListPicker';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { CompletedSection, TaskList } from '@/components/tasks/TaskList';
import { useRegisterVisible, ViewHeader } from './ViewHeader';

export function ProjectView({ id }: { id: ID }) {
  const project = useWorkspace((s) => s.projects[id]);
  const { open, completed } = useProjectData(id);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  useRegisterVisible(useMemo(() => open.map((t) => t.id), [open]));

  if (!project) {
    return <EmptyState title="This project no longer exists.">It may have been deleted on another device.</EmptyState>;
  }

  const saveDesc = (text: string) => {
    ws().updateProject(id, { description: text.trim() });
    setEditingDesc(false);
  };

  const remove = () => {
    const count = open.length + completed.length;
    const undo = ws().transact(() => ws().deleteProject(id));
    ui().navigate({ name: 'today' });
    toast(`Project “${project.name}” deleted`, {
      detail: count ? `Its ${count} task${count === 1 ? '' : 's'} moved to the Inbox` : undefined,
      action: { label: 'Undo', run: () => (undo(), ui().navigate({ name: 'project', id })) },
    });
  };

  return (
    <div>
      <ViewHeader
        icon={<ProjectGlyph project={project} size={24} />}
        title={project.name}
        subtitle={
          editingDesc ? (
            <input
              autoFocus
              defaultValue={project.description}
              placeholder="What is this project about?"
              onBlur={(e) => saveDesc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDesc(e.currentTarget.value);
                if (e.key === 'Escape') setEditingDesc(false);
              }}
              className="w-full bg-transparent text-ui text-ink-2 outline-none"
            />
          ) : (
            <button onClick={() => setEditingDesc(true)} className="text-left hover:text-ink-2">
              {project.description || <span className="text-ink-4">Add a description</span>}
            </button>
          )
        }
        actions={
          <button
            aria-label="Project options"
            onClick={(e) => setMenu(e.currentTarget)}
            className="grid size-8 place-items-center rounded-[8px] text-ink-3 transition-colors hover:bg-wash-strong hover:text-ink"
          >
            <Ellipsis className="size-4" />
          </button>
        }
      />
      <Popover open={!!menu} onClose={() => setMenu(null)} anchor={menu} placement="bottom-end">
        <ListPicker
          placeholder="Project options"
          onClose={() => setMenu(null)}
          items={[
            { id: 'edit', label: 'Edit name, icon & color', text: 'edit rename icon color', icon: <Pencil className="size-4" />, onSelect: () => (setMenu(null), ui().setProjectDialog({ id })) },
            {
              id: 'archive',
              label: 'Archive project',
              text: 'archive hide',
              icon: <Archive className="size-4" />,
              onSelect: () => {
                setMenu(null);
                ws().archiveProject(id);
                ui().navigate({ name: 'today' });
                toast(`“${project.name}” archived`, { action: { label: 'Undo', run: () => ws().updateProject(id, { archivedAt: null }) } });
              },
            },
            { id: 'delete', label: 'Delete project', text: 'delete remove', icon: <Trash2 className="size-4" />, danger: true, onSelect: () => (setMenu(null), remove()) },
          ]}
        />
      </Popover>

      <TaskComposer
        defaults={{ fields: { projectId: id }, chip: { id: 'ctx-project', icon: <ProjectGlyph project={project} size={12} />, label: project.name } }}
        isVisibleHere={(t) => t.projectId === id}
      />
      <div className="mt-6">
        <TaskList
          listId={`project:${id}`}
          tasks={open}
          ctx={{ hideProject: true }}
          empty={
            <EmptyState title={completed.length ? `Nothing left in ${project.name}.` : `${project.name} is empty.`}>
              Write tasks above — they’ll be filed here. Or add “#{project.name.split(' ')[0].toLowerCase()}” when you write one anywhere.
            </EmptyState>
          }
        />
      </div>
      <CompletedSection listId={`project-done:${id}`} tasks={completed} ctx={{ hideProject: true }} />
    </div>
  );
}
