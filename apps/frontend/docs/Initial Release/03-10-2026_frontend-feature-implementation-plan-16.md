# Cadence Frontend Feature Implementation Plan 16

## Purpose

This document turns the March 10, 2026 feature brief into an implementation-ready plan for `apps/frontend`.

The goal is to add five missing product behaviors without changing the core Cadence structure:

1. universal search
2. quick add
3. manual sync
4. a stronger Holding-side calendar panel
5. proper notifications across the in-app center and the browser

This is a refinement and systems plan, not a request to redesign Cadence into a different product.

---

## Core Constraints

The implementation must obey all of the following:

- `docs/Design Manifesto.md` remains the visual and behavioral north star.
- `apps/frontend/app/app.css` remains the source of truth for tokens, motion, focus states, and shared utilities.
- The existing route structure stays intact.
- The UI must remain neurodivergent-friendly:
  - low-friction
  - low-surprise
  - readable
  - forgiving
  - low-noise
  - keyboard-safe
  - reduced-motion-safe
- New UI should feel like a natural extension of Twilight Sanctuary, not a generic SaaS control layer.
- Route files should stay thin. Shared logic belongs in hooks, lib helpers, stores, or shared components.

---

## Current State Snapshot

### Confirmed current implementation

- `apps/frontend/app/components/sidebar/IconRail.tsx`
  - contains placeholder local dialog state for search and quick add
  - contains a placeholder notifications popover
  - already uses `hardRefreshWorkspaceCaches` for debug data actions, which is relevant to manual sync
- `apps/frontend/app/components/CommandPalette.tsx`
  - already provides a limited global command surface
  - searches only a small subset of tasks
  - does not know about habits, inbox captures, projects, route focus, or result highlighting
- `apps/frontend/app/routes/inbox.tsx`
  - already uses the right side panel for a compact calendar when no task is selected
- `apps/frontend/app/routes/home.tsx`
  - currently shows the same calendar panel in Today
- `apps/frontend/app/routes/upcoming.tsx`
  - currently shows the same calendar panel in Upcoming
- `apps/frontend/app/components/settings/tabs/NotificationsTab.tsx`
  - only exposes `email`
  - browser notifications are visibly marked as not implemented
- `apps/frontend/app/lib/types/settings.ts`
  - only models `notifications.email`
- repo-wide scan confirms:
  - there is no browser notification implementation in frontend
  - there is no service worker or push subscription flow
  - backend settings schema currently only supports `notifications.email`

### Design implication

Cadence already has the correct shell primitives:

- `MainLayout`
- `Sidebar`
- `IconRail`
- `ResizableSidePanel`
- `ResponsiveOverlayPanel`
- global `Toaster`

The missing work is not infrastructure from zero. It is product-level refinement and cross-surface wiring.

---

## Outcome Definition

After implementation, Cadence should behave like this:

- Search works from anywhere, searches the whole workspace, and navigates to the correct surface with a clear visual reveal.
- Quick Add lets the user create a task, thought dump, or habit in one calm interaction.
- Manual sync exists as a trusted refresh action with clear motion and feedback.
- The right-side calendar only persists in Holding, and it becomes useful enough to justify the space.
- Notifications become a real system instead of placeholders:
  - an in-app notification center
  - browser notifications
  - reminder-aware behavior
  - settings that actually control the behavior

---

## Primary References

- `docs/Design Manifesto.md`
- `apps/frontend/AGENTS.md`
- `apps/frontend/app/app.css`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/CommandPalette.tsx`
- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/components/calendar/CalendarView.tsx`
- `apps/frontend/app/components/settings/tabs/NotificationsTab.tsx`
- `apps/frontend/app/lib/types/settings.ts`
- `apps/frontend/app/hooks/use-settings.ts`
- `apps/frontend/app/lib/api/workspace-cache.ts`
- `apps/frontend/app/hooks/tasks/use-tasks.ts`
- `apps/frontend/app/hooks/inbox/use-inbox.ts`
- `apps/frontend/app/hooks/habits/use-habits.ts`
- `apps/backend/src/types/settings.ts`
- `apps/backend/src/db/schema.ts`

---

## Shared Product Rules

These rules apply to every workstream in this document.

### 1. One mental model per feature

- Search is for finding and jumping.
- Quick Add is for creating without sorting.
- Sync is for trust and confirmation.
- The Holding panel is for planning captured work into time.
- Notifications are for surfacing what needs attention without shouting.

No surface should try to do two jobs at once.

### 2. Deterministic over “magic”

The brief asks for search intelligence. That should mean:

- forgiving matching
- good ranking
- useful labels
- route awareness
- context snippets

It should not mean opaque AI behavior.

### 3. Reduced-motion is not optional

Any pulse, shimmer, spin, or reveal must degrade to a static glow or outline when `prefers-reduced-motion` is enabled.

### 4. No harsh styling in component code

