# Hence

**Write first. Organize later. Act fast.**

Hence is a task manager built around the sentence you type. Type
*"Prepare Q4 presentation for Nicolas"*, press Enter, and the task exists. You
never fill in a form. Everything else (dates, priority, projects, people,
subtasks, notes, reminders, repeats) is an action you apply to that sentence
later, only if you want to.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parser, recurrence, search
npm run build      # typecheck + production build
```

On first launch the app loads a realistic demo workspace (an executive's week
across IPS, Rainbow, People and Personal). To start fresh, open
**Settings → Start empty**. To bring the demo back, use
**Settings → Restore demo data**.

---

## Using it

### Speak a task
The round microphone button sits in the middle of the home screen. On other
views it follows you as a small button at the bottom of the page (on phones, in
the center of the bottom bar). `V` opens it from anywhere.

1. **Tap and talk:** *"Call Thierry tomorrow about the partner terms, it's
   urgent, and ask Claire to send the deck by Friday."* Recording stops after a
   short pause, or when you tap **Done** (`Space`). You can also press and hold
   the button like a walkie-talkie and release to finish.
2. **Hence analyzes the memo** and proposes clear tasks: an imperative title,
   the date and time, priority, project, the person you delegated to, steps and
   notes. If you listed several things, you get several tasks.

   A rambling memo comes back short. The title is the action; the notes are a
   two-sentence summary of what's worth keeping (the reason, the decision, the
   numbers) — not a transcript. Thinking out loud ends as the conclusion you
   reached. Your open tasks, projects and people are sent as context, so the
   analysis uses your wording, fixes names the recognizer garbled, and
   recognizes when a memo is about work already on your list — then it offers
   **Add as a step there** instead of creating a near-duplicate.
3. **Check and confirm.** Edit a title, remove a detected detail with ×, add a
   step, then press **Add task** (`Enter`). Each card shows where the task will
   land (Today, Friday, IPS, Inbox…). What you said is kept in the task's
   activity log.

**EN / FR** switches the recognition language, and the choice is remembered.
**Type instead** accepts a written or pasted memo and analyzes it the same way.
Voice needs Chrome, Edge or Safari. Firefox can use *Type instead*.

**Connecting Claude (recommended).** The analysis uses Claude
(`claude-opus-5`) through the app's own server route, so your API key never
reaches the browser. Copy `.env.example` to `.env.local`, set
`ANTHROPIC_API_KEY`, and restart `npm run dev`. Without a key, Hence falls back
to on-device analysis, which handles English framing, dates, times, urgency and
project names — but it doesn't summarize, doesn't read French, doesn't know
delegation, and can't relate a memo to your existing tasks. The review card shows which one was
used (*Claude* / *On-device*).

> The route runs inside the Vite dev/preview server (`server/voice.ts`). To
> deploy, expose the same `analyzeTranscript` function as a serverless
> function on your host. Don't start the dev server with `--host` on a network
> you don't trust while a key is set: anyone who can reach it can spend your
> credits.

### Capture
- Type in **"What needs to be done?"** and press **Enter**. Press **Shift+Enter** to
  add the task and open it straight away.
- The composer understands natural language and shows what it detected as
  chips. Click **×** on a chip to keep those words in the title instead.

  | You type | You get |
  |---|---|
  | `Call Thierry tomorrow 3pm` | Due tomorrow, 15:00 |
  | `Board deck friday high priority #ips` | Friday · Important · IPS |
  | `1:1 with Claire every thursday` | Repeats weekly, first on Thursday |
  | `Review contract @anand 45 min` | Assigned to Anand · 45 min estimate |
  | `Point équipe 9h30` | 09:30 today |

- The current view supplies a default, shown as a removable chip: Today schedules
  for today, a project files the task there, Later defers it.
- Paste a list and you get one task per line, each one parsed.

