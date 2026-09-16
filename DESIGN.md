# Hence — design notes

> **Write first. Organize later. Act fast.**

Hence is a task manager built around a single sentence: the one you type.
This document records the design thinking behind V1 — the concept, the
interaction model, the information architecture, the visual system, and a
critical review.

---

## 1. Product analysis

Existing task managers fail in two opposite ways:

| Failure | Symptom | Cost |
|---|---|---|
| **Capture friction** | A modal with project, date, priority, labels, assignee | Thoughts are lost, or the tool is bypassed for a notepad |
| **Organisation gravity** | Projects, boards, columns, custom fields everywhere | Users spend time maintaining the system instead of acting |

The best capture tool is a blank line. The best execution tool answers
*"what now?"*. Hence places the blank line at the center and makes every other
feature an **action applied to a sentence that already exists**.

The core loop is **Thought → Task → Action → Done**, and each step gets one
primary gesture:

| Step | Gesture |
|---|---|
| Thought → Task | Type, press Enter. The composer understands dates, times, priority, `#project`, `@person`, recurrence and durations, and shows what it understood as dismissible chips. |
| Task → Action | Hover a task: the actions appear *right after the sentence* (Today · Tomorrow · Schedule · Important · More). Keyboard: `D`, `I`, `M`, `R`, `A`, or `⌘K` and type a verb. |
| Action → Done | Click the circle or press `⌘↵`. Recurring tasks roll forward. Undo is always one toast away. |

## 2. Interaction model

**Principles**

1. **Nothing is required except words.** The title is the only field.
2. **Understanding is visible and reversible.** Detected attributes appear as
   quiet chips under the composer. `×` keeps the words in the title instead.
3. **Context supplies defaults.** Typing in *Today* schedules for today; in a
   project, files into that project. The default appears as a chip you can
   remove.
4. **Actions live next to the thing they change.** Hover actions sit right after
   the task title; there's no toolbar at the top of the page.
5. **One menu, everywhere.** The universal action menu (`…` on a row, `.` on
   the keyboard, `⌘K` with a task selected) is the same searchable list. Typing
   `tomorrow`, `move ips` or `assign claire` works in all of them.
6. **Time before structure.** Navigation is Today / Upcoming / Later first;
   projects are secondary.
7. **Drag is a shortcut, not a requirement.** Drag reorders; drag onto the
   sidebar reschedules or refiles. While you drag, the sidebar shows
   extra time targets (*Tomorrow*, *Next week*, *Later*).
8. **Undo over confirmation.** Destructive actions run immediately and offer
   Undo (toast and `⌘Z`). No "are you sure?" dialogs, except when deleting a
   whole project.

**Beyond the brief, kept only where they cut steps**

- **Hover actions after the title.** The actions appear right after the words
  you typed, so they read as actions on that sentence. The buttons change with
  context: a task due today offers *Tomorrow* and *Next week* instead of
  *Today*.
- **Triage** for the Inbox: a full-screen view that shows one task at a time
  and sorts it with one key (Today, Tomorrow, Next week, Later, a project, or
  delete). An inbox of 20 items takes about a minute.
- **Carry-over** on Today: overdue tasks aren't treated as failures. A calm
  line ("3 tasks carried over") offers *Move to today* or *Review*.
- **Focus mode**: one task, its notes and subtasks, a timer, and a single
  *Done* button. The next task is one key away.
- **Paste a list, get tasks.** Pasting several lines into the composer
  creates one task per line, each one parsed.
- **Multi-select** (`Space`, `Shift+↑↓`): every action applies to the
  selection.

## 3. Information architecture

```
Hence
├── Home             greeting · microphone · the next three tasks · "More" unfolds the rest of today,
│                    what's coming, overdue, done today and Focus
├── Upcoming         next 7 days, day by day (empty days stay visible as drop targets) · then by week/month
├── Inbox            captured, not yet organized (no date, no project, not deferred) → Triage
├── Important        marked important, any date or project
├── Later            deliberately deferred, or filed in a project with no date
├── Projects         lightweight: name, optional description, icon, accent
└── Views (collapsed by default)
    ├── Assigned to me · Delegated · Overdue · No due date · Important this week · Completed recently
    └── Saved searches
```