Any new color, blur, glow, or animation constant that matters across multiple surfaces belongs in `app/app.css`.

### 5. Preserve route thinness

Routes should orchestrate:

- what panel shows
- which dialog opens
- which item is selected
- which layout variant renders

Routes should not own fuzzy matching, focus pulse logic, notification scheduling, or sync orchestration.

---

## Shared Architecture Decisions

### 1. Lift search and quick add into the shell

### Current problem

- `MainLayout` owns `CommandPalette` state.
- `IconRail` owns placeholder search and quick add dialog state locally.
- On `laptop`, `tablet`, and `phone`, `IconRail` is not rendered at all.

### Required decision

Search and Quick Add must become shell-level surfaces, not rail-local placeholders.

### Plan

- `MainLayout` becomes the owner of:
  - `searchOpen`
  - `quickAddOpen`
- `Sidebar` receives callbacks from `MainLayout`
- `IconRail` triggers those callbacks in `wide` mode
- `SidebarPanel` gets a compact utility row for `laptop`, `tablet`, and `phone` parity
- keyboard shortcuts open the same shell-level surfaces

### Why this is the correct structure

- avoids duplicate dialog systems
- makes `Cmd/Ctrl+K` and the Search button open the same UI
- preserves responsiveness across shell modes
- keeps the utility layer centralized

### 2. Introduce one route-focus protocol for search, quick add, and notifications

### Current problem

Search currently cannot:

- deep-link to a task
- open the right route
- select the right item
- scroll to the right section
- visually reveal anything after navigation

### Required decision

Cadence needs one generic focus-and-reveal contract that works everywhere.

### Plan

Use URL search params as a shareable, route-safe focus contract:

- `focusKind`
  - `task`
  - `habit`
  - `inbox`
  - `section`
- `focusId`
  - concrete item id
- `focusScope`
  - route-local bucket or section slug
  - examples:
    - `holding-unmanaged`
    - `holding-captures`
    - `today-overdue`
    - `today`
    - `upcoming-tomorrow`
    - `upcoming-next-week`
    - `completed`
    - `trash`
- `focusDate`
  - optional
  - useful for habits and the Holding planner panel
- `focusSource`
  - `search`
  - `quick-add`
  - `notification`

### New shared behavior

Create a route-level focus helper, likely `app/hooks/use-route-focus.ts`, that:

- reads the focus params
- waits for the relevant list data to exist
- scrolls the target into view
- opens item detail when applicable
- applies a soft reveal state
- clears focus params after the reveal has completed

### DOM contract

Target surfaces should expose stable data attributes:

- `data-focus-kind`
- `data-focus-id`
- `data-focus-scope`

These should be added to:

- `TaskCard`
- `InboxItemCard`
- habit rows or tiles
- section headers in Today, Upcoming, and Holding

### Motion behavior

The reveal must be:

- short
- warm
- soft
- readable

Proposed styling:

- 2 low-amplitude glow cycles
- no bouncing
- no scale jumps
- no layout shift

Reduced motion fallback:

- no pulse
- static lantern/mood-lit ring for 2 seconds

### 3. Split “companion panel” from “detail panel”

### Current problem

Today, Upcoming, and Holding all treat the right panel as:

- calendar when nothing is selected
- task detail when something is selected

This is too broad for Today and Upcoming, and too weak for Holding.

### Required decision

- Today and Upcoming should only use the right panel for task detail.
- Holding should keep a companion panel when nothing is selected.

### Result

- Today becomes more focused.
- Upcoming becomes more focused.
- Holding becomes the only route with a planning companion surface.

### 4. Treat manual sync as “refetch and reassure,” not a fake backend sync system

### Current problem

No dedicated workspace sync endpoint exists.

### Required decision

The first implementation of Sync should mean:

- invalidate/refetch active workspace queries
- ensure the frontend reflects current backend state
- expose the action clearly to the user

This is enough to satisfy the requested behavior without inventing a misleading data contract.

### Important wording

The UI should say “Sync” to the user, but the implementation should remain honest:

- this is a manual refresh/reconcile of frontend cache vs backend state
- not offline conflict resolution
- not multi-device merge logic

### 5. Notifications must be implemented in two layers

### Layer A

In-app notification center:

- fully frontend-owned
- visible in IconRail utility cluster
- tied to reminders, due states, sync confirmations, and system feedback

### Layer B

Actual browser notifications:

- requires browser permission
- requires local reminder scheduling while the app is open
- requires service worker plus backend subscription flow for true push when the app is closed

### Important constraint

Do not mark browser push complete if only foreground `new Notification(...)` is implemented.

Foreground browser notifications are useful, but they are not the same as web push.

---

## Shared Token and Styling Plan

All of the following should be added to `apps/frontend/app/app.css` rather than hardcoded in components.

### New token families

- focus/reveal
  - `--color-focus-aura`
  - `--color-focus-aura-soft`
  - `--duration-focus-pulse`
