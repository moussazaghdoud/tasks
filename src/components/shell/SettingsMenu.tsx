import { Download, Keyboard, RefreshCw, Settings, Trash2, Upload, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { ME } from '@/domain/factories';
import type { WorkspaceSnapshot } from '@/domain/types';
import { cn } from '@/lib/platform';
import { confirmAction, exportFile } from '@/lib/native/bridge';
import { ui } from '@/store/ui';
import { useWorkspace, ws } from '@/store/workspace';
import { toast } from '@/store/toast';
import { Avatar } from '@/components/ui/Avatar';
import { Kbd } from '@/components/ui/Kbd';
import { Popover } from '@/components/ui/Popover';

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-[8px] bg-wash-strong p-0.5">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className={cn('h-7 flex-1 rounded-[6px] px-2.5 text-meta font-medium transition-colors', value === v ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink-2')}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsMenu({ collapsed }: { collapsed: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const user = useWorkspace((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => setAnchor(null);

  const exportData = () => {
    // A download in the browser, the share sheet in the app.
    void exportFile(`hence-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ws().exportSnapshot(), null, 2));
    close();
  };

  const importData = async (file: File) => {
    try {
      const snap = JSON.parse(await file.text()) as WorkspaceSnapshot;
      if (!Array.isArray(snap.tasks) || !snap.user) throw new Error('bad file');
      await ws().importSnapshot(snap);
      toast('Workspace imported', { detail: `${snap.tasks.length} tasks` });
      close();
    } catch {
      toast('That file isn’t a Hence export');
    }
  };

  const row = 'flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-ui text-ink-2 transition-colors hover:bg-wash-strong hover:text-ink';

  return (
    <>
      <button
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Settings"
        className={cn(
          'flex h-9 items-center gap-2.5 rounded-[8px] text-ui text-ink-2 transition-colors hover:bg-sunk hover:text-ink',
          collapsed ? 'w-9 justify-center' : 'w-full px-2',
        )}
      >
        {user.name ? (
          <Avatar person={{ id: ME, name: user.name }} size={22} />
        ) : (
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-sunk text-ink-3">
            <User className="size-3.5" />
          </span>
        )}
        {!collapsed && <span className="flex-1 truncate text-left">{user.name || 'You'}</span>}
        {!collapsed && <Settings className="size-4 text-ink-4" />}
      </button>
      <Popover open={!!anchor} onClose={close} anchor={anchor} placement="top-start" className="w-[292px]">
        <div className="p-3">
          <label className="block">
            <span className="label-caps">Your name</span>
            <input
              defaultValue={user.name}
              placeholder="Used in the greeting"
              onBlur={(e) => ws().setUserName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="mt-1.5 h-9 w-full rounded-[8px] bg-wash px-2.5 text-ui outline-none focus:bg-transparent focus:shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
            />
          </label>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-meta text-ink-3">Time</span>
              <Segmented value={user.preferences.timeFormat} options={[['24h', '14:00'], ['12h', '2pm']]} onChange={(v) => ws().setPreferences({ timeFormat: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-meta text-ink-3">Week starts</span>
              <Segmented value={user.preferences.weekStartsOn} options={[[1, 'Monday'], [0, 'Sunday']]} onChange={(v) => ws().setPreferences({ weekStartsOn: v })} />
            </div>
          </div>
        </div>
        <div className="border-t border-line p-1.5">
          <button className={row} onClick={() => (close(), ui().setShortcuts(true))}>
            <Keyboard className="size-4 text-ink-3" /> <span className="flex-1 text-left">Keyboard shortcuts</span> <Kbd combo="?" subtle />
          </button>
          <button className={row} onClick={exportData}>
            <Download className="size-4 text-ink-3" /> Export data
          </button>
          <button className={row} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4 text-ink-3" /> Import data
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        </div>
        <div className="border-t border-line p-1.5">
          <button
            className={row}
            onClick={() => {
              void (async () => {
                if (!(await confirmAction('Replace your workspace with the demo data? Export first if you want to keep your tasks.', 'Restore demo data'))) return;
                await ws().resetToDemo();
                close();
                ui().navigate({ name: 'today' });
                toast('Demo workspace restored');
              })();
            }}
          >
            <RefreshCw className="size-4 text-ink-3" /> Restore demo data
          </button>
          <button
            className={cn(row, 'hover:!bg-ember-soft hover:!text-ember')}
            onClick={() => {
              void (async () => {
                if (!(await confirmAction('Start with an empty workspace? Your current tasks will be removed. Export first if you want to keep them.', 'Start empty'))) return;
                await ws().clearAll();
                close();
                ui().navigate({ name: 'today' });
              })();
            }}
          >
            <Trash2 className="size-4" /> Start empty
          </button>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-4 text-ink-4">Stored on this device. Sync can be added without changing how anything works.</p>
      </Popover>
    </>
  );
}