### Act
- **Hover a task.** Actions appear right after its title: *Today / Tomorrow*
  (they adapt to the task's current date), *Schedule*, *Important* and *More*.
- **Click the circle** to complete a task. **Click the title** to rename it inline.
  Inline edits are parsed too, so adding "friday" reschedules. **Click the row**
  to open the side panel. **Right-click** opens the action menu.
- **The action menu** (`.` or `…`) is searchable and understands phrases:
  `fri 3pm`, `move rainbow`, `assign claire`, `remind in 20 min`,
  `every monday`.
- **Drag** to reorder. Drag onto the sidebar to reschedule or refile. While you
  drag, *Tomorrow* and *Next week* appear as extra drop targets. In Upcoming,
  drag a task onto another day to move it.
- **Undo** is always available from the toast or with `Ctrl/⌘+Z`. Nothing asks
  "are you sure?".

### Home
The home screen holds three things: the date and a greeting, the microphone in
the middle, and the **next three tasks**. Nothing else.

- The three rows are today's tasks in order; if today is light, the next days
  fill the gaps.
- **More** unfolds the rest in place — the remainder of today, what's coming
  this week, overdue work with *Move to today*, what you finished today, and
  **Focus**. **Show less** folds it back.
- **or type** (or `N`) opens the writing field under the microphone.

Everything else — Upcoming, Inbox, Important, Later, projects, search — stays
in the sidebar, one click away.

### Views
**Upcoming** shows the next seven days, then later tasks by month. **Inbox**
holds captured tasks that haven't been organized, plus **Triage** to sort them
one at a time with single keys. **Important** and **Later** do what they say.
**Projects** are lightweight. **Views** (collapsed in the sidebar) contain smart
filters and your saved searches.

### Focus and triage
- **Focus** (`F`, or the button in Today) shows one task with its notes, steps,
  a timer and *Done*. `→` jumps to the next task.
- **Triage** (Inbox) sorts tasks with `1` Today, `2` Tomorrow, `3` Next week,
  `4` Later, `D` date, `P` project, `I` important, `⌫` delete.

### Command palette: `Ctrl/⌘+K`
Search tasks, jump to views and projects, and run commands. With a task
selected, type a verb (`tomorrow`, `assign`, `move ips`). You can also type:
- `new Call Nicolas fri 3pm` to create a task
- `overdue`, `completed last week`, `#ips @claire` to filter
- `Tab` on a result to act on it, or `Ctrl/⌘+Enter` to complete it

### Keyboard
`V` speak a task · `N` new · `/` search · `1–5` views · `J/K` or `↑/↓` move · `Enter` open ·
`E` edit · `T` today · `D` schedule · `L` later · `I` important · `P` priority ·
`R` remind · `M` move · `A` assign · `.` all actions · `F` focus ·
`Space` select · `Shift+↑/↓` extend selection · `Alt+↑/↓` reorder ·
`Ctrl/⌘+Enter` complete · `⌫` delete · `[` sidebar · `?` all shortcuts.

### Mobile
Phones get a bottom bar with the microphone in the center. Task details and pickers open as bottom sheets. Swipe a row
right to complete it, or left for its actions. Long-press to drag.

---

## Architecture

```
server/          voice.ts — POST /api/voice: transcript → Claude (structured output) → task drafts
src/
  lib/voice/     speech recognition · analysis client + on-device fallback · draft → task creation
  components/voice/  VoiceButton, VoiceCapture (listen → analyze → review), VoiceReview
  domain/        types (Task, Project, Person, User, SavedView), factories, recurrence
  data/          WorkspaceRepository interface · LocalRepository · demo workspace
  store/         workspace (entities + actions + undo) · ui (routing, selection, overlays) · selectors
  actions/       task operations shared by every surface · action registry · NL transformations
  lib/           nlp (parser) · search (query language) · dates · platform helpers
  components/
    shell/       AppShell, Sidebar, MobileNavigation, SettingsMenu
    tasks/       TaskComposer, TaskList, TaskRow, TaskCheckbox, TaskMetadata, QuickActions, SelectionBar
    detail/      TaskDetailPanel, PropertyBar, SubtaskList, LinkList
    pickers/     DatePicker, PrioritySelector, ProjectSelector, AssigneeSelector, ReminderPicker, …
    actions/     ActionMenu        palette/  CommandPalette
    focus/       FocusMode         triage/   TriageMode
    ui/          Popover, Modal, Tooltip, Toaster, EmptyState, Kbd, Avatar, ProjectGlyph
  views/         Today, Upcoming, Inbox / Important / Later, Project, Search / saved views
```

**Persistence can be swapped.** The UI never touches storage. The store keeps
entities as `Record<id, row>`. After every change, it computes a row-level
`ChangeSet` (upserts and removals per table) and hands it to a
`WorkspaceRepository` (`src/data/repository.ts`). The default `LocalRepository`
writes to `localStorage` and syncs across tabs. To use Postgres, Supabase,
Firebase or a REST API, implement `load / apply / replace`, where each method
maps to per-table upserts and deletes, and register it with
`configureRepository()`.

**Collaboration is planned for.** Every row carries `workspaceId`, `createdAt`
and `updatedAt`. Tasks carry `createdById` and `assigneeId`, and an activity
log with `actorId`. People are first-class entities. `repository.subscribe` is
the hook for real-time updates.

**Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, dnd-kit,
Floating UI (accessible popovers, dialogs and focus management), date-fns,
Lucide, Geist and Instrument Serif.

Design rationale and the visual system are in [DESIGN.md](DESIGN.md).