- sync
  - `--color-sync-active`
  - `--color-sync-idle`
  - `--duration-sync-spin`
- notifications
  - `--color-notification-unread`
  - `--color-notification-reminder`
  - `--color-notification-system`
- holding companion panel
  - `--holding-panel-default-width`
  - `--holding-panel-max-width`

### New shared utilities

- `.surface-utility`
  - for shared frosted utility surfaces such as search shell, quick add shell, notification center chrome
- `.focus-pulse-soft`
  - route reveal animation utility
- `.focus-ring-static`
  - reduced-motion fallback
- `.sync-spin`
  - single-cycle or continuous pending-state rotation utility
- `.notification-dot`
  - unread status chip
- `.utility-divider`
  - subtle separators for shell utility rows

### Visual rules

- no saturated alarms unless the situation is genuinely destructive
- search, quick add, sync, and notifications should all read as the same product family
- utility surfaces should feel lighter than task cards and heavier than plain tooltips

---

## Workstream 1: Universal Search

### Product Goal

Give the user one forgiving search surface that can find anything relevant in the workspace and route them to the exact place where the item belongs.

### UX Rules

- one input
- immediate results
- obvious route labels
- obvious item types
- no extra filters required for common use
- keyboard-first
- mouse-friendly
- reduced-motion-safe

### Search Entry Points

### Desktop / wide

- Search button in `IconRail`
- `Cmd/Ctrl + K`

### Laptop / tablet / phone

- Search action in a new utility row near the top of `SidebarPanel`
- `Cmd/Ctrl + K` remains active

### Search Surface

### Direction

Replace the limited `CommandPalette` behavior with a true universal search surface.

### Recommended implementation

Refactor `apps/frontend/app/components/CommandPalette.tsx` into a broader search layer rather than keeping two overlapping systems.

It may remain named `CommandPalette.tsx`, but functionally it becomes the universal search dialog.

### Layout

- top input row
- small secondary hint row
- grouped result sections
- no empty decorative content when results exist
- empty state should offer navigation shortcuts and quick add shortcuts

### Result groups

- Tasks
- Habits
- Captures
- Projects
- Pages

Result order should prioritize item results over static navigation when the user is typing a real query.

### Search Intelligence

### “Intelligence” in scope

Use deterministic scoring with route-aware ranking.

### Matching fields

#### Tasks

- title
- content
- project name
- tag names
- section name

#### Habits

- title
- description
- notes

#### Captures / thought dumps

- `InboxItem.rawText`

#### Projects

- name
- emoji text fallback if present

#### Static pages

- Holding
- Today
- Upcoming
- Schedule
- Habits
- Weekly Reset
- Completed
- Trash

### Ranking rules

Use a weighted scoring model. Example logic:

- exact title match: highest
- title prefix match: very high
- whole-word title match: high
- substring title match: medium
- supporting metadata match: medium-low
- route alias match: medium-low
- active items: boost
- soon-due items: boost
- completed or trashed items: penalty, but still searchable

### Alias map

Add a small alias dictionary so users can search the app in natural language:

- `holding` -> `/inbox`
- `capture` -> inbox items
- `thought` -> inbox items
- `today` -> Today route
- `upcoming` -> Upcoming route
- `habit` -> habits route and habit items
- `week` -> Weekly Reset
- `done` -> Completed
- `trash` -> Trash

### Performance strategy

- load heavyweight result data only when search is opened
- use `enabled: open` where possible
- use `useDeferredValue(query)` to keep typing fluid
- memoize normalized result models
- cap visible results per group
- keep ranking synchronous and local

### Route Resolution

### Problem

Some items can appear in more than one route.

Example:

- a task with no project may appear in Holding
- the same task may also appear in Today or Upcoming if it has a date

### Required rule

Every search result must resolve to a primary destination, with optional secondary context text.

### Primary destination rules

#### Tasks

- `COMPLETE` -> `/completed`
- `ARCHIVED` -> `/trash`
- project-backed active task -> `/project/:projectId`
- overdue or today active task -> `/`
- tomorrow or next-week active task -> `/upcoming`
- active task with no project and no effective date -> `/inbox`
- waiting task with no stronger route -> `/inbox`

#### Habits

- `/habits`

#### Captures

- `/inbox`

#### Static routes

- go directly to the route

### Secondary context text

Show one quiet context line under or beside the result:

- `Today / Overdue`
- `Upcoming / Tomorrow`
- `Holding / Needs processing`
- `Project / Design System`
- `Habits / Daily`

### Result Interaction

When the user selects a result:

1. close the search dialog
2. navigate to the resolved route
3. pass focus params
4. wait for route data
5. scroll to the right region
6. reveal the section and the target item
7. open detail panel if the item is detail-capable

### Reveal targets by type

#### Task result

- pulse the section header
- pulse the task row/card
- open the task detail panel on wide screens
- open the overlay panel on compact screens

