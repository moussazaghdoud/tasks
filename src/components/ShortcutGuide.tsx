import { useUi } from '@/store/ui';
import { Modal } from '@/components/ui/Modal';
import { Kbd } from '@/components/ui/Kbd';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Anywhere',
    items: [
      ['v', 'Speak a task'],
      ['n', 'New task'],
      ['mod+k', 'Command palette'],
      ['/', 'Search'],
      ['1', 'Today'],
      ['2', 'Upcoming'],
      ['3', 'Inbox'],
      ['4', 'Important'],
      ['5', 'Later'],
      ['[', 'Toggle sidebar'],
      ['mod+z', 'Undo'],
      ['?', 'This guide'],
    ],
  },
  {
    title: 'On a task',
    items: [
      ['up', 'Previous task (or K)'],
      ['down', 'Next task (or J)'],
      ['enter', 'Open details'],
      ['e', 'Edit title'],
      ['mod+enter', 'Complete'],
      ['t', 'Do today'],
      ['d', 'Schedule…'],
      ['l', 'Later'],
      ['i', 'Toggle important'],
      ['p', 'Priority…'],
      ['r', 'Remind me…'],
      ['m', 'Move to project…'],
      ['a', 'Assign…'],
      ['.', 'All actions'],
      ['f', 'Focus mode'],
      ['space', 'Select (multi)'],
      ['alt+up', 'Move up'],
      ['backspace', 'Delete'],
      ['esc', 'Close / clear'],
    ],
  },
];

const WRITING: Array<[string, string]> = [
  ['tomorrow, fri, sep 30, next week, in 3 days', 'Date'],
  ['3pm, 14:00, 9h30', 'Time'],
  ['important, high priority, !!', 'Priority'],
  ['#project', 'Project'],
  ['@name', 'Assignee'],
  ['every monday, daily, weekly', 'Repeat'],
  ['30 min, 2h', 'Estimate'],
];

export function ShortcutGuide() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcuts);
  return (
    <Modal open={open} onClose={() => setOpen(false)} label="Keyboard shortcuts" className="max-h-[86vh] max-w-[760px] overflow-y-auto">
      <div className="p-6 max-sm:p-5">
        <h2 className="font-serif text-[28px] leading-8">Shortcuts</h2>
        <p className="mt-1 text-ui text-ink-3">Everything works with the mouse too. The keyboard is just faster.</p>
        <div className="mt-6 grid gap-8 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="label-caps mb-2">{g.title}</h3>
              <ul>
                {g.items.map(([k, label]) => (
                  <li key={k + label} className="flex h-8 items-center justify-between border-b border-line/70 text-ui text-ink-2 last:border-0">
                    {label}
                    <Kbd combo={k} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="mt-8">
          <h3 className="label-caps mb-2">While writing a task</h3>
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {WRITING.map(([ex, label]) => (
              <li key={label} className="flex min-h-8 items-center justify-between gap-4 border-b border-line/70 text-ui">
                <span className="text-ink-3">{ex}</span>
                <span className="shrink-0 text-ink-2">{label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
