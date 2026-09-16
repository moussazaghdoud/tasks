import { useEffect, useState } from 'react';
import type { Accent, ProjectIcon } from '@/domain/types';
import { cn } from '@/lib/platform';
import { ui, useUi } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { Modal } from '@/components/ui/Modal';
import { ACCENTS, ACCENT_HEX, PROJECT_ICONS, ProjectGlyph } from '@/components/ui/ProjectGlyph';

/** Lightweight project creation: a name is enough; icon and color are optional. */
export function ProjectDialog() {
  const dialog = useUi((s) => s.projectDialog);
  const close = () => ui().setProjectDialog(null);
  const existing = useWorkspace((s) => (dialog?.id ? s.projects[dialog.id] : undefined));
  const count = useWorkspace((s) => Object.keys(s.projects).length);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ProjectIcon>('circle');
  const [accent, setAccent] = useState<Accent>('petrol');

  useEffect(() => {
    if (!dialog) return;
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setIcon(existing?.icon ?? 'circle');
    setAccent(existing?.accent ?? ACCENTS[count % ACCENTS.length]);
  }, [dialog, existing, count]);

  const submit = () => {
    if (!name.trim()) return;
    if (existing) {
      ws().updateProject(existing.id, { name: name.trim(), description: description.trim(), icon, accent });
    } else {
      const p = ws().addProject({ name, description: description.trim(), icon, accent });
      ui().navigate({ name: 'project', id: p.id });
    }
    close();
  };

  return (
    <Modal open={!!dialog} onClose={close} label={existing ? 'Edit project' : 'New project'} className="max-w-[440px]" align="top">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="p-5"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-wash-strong">
            <ProjectGlyph project={{ icon, accent }} size={20} />
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            aria-label="Project name"
            className="h-10 min-w-0 flex-1 bg-transparent text-[20px] font-semibold tracking-[-0.01em] outline-none placeholder:font-normal"
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="Description"
          className="mt-2 h-9 w-full bg-transparent pl-[52px] text-ui text-ink-2 outline-none"
        />

        <div className="mt-5">
          <p className="label-caps mb-2">Icon</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(PROJECT_ICONS) as ProjectIcon[]).map((k) => (
              <button
                type="button"
                key={k}
                aria-label={k}
                aria-pressed={icon === k}
                onClick={() => setIcon(k)}
                className={cn('grid size-9 place-items-center rounded-[8px] transition-colors', icon === k ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'hover:bg-wash-strong')}
              >
                <ProjectGlyph project={{ icon: k, accent }} size={17} />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <p className="label-caps mb-2">Color</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                type="button"
                key={a}
                aria-label={a}
                aria-pressed={accent === a}
                onClick={() => setAccent(a)}
                className={cn('size-7 rounded-full transition-transform hover:scale-110', accent === a && 'ring-2 ring-offset-2 ring-offset-raised')}
                style={{ background: ACCENT_HEX[a], ['--tw-ring-color' as string]: ACCENT_HEX[a] }}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={close} className="h-9 rounded-[9px] px-3.5 text-ui font-medium text-ink-2 hover:bg-wash-strong">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim()} className="h-9 rounded-[9px] bg-accent px-4 text-ui font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-40">
            {existing ? 'Save' : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