#### Habit result

- navigate to `/habits`
- reveal the matching habit row
- if a date is involved, align the companion calendar or detail panel to that date

#### Capture result

- navigate to Holding
- reveal `Needs processing`
- pulse the matching capture item

### Proposed file changes

### Existing files to modify

- `apps/frontend/app/components/CommandPalette.tsx`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/components/tasks/TaskCard.tsx`
- `apps/frontend/app/components/inbox/InboxItemCard.tsx`
- habit list/item components that render the row target

### New frontend files recommended

- `apps/frontend/app/hooks/use-universal-search.ts`
- `apps/frontend/app/hooks/use-route-focus.ts`
- `apps/frontend/app/lib/search/search-model.ts`
- `apps/frontend/app/lib/search/search-ranking.ts`

### Acceptance criteria

- search can find active, waiting, completed, archived, habit, and inbox items
- search can find page destinations
- search ranking feels forgiving and stable
- clicking a result always lands on the correct route
- the correct section softly pulses
- the target item becomes visible without the user hunting for it
- the experience works from keyboard only

---

## Workstream 2: Quick Add

### Product Goal

Let the user create the three most common capture types with almost no setup:

- task
- thought dump
- habit

### UX Direction

Quick Add should be faster than opening a full editor and calmer than a large modal.

### Recommended surface

- `Popover` on desktop and wide shells
- bottom sheet style `Dialog` on compact shells

This keeps the interaction close to the plus trigger while still respecting mobile ergonomics.

### Entry Points

### Primary

- Plus button in `IconRail`

### Responsive parity

- same action in the `SidebarPanel` utility row for non-wide shells
- keyboard shortcut `N` should open Quick Add on the default Task tab

### Surface Structure

### Top row

- title: `Quick Add`
- short description: one sentence, not instructional overload

### Primary switcher

Use clearly labeled tabs or segmented buttons:

- `Task`
- `Thought Dump`
- `Habit`

### Why this is the correct choice

- instant recognizability
- low mental branching
- easy keyboard focus order
- easy mobile adaptation

### Task tab

### Minimum required fields

- title

### Optional low-noise affordances

- very small due-date shortcut row if desired
- avoid turning Quick Add into a mini task editor

### Create behavior

- create through `useCreateTask`
- no project
- state remains `ACTIVE`
- land in Holding after create
- reveal the new task with the shared focus protocol

### Route target after success

- `/inbox`
- focus scope: `holding-unmanaged`

### Thought Dump tab

### Minimum required fields

- single text area or tall single-line input for raw capture

### Create behavior

- create through `useCreateInboxItem`
- do not ask the user to classify it yet
- land in Holding after create
- reveal under `Needs processing`

### Route target after success

- `/inbox`
- focus scope: `holding-captures`

### Habit tab

### Minimum required fields

- title
- cadence

### Recommended reuse

Reuse the validation and cadence logic already established by:

- `apps/frontend/app/components/habits/CreateHabitDialog.tsx`
- `apps/frontend/app/lib/validations/habit-schemas.ts`
- `apps/frontend/app/components/habits/CadencePicker.tsx`

### Create behavior

- create through `useCreateHabit`
- use a compact subset of the full habit form
- after success, navigate to `/habits`
- reveal the newly created habit

### Important restraint

Do not force notes, descriptions, or advanced scheduling in Quick Add.

If the user needs more, the habit detail flow can handle it after creation.

### Interaction Details

### Success behavior

- close the surface after successful create
- navigate to destination
- reveal created item
- show a toast only if it adds clarity

### Toast guidance

Use short, reassuring copy:

- `Task added to Holding`
- `Thought saved to Holding`
- `Habit created`

Avoid verbose confirmations.

### Failure behavior

- keep the surface open
- keep user input intact
- show inline or toast error feedback

### Proposed file changes

### Existing files to modify

- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/hooks/use-keyboard-shortcuts.ts`

### New frontend files recommended

- `apps/frontend/app/components/quick-add/QuickAddSurface.tsx`
- `apps/frontend/app/components/quick-add/QuickAddTaskForm.tsx`
- `apps/frontend/app/components/quick-add/QuickAddCaptureForm.tsx`
- `apps/frontend/app/components/quick-add/QuickAddHabitForm.tsx`

### Acceptance criteria

- Quick Add opens from shell utility actions on every shell mode
- `N` opens Quick Add on the Task tab
- task create lands in Holding unmanaged tasks
- thought dump create lands in Holding captures
- habit create lands in Habits
- the newly created item is visibly revealed
- the form remains fast and low-friction

---

## Workstream 3: Manual Sync

### Product Goal

Give the user a visible, trustworthy way to force the frontend to reconcile with backend data.

### UX Direction

The sync action should feel:

- available
- lightweight
- reassuring
- non-destructive

It should not feel like a panic button.

### Icon Choice