Each task is in exactly one time bucket: *scheduled* (Today/Upcoming),
*Inbox*, or *Later*. Projects and importance are independent of time.

**Task anatomy**

```
[margin mark] ( ) Title ··· [hover actions]            2/4 ▤ ↻ (NM) ■ IPS  Fri 14:00
```

Metadata is shown only when it adds something. In Today the date is implied,
so only the time or an overdue label appears. Inside a project, the project
name is hidden.

**Data model**: see `src/domain/types.ts`. Tasks, projects, people, and saved
views are stored as independent rows keyed by id. Every entity carries
`workspaceId`, `createdAt` and `updatedAt`, which leaves room for
multi-user sync. The UI talks to a `WorkspaceRepository` interface (see
`src/data/repository.ts`). The store computes row-level diffs and pushes only
the changed entities, which maps directly onto a Postgres/Supabase table
upsert.

## 4. Visual system

**Identity: paper on a desk.** The app background is a warm *desk* tone. Content
sits on a slightly lighter *sheet* with a hairline edge. The sidebar is part of
the desk, not a dark slab. Importance is shown as a small ember mark in the
page margin, the way you would annotate paper, instead of a red badge.

**color** (all warm neutrals, one accent, one signal)

| Token | Value | Use |
|---|---|---|
| `desk` | `#F1EFE9` | App background, sidebar |
| `paper` | `#FAF9F6` | Main sheet |
| `raised` | `#FEFDFB` | Popovers, panel, palette |
| `sunk` | `#EAE7DF` | Hover fills on desk |
| `line` / `line-strong` | `#E7E3DA` / `#D9D4C9` | Hairlines |
| `ink` → `ink-4` | `#1D1C1A` `#4A4741` `#86817A` `#B4AFA5` | Text hierarchy |
| `accent` | `#1E676C` (petrol) | Focus, selection, primary action, check |
| `accent-soft` | `#E2EDEB` | Selection wash |
| `ember` | `#BF5530` | Important mark, overdue date (text only) |

Project accents are deliberately desaturated: petrol, indigo, ember, olive,
plum, ochre, slate, rose.

**Typography**: *Geist* for the interface; *Instrument Serif* only for view
titles, the greeting and empty states. The serif gives Hence its voice.

| Role | Size / line | Weight |
|---|---|---|
| Label (caps) | 11px / 16, +0.07em | 600 |
| Meta | 12.5px / 18 | 450 |
| UI | 13.5px / 20 | 450–500 |
| Task title | 14.5px / 22 | 450 |
| Composer | 16px / 24 | 450 |
| Panel title | 21px / 28, −0.015em | 600 |
| View title (serif) | 32px / 36 | 400 |

**Spacing**: 4px base (4, 8, 12, 16, 20, 24, 32, 40, 56). Rows are 40px on
desktop and 48px on touch. The reading column is at most 760px wide.

**Radius**: 6px for controls, 8px for rows, 12px for popovers, 14px for the sheet
and panel.

**Shadow**: hairline ring plus a soft ambient shadow. Only floating layers get
depth (popover, palette, panel, drag overlay).

**Motion**: 120ms for hover and color, 160–200ms for entry, 220ms for panels,
with ease `cubic-bezier(.2,.8,.2,1)`. The only motion without a function is
none. `prefers-reduced-motion` turns it all off.

**States**: *hover* is an ink wash at 3.5%. The *keyboard cursor* is an
accent-soft wash with an accent hairline at the left. *Selected* is a stronger
accent-soft wash. *Open in panel* is a sunk wash. The *focus ring* is 2px of
accent at 45%, with a 2px offset.

## 5. Critical review

The first build was driven end to end in a real browser, using the
walkthrough from the brief (create → schedule → important → notes → subtasks
→ move → search → edit → complete), plus drag and drop, triage, focus,
reminders, multi-select, paste, reload, and phone and tablet widths. Each
screen was reviewed as a screenshot. These are the findings and what changed.

