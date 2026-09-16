import { Flag, Moon, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { Kbd } from '@/components/ui/Kbd';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskComposer } from '@/components/tasks/TaskComposer';
import { CompletedSection, TaskList } from '@/components/tasks/TaskList';
import { isInbox, isLater, useImportantData, useInboxData, useLaterData } from '@/store/selectors';
import { ui } from '@/store/ui';
import { HeaderButton, useRegisterVisible, ViewHeader } from './ViewHeader';

export function InboxView() {
  const { open, completed } = useInboxData();
  useRegisterVisible(useMemo(() => open.map((t) => t.id), [open]));
  return (
    <div>
      <ViewHeader
        title="Inbox"
        subtitle="Captured, not yet organized."
        actions={
          open.length > 1 && (
            <HeaderButton onClick={() => ui().setTriage(true)} title="Sort each task with one key">
              <Shuffle className="size-4" />
              Triage {open.length}
            </HeaderButton>
          )
        }
      />
      <TaskComposer isVisibleHere={isInbox} />
      <div className="mt-6">
        <TaskList
          listId="inbox"
          tasks={open}
          empty={
            <EmptyState title="Nothing waiting for you.">
              Anything you write without a date or project lands here, until you decide what it is.
            </EmptyState>
          }
        />
      </div>
      <CompletedSection listId="inbox-done" tasks={completed} label="Completed this week" />
    </div>
  );
}

export function ImportantView() {
  const { open, completed } = useImportantData();
  useRegisterVisible(useMemo(() => open.map((t) => t.id), [open]));
  return (
    <div>
      <ViewHeader title="Important" subtitle="What matters most, whatever the date or project." />
      <TaskComposer
        defaults={{ fields: { priority: 'important' }, chip: { id: 'ctx-imp', icon: <Flag className="size-3.5 text-ember" />, label: 'Important' } }}
        isVisibleHere={(t) => t.priority === 'important'}
      />
      <div className="mt-6">
        <TaskList
          listId="important"
          tasks={open}
          sortable={false}
          empty={
            <EmptyState title="Nothing marked important.">
              Press <Kbd combo="i" /> on any task, or end a sentence with “important”.
            </EmptyState>
          }
        />
      </div>
      <CompletedSection listId="important-done" tasks={completed} label="Completed this week" />
    </div>
  );
}

export function LaterView() {
  const { open } = useLaterData();
  useRegisterVisible(useMemo(() => open.map((t) => t.id), [open]));
  return (
    <div>
      <ViewHeader title="Later" subtitle="No date, no pressure. Pull things forward when their time comes." />
      <TaskComposer
        defaults={{ fields: { deferred: true }, chip: { id: 'ctx-later', icon: <Moon className="size-3.5" />, label: 'Later' } }}
        isVisibleHere={isLater}
      />
      <div className="mt-6">
        <TaskList
          listId="later"
          tasks={open}
          empty={
            <EmptyState title="Nothing set aside for later.">
              Press <Kbd combo="l" /> on a task to take the date off without losing it.
            </EmptyState>
          }
        />
      </div>
    </div>
  );
}