Use a Lucide refresh-style sync glyph.

Recommended:

- `RefreshCw`

Reason:

- common sync metaphor
- visually clean at rail size
- already aligned with the product’s current icon vocabulary

### Placement

### Wide mode

- utility cluster in `IconRail`
- above notifications
- below quick add

### Non-wide parity

- same action in the new `SidebarPanel` utility row

### Behavior

### On click

1. set `isSyncing` true
2. trigger workspace refresh
3. animate the icon while pending
4. stop animation when settle occurs
5. show success or error toast

### Frontend implementation

Create a dedicated hook, likely `app/hooks/use-workspace-sync.ts`, that:

- calls `hardRefreshWorkspaceCaches(queryClient)`
- optionally refetches settings as well
- exposes:
  - `sync()`
  - `isSyncing`
  - `lastSyncedAt`

### Recommended copy

- loading: `Syncing workspace...`
- success: `Everything is up to date.`
- error: `Sync failed. Try again.`

### Motion behavior

The icon should rotate while the request is pending.

Interpretation of the brief:

- each cycle is a clean single turn
- animation stops as soon as sync completes
- no endless post-completion spin

Reduced motion fallback:

- no spin
- subtle opacity or outline change only

### Optional but recommended

Tooltip text should show:

- `Sync`
- `Last synced just now`
- or relative timestamp once implemented

### Proposed file changes

### Existing files to modify

- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/feedback/Toaster.tsx`

### New frontend files recommended

- `apps/frontend/app/hooks/use-workspace-sync.ts`

### Acceptance criteria

- sync is visible in wide mode on the IconRail
- sync is still reachable in non-wide modes
- icon animates while pending
- animation stops on settle
- success toast confirms completion
- error toast handles failure without ambiguity

---

## Workstream 4: Holding Planner Panel Refinement

### Product Goal

Make the right-side calendar panel earn its space in Holding, remove it from Today and Upcoming, and make it hideable.

### High-Level Decision

### Today

Remove the idle calendar panel.

When no task is selected:

- no right companion panel

When a task is selected:

- show task detail only

### Upcoming

Remove the idle calendar panel.

When no task is selected:

- no right companion panel

When a task is selected:

- show task detail only

### Holding

Keep the right panel, but upgrade it from a generic calendar to a Holding planning companion.

### Why this change is correct

Today and Upcoming are prioritization views. Their current idle calendar steals space without improving decision-making.

Holding is the one route where a companion scheduling surface actually matters because the user is trying to move unsorted work into time.

### Holding Panel Direction

Rename the concept internally from “calendar panel” to “Holding Planner Panel.”

It still contains a calendar, but the calendar is not the whole value.

### Holding Planner Panel Structure

### Top block: compact calendar

Keep the compact monthly grid from `CalendarView`, but make it the entry point rather than the whole panel.

### Middle block: selected-day runway

When a date is selected, show:

- date label
- tasks already scheduled on that day
- habits due that day
- workload signal in plain language

The point is not analytics. The point is deciding whether the selected day can absorb captured work.

### Bottom block: Holding actions

Show low-noise actions that relate Holding to the selected date:

- `Plan for selected day`
- `Tomorrow`
- `Next week`
- `Clear date`

The actual action behavior can evolve, but the panel must clearly connect captured work to time.

### Optional quiet context strip

Use a short context strip instead of dashboard cards:

- `Unmanaged tasks: X`
- `Captures waiting: Y`
- `Selected day load: Light / Moderate / Full`

This must not become a KPI dashboard.

### Hideable Behavior

### Requirement

The Holding planner panel must be hideable like the sidebar.

### Recommended implementation

Create a small persisted store, likely `app/stores/right-panel-store.ts`, with:

- `holdingPanelOpen`
- `holdingPanelWidth`
- toggle action
- width setter

### Behavior rules

- wide mode: user can fully hide the Holding planner panel
- if a task is selected while the planner panel is hidden, detail can still open
- once detail closes, hidden state is preserved
- compact screens still use `ResponsiveOverlayPanel`

### Route-level changes

### `apps/frontend/app/routes/inbox.tsx`

- replace bare `CalendarView` usage with a richer Holding-specific companion component
- keep task detail replacement behavior when a task is selected
- keep mobile overlay parity

### `apps/frontend/app/routes/home.tsx`

- remove idle calendar side panel
- keep detail panel behavior only when a task is selected
- remove idle “Calendar” button from mobile header actions

### `apps/frontend/app/routes/upcoming.tsx`

- remove idle calendar side panel
- keep detail panel behavior only when a task is selected

### Component recommendation

Create a dedicated Holding component rather than overloading generic `CalendarView` too heavily.

Recommended file:

- `apps/frontend/app/components/holding/HoldingPlannerPanel.tsx`

This component can compose:

- `CalendarView`
- selected-day summary
- Holding scheduling actions

### Proposed file changes

### Existing files to modify

- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx`
- `apps/frontend/app/components/MainLayout.tsx`