**Friction found and fixed**

| Found | Why it mattered | Change |
|---|---|---|
| Every popover rendered in the top-left corner | The entry animation and Floating UI both used `transform`, so the animation won and the popover landed at 0,0 | Floating UI positions with `top/left`; the animation keeps `transform` |
| The date picker opened *above* tasks low on the screen and covered them | A tall single column (list, calendar, time) couldn't fit below | Two columns in the popover: list beside the calendar |
| Pressing `N` once meant every later view grabbed focus into its composer | Keyboard shortcuts silently typed into the composer | The composer only reacts to focus requests made while it is mounted |
| `Enter` on a focused row opened the panel, then closed it again | The row and the global handler both toggled it | One owner for `Enter`: the keyboard layer |
| Long titles truncated even at rest | The hidden hover actions still took up width | The actions leave the layout until hover or focus |
| With the panel open, titles lost to metadata | Metadata had priority over the words | Container queries on each row: names collapse to avatars and glyphs, then icons go, before the title truncates |
| The importance margin mark was invisible on desktop | It was clipped by the completion-collapse wrapper | The wrapper gets gutter room |
| "Two tasks carried over from sun." | It read like a bug | "…since Sunday" / "from yesterday"; the banner stacks on phones |
| Typing `tomorrow` in the palette offered two identical actions | A choice with no difference is noise | The parsed suggestion replaces the preset |
| `tomorrow` matched "cus**tom**er advis**o**ry…" | Fuzzy subsequence matching surfaced junk | Word and substring matching only |
| Pickers summoned the phone keyboard for simple taps | A keyboard covering a three-item list | On touch, pickers don't autofocus; the palette still does |
| `Ctrl+Enter` in the composer completed the highlighted task | A capture keystroke with a side effect | It only completes from the list or from inside the task panel |
| Deleting a project asked "are you sure?" | This contradicted *undo over confirmation* | It deletes with an Undo that restores the tasks' project too |

**Deliberately not shipped in V1**

- *Files*: storing files means real storage. A section that can't keep files
  would be a placeholder, so V1 has links only.
- *Dependencies*: present in the data model (`dependencyIds`) with no UI yet.
  They didn't pass the "reduce friction" test for a first version.

**The questions from the brief**

- **Is this simpler than existing task managers?** The first screen has a
  greeting, one input and one list. No toolbar, no view switcher, no filter bar.
- **Can I capture in seconds?** `N`, type, Enter. On a phone it's the **+**, type,
  Enter.
- **Is there unnecessary information?** Dates are hidden where the view implies
  them. *Normal* priority is never shown. Only Today and Inbox show counts.
- **Premium and original?** The desk/paper layering, the serif voice, the
  margin mark, and actions that sit after the sentence give it an identity that
  isn't borrowed.
- **Could an executive use it without onboarding?** The only instruction is the
  placeholder. Everything else is found through hovering, tooltips with
  shortcuts, and the `?` guide.

## 6. Second pass: voice, and a quieter home

Two changes after the first build was used.

**Speaking is now the primary way in.** A microphone sits in the middle of the
home screen. You talk; the memo is turned into clear tasks (by Claude when a
key is configured, on-device otherwise); you confirm a card that shows exactly
what will be created and where it will land. Speech is the shortest path from
thought to task — shorter than typing — and it suits the moments tasks actually
arrive: walking out of a meeting, in a car, between calls. Analysis returns
*drafts*, never silent writes: the user still confirms, edits or drops each one.

**The home screen was too rich.** It carried a greeting, a summary sentence,
the next timed task, a carry-over banner, a composer, the full day, a "Next"
section and a completed section — a dashboard by accident. It now holds the
date, the microphone, and the **next three tasks**. Everything else moved
behind **More**, which unfolds in place rather than navigating away. Metadata
on those three rows is quieter too: no counters, no icons — the words, the
project, the time.

The principle this pass enforced: *the home screen answers one question — what
now? — and offers one gesture: say the next thing.* Depth is still one click
away, but it is no longer the default state.