### New frontend files recommended

- `apps/frontend/app/components/holding/HoldingPlannerPanel.tsx`
- `apps/frontend/app/stores/right-panel-store.ts`

### Acceptance criteria

- Today no longer shows the idle calendar panel
- Upcoming no longer shows the idle calendar panel
- Holding still has a companion panel
- Holding panel can be hidden and re-opened
- Holding panel feels useful for planning captured work into time
- no dashboardification or manifesto drift occurs

---

## Workstream 5: Notifications

### Product Goal

Implement a real notification system that connects existing reminder and date fields to:

- the in-app notification center
- browser notifications

### Important current limitation

Frontend currently has:

- no notification center logic
- no unread model
- no browser permission flow
- no service worker
- no push subscription API

Backend currently models only:

- `notifications.email`

That means this workstream is partly frontend and partly contract extension.

### Notification System Layers

### Layer A: In-app Notification Center

### Entry point

Keep the Bell in `IconRail`, but turn it into a real notification center trigger.

For non-wide shells, expose the same action in `SidebarPanel` utility actions.

### Center contents

The panel should show:

- unread reminder items
- due-soon or due-now items
- habit reminder items
- sync/system confirmations that matter

### Grouping

Recommended grouping:

- `Now`
- `Today`
- `Earlier`

### Item structure

Each notification row should include:

- icon
- title
- one line of context
- timestamp or relative time
- action button:
  - `Open`
  - optionally `Dismiss`

### Unread behavior

- unread dot on the bell
- unread count is optional, but a subtle dot is preferred first
- opening the panel can mark items read only after they have been visibly rendered

### Visual rule

Use color sparingly:

- reminder items can use lantern
- system items can use moonlit
- errors should use feedback-error only when necessary

### Layer B: Foreground Browser Notifications

### What this means

When the app is open and permission is granted, Cadence should be able to call the browser Notification API for due reminders.

### Data sources

#### Tasks

- `task.reminderAt`
- `task.reminderSilenced`
- `task.dueDate`
- `task.scheduledStart`

#### Habits

- `habit.reminderEnabled`
- `habit.targetTime`
- weekly log dates

### Scheduling rules

#### Tasks with explicit reminders

- fire at `reminderAt` unless silenced

#### Timed tasks without explicit reminders

- surface in the in-app center
- optionally fire browser reminders based on a user setting once that setting exists

#### All-day tasks with due dates

- surface in the in-app center on due day
- browser alert should depend on user preference and a predictable reminder time

#### Habits

- only notify when `reminderEnabled` is true
- use habit `targetTime` and pending log date

### Required frontend behaviors

- dedupe by item id and trigger time
- never spam repeated notifications while a task stays overdue
- record local “already notified” state for the current device/session

### Layer C: True Web Push

### Important clarification

The brief explicitly calls for browser push notification behavior.

To implement true push that works while the app is closed, Cadence needs:

- a service worker in frontend
- a browser push subscription flow
- backend endpoints to store subscriptions
- backend push delivery

### This is not optional if “push” is claimed as complete

Foreground notifications alone are not sufficient.

### Settings Changes

### Frontend settings model must expand

Update `apps/frontend/app/lib/types/settings.ts` to support at minimum:

- `email`
- `browser`
- `taskReminders`
- `habitReminders`
- `dueDateAlerts`

Recommended but optional:

- `quietHours`
- `defaultAllDayReminderTime`

### Backend settings schema must match

Update:

- `apps/backend/src/types/settings.ts`
- `apps/backend/src/db/schema.ts`

### Notifications settings UI

Replace the placeholder browser row in `NotificationsTab` with a real settings panel:

- toggle browser notifications
- show permission state
- request permission when enabled
- explain denied state
- toggle task reminders
- toggle habit reminders
- toggle due-date alerts

### Required frontend files

### Existing files to modify

- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/settings/tabs/NotificationsTab.tsx`
- `apps/frontend/app/lib/types/settings.ts`
- `apps/frontend/app/hooks/use-settings.ts`

### New frontend files recommended

- `apps/frontend/app/hooks/use-notification-center.ts`
- `apps/frontend/app/hooks/use-browser-notifications.ts`
- `apps/frontend/app/components/notifications/NotificationCenter.tsx`
- `apps/frontend/app/lib/notifications/reminder-engine.ts`
- `apps/frontend/app/lib/notifications/notification-model.ts`

### New backend work required

- subscription schema or storage model
- subscription routes
- push delivery worker/handler
- settings schema expansion

### Acceptance criteria

### In-app center

- Bell shows unread state
- panel lists real reminder and due items
- clicking a notification navigates and reveals its target

### Browser notifications

- permission can be requested from settings
- tasks with reminders can trigger browser notifications
- habits with reminders can trigger browser notifications
- repeated duplicate alerts are suppressed

### Push

- service worker path exists
- subscription flow exists
- backend can store and use subscriptions

---

## File-by-File Execution Map

This section is the concrete handoff map for the implementing agent.

### Shell ownership and shared wiring

### `apps/frontend/app/components/MainLayout.tsx`

Own and render the shell-level utility surfaces:

- universal search dialog
- quick add surface
- utility action callbacks passed to `Sidebar`

Also update keyboard shortcuts so shell actions target these surfaces instead of placeholders.

### `apps/frontend/app/components/sidebar/Sidebar.tsx`

Receive and forward shell utility callbacks.

Responsibilities:

- wide mode: pass actions into `IconRail`
- laptop/tablet/phone: pass actions into `SidebarPanel`
- do not reintroduce local dialog ownership here

### `apps/frontend/app/components/sidebar/IconRail.tsx`

Remove placeholder dialog ownership for:

- search
- quick add

Replace with real triggers for:

- search
- quick add
- sync
- notifications

Keep it visually calm. This file should act as a utility launcher, not a place where heavy dialog logic lives.

### `apps/frontend/app/components/sidebar/SidebarPanel.tsx`

Add responsive parity utility actions for non-wide shells.

This should likely be a small top utility strip rendered above the main nav list.

### Search implementation files

### `apps/frontend/app/components/CommandPalette.tsx`

Refactor into the true universal search surface.

Key changes:

- broader data sources
- grouped result rendering
- deterministic scoring
- route-aware navigation
- no placeholder logic

### `apps/frontend/app/hooks/use-universal-search.ts`

Own:

- result source aggregation
- query normalization
- scoring
- grouping
- result limits

### `apps/frontend/app/lib/search/search-model.ts`

Define normalized item models for:

- tasks
- habits
- captures
- projects
- pages

### `apps/frontend/app/lib/search/search-ranking.ts`

Keep ranking separate from rendering so it is testable and adjustable without dialog churn.

### Route reveal and selection files

### `apps/frontend/app/hooks/use-route-focus.ts`

Own:

- parsing focus params
- waiting for data readiness
- DOM targeting
- scrolling
- reveal timing
- cleanup of transient params

### `apps/frontend/app/components/tasks/TaskCard.tsx`

Add stable focus target attributes and, if needed, a reveal class application point.

### `apps/frontend/app/components/inbox/InboxItemCard.tsx`

Add stable focus target attributes for thought dumps / captures.

### Habit row components

Add matching focus target attributes to whichever component is the stable clickable habit row.

At minimum this likely includes:

- `apps/frontend/app/components/habits/HabitItem.tsx`
- or the actual row renderer used by `HabitsCanvas.tsx`

### Quick Add implementation files

### `apps/frontend/app/components/quick-add/QuickAddSurface.tsx`

Own:

- the shared shell
- tabs/segmented switcher
- dialog vs popover mode

### `apps/frontend/app/components/quick-add/QuickAddTaskForm.tsx`

Use `useCreateTask` and keep the form minimal.

### `apps/frontend/app/components/quick-add/QuickAddCaptureForm.tsx`

Use `useCreateInboxItem` and write directly to Holding captures.

### `apps/frontend/app/components/quick-add/QuickAddHabitForm.tsx`

Reuse validation and cadence logic already used by the full habit create flow.

### Sync implementation files

### `apps/frontend/app/hooks/use-workspace-sync.ts`

Own:

- pending state
- call to `hardRefreshWorkspaceCaches`
- optional settings refresh
- last-synced timestamp

### `apps/frontend/app/lib/api/workspace-cache.ts`

May need minor expansion if additional cache families should be refreshed by Sync.

### Holding planner panel files

### `apps/frontend/app/routes/inbox.tsx`

Swap the idle calendar panel for a Holding-specific planning companion.

### `apps/frontend/app/routes/home.tsx`

Remove idle calendar companion behavior.

Keep detail panel behavior only when a task is selected.

### `apps/frontend/app/routes/upcoming.tsx`

Remove idle calendar companion behavior.

Keep detail panel behavior only when a task is selected.

### `apps/frontend/app/components/holding/HoldingPlannerPanel.tsx`

Compose:

- compact calendar
- selected-day runway
- Holding scheduling actions
- quiet workload language

### `apps/frontend/app/stores/right-panel-store.ts`

Persist:

- open/closed state
- width

### `apps/frontend/app/components/shared/ResizableSidePanel.tsx`

Expand behavior so the panel can be absent entirely when the store says it is closed.

### Notification implementation files

### `apps/frontend/app/components/notifications/NotificationCenter.tsx`

Own the in-app notification list UI.

### `apps/frontend/app/hooks/use-notification-center.ts`

Own:

- unread state
- add/mark read/dismiss behavior
- normalized notification item structure

### `apps/frontend/app/hooks/use-browser-notifications.ts`

Own:

- permission state
- browser notification dispatch
- local dedupe

### `apps/frontend/app/lib/notifications/reminder-engine.ts`

Own:

- reminder time derivation
- due-date derived alert eligibility
- habit reminder scheduling logic
- duplicate suppression keys

### `apps/frontend/app/components/settings/tabs/NotificationsTab.tsx`

Replace placeholder controls with real settings and permission affordances.

### `apps/frontend/app/lib/types/settings.ts`

Expand the frontend settings type to match the notification system.

---

## Backend Coordination Requirements

The following changes are outside `apps/frontend`, but they are required for the full notification scope.

### Settings schema expansion

Update backend settings validation and defaults:

- `apps/backend/src/types/settings.ts`
- `apps/backend/src/db/schema.ts`

The frontend should not ship notification toggles that the backend cannot persist.

### Push subscription storage

Add a backend contract for browser push subscriptions.

Minimum needs:

- authenticated create/update subscription endpoint
- delete subscription endpoint
- storage model keyed by user and browser endpoint

### Push delivery

Cadence needs a delivery path for:

- task reminders
- habit reminders
- due-date alerts if enabled

This can be worker-driven or scheduled, but it must exist before “push notifications” can be considered complete.

### Honest phase boundary

If backend push work is deferred, the release notes and UI copy should distinguish between:

- in-app notifications
- browser notifications while the app is open
- full push notifications

Do not collapse those into one claim.

---

## Responsive Strategy

### Wide

- IconRail is primary utility host
- Holding keeps its planner panel
- Today and Upcoming show detail panel only when selected

### Laptop

- no IconRail exists today
- utility actions move into `SidebarPanel`
- search, quick add, sync, and notifications must remain reachable

### Tablet / Phone

- utility actions must exist in the drawer or header utility row
- search and quick add remain first-class
- notifications panel may become a dialog or sheet rather than a right popover
- Holding planner remains in overlay form

---

## Accessibility and Neurodivergent-Friendliness Checklist

The implementation should explicitly satisfy the following:

- all icon-only buttons have names
- every utility action remains at least `44x44`
- search results are keyboard navigable
- tabs in Quick Add are readable and deterministic
- panel open/close state is persistent and predictable
- no surprise auto-opening of unrelated UI
- sync never blocks input longer than needed
- notification center does not auto-dismiss important items before they are seen
- motion always has a reduced alternative
- visual reveal is supportive, not flashy

---

## Recommended Implementation Order

### Phase 1: Shell and token groundwork

- expand `MainLayout` utility ownership
- wire `Sidebar` and `SidebarPanel` utility actions
- add shared tokens and utilities to `app.css`
- add route-focus contract

### Phase 2: Universal Search

- refactor `CommandPalette`
- add search data model and scoring
- add route reveal behavior
- validate keyboard flow

### Phase 3: Quick Add

- build the surface
- wire task, capture, and habit forms
- navigate and reveal new items

### Phase 4: Manual Sync

- create sync hook
- wire button into utility actions
- add animation and toasts

### Phase 5: Holding Planner Panel

- remove idle calendar panel from Today and Upcoming
- build Holding-specific planner panel
- add hideable state

### Phase 6: Notification Center

- build in-app center
- add unread logic
- connect navigation and reveal

### Phase 7: Foreground Browser Notifications

- permission flow
- reminder scheduling
- dedupe logic

### Phase 8: True Push

- service worker
- subscription contract
- backend delivery integration

---

## QA and Verification Plan

### Functional verification

- search each item type and confirm correct route landing
- create each quick add type and confirm destination
- trigger manual sync and confirm refetch feedback
- confirm Today and Upcoming no longer show idle calendar panel
- confirm Holding panel can hide and re-open
- trigger reminder scenarios for tasks and habits

### Interaction verification

- mouse
- keyboard only
- trackpad
- touch

### Responsive verification

- `wide`
- `laptop`
- `tablet`
- `phone`

### Accessibility verification

- button names
- target size
- focus visibility
- reduced motion
- screen reader labeling of notification rows and search results

### Regression areas to watch

- sidebar behavior in non-wide modes
- task detail opening logic
- `useSearchParams` collisions with existing `settings`, `tag`, and `date` params
- route performance when search loads large datasets
- duplicate query invalidation during manual sync

---

## Explicit Non-Goals

This plan does not recommend:

- a full route restructure
- AI-generated search ranking
- dashboard cards or metrics-heavy UI in Holding
- replacing TanStack Query with a different data strategy
- inventing a fake backend sync API when cache refresh already solves the first version

---

## Final Delivery Definition

This feature set is complete only when all of the following are true:

- search feels universal, not placeholder
- quick add feels faster than navigating manually
- sync restores trust in stale states
- Holding earns its right panel and Today/Upcoming stop wasting space on it
- notifications are a real system across the panel and the browser
- all styling remains token-driven and manifesto-compliant
