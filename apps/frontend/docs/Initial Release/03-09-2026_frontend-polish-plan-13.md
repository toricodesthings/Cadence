# Cadence Frontend Polish Plan 13

**Date:** March 9, 2026  
**Scope:** `apps/frontend`  
**Backend companion:** `apps/backend/docs/03-09-2026_backend-polish-plan-13.md`

---

## Purpose

This document defines the production-ready frontend implementation plan for the Cadence polishing pass requested on March 9, 2026.

This is **not** a feature expansion plan.

It is a correction, continuity, consistency, and reliability plan for the authenticated Cadence web client. Every change in this document exists to do one or more of the following:

- remove user-facing bugs
- restore backend/frontend contract parity
- tighten UI semantics
- improve manifesto compliance
- reduce visual and interaction drift between core surfaces

Every section in this plan is subordinate to `docs/Design Manifesto.md`.

No implementation described here is permitted to violate the manifesto's non-negotiables:

- **Anti-SaaS criteria**
- **The atmosphere must survive scale**
- **Layout rhythm**
- **Tasks as the core unit**
- **Menus and dialogs as a single frosted-glass language**
- **Mobile-first dynamics**

If a local optimization conflicts with the manifesto, the optimization loses.

---

## Primary References

### Mandatory design reference

- `docs/Design Manifesto.md`

### Core frontend files reviewed for this plan

- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/routes/habits.tsx`
- `apps/frontend/app/routes/weekly-review.tsx`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/layout/PlannerHeader.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx`
- `apps/frontend/app/components/shared/ResponsiveOverlayPanel.tsx`
- `apps/frontend/app/components/tasks/AddTaskInput.tsx`
- `apps/frontend/app/components/tasks/DeadlinePickerPopover.tsx`
- `apps/frontend/app/components/tasks/TaskCard.tsx`
- `apps/frontend/app/components/tasks/TaskContextMenu.tsx`
- `apps/frontend/app/components/tasks/TaskEditPanel.tsx`
- `apps/frontend/app/components/calendar/CalendarEventPopover.tsx`
- `apps/frontend/app/components/calendar/DayView.tsx`
- `apps/frontend/app/components/calendar/WeekView.tsx`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx`
- `apps/frontend/app/components/habits/HabitItem.tsx`
- `apps/frontend/app/components/habits/HabitMenu.tsx`
- `apps/frontend/app/hooks/tasks/use-tasks.ts`
- `apps/frontend/app/hooks/tasks/use-create-task.ts`
- `apps/frontend/app/hooks/tasks/use-update-task.ts`
- `apps/frontend/app/hooks/habits/use-create-habit.ts`
- `apps/frontend/app/hooks/habits/use-update-habit.ts`
- `apps/frontend/app/hooks/habits/use-resolve-habit.ts`
- `apps/frontend/app/lib/api/cache-sync.ts`
- `apps/frontend/app/lib/api/query-keys.ts`
- `apps/frontend/app/lib/utils/date-format.ts`
- `apps/frontend/app/types/task.ts`

---

## Verification Basis

### Reports and feedback included in scope

- Major Bugs list from the March 9, 2026 request
- UI Problems list from the March 9, 2026 request
- UI/UX Refinement list from the March 9, 2026 request

### Chrome DevTools MCP verification performed on March 9, 2026

Routes and flows inspected:

- `/`
- `/schedule`
- `/weekly-review`
- `/upcoming`
- `/inbox`

Confirmed runtime observations:

1. The current `Today` route still behaves like a planner entry page rather than an aggregate viewer.
   - `PlannerHeader`, `WeeklyResetPrompt`, and `AddTaskInput` are still mounted on `/`.

2. The schedule month surface is currently backed by a failing task query.
   - DevTools network inspection confirmed repeated `400` responses from `/api/tasks?state=ACTIVE&scheduledRangeStart=2026-03-01&scheduledRangeEnd=2026-03-31`.

3. The schedule detail experience is still implemented as an absolute overlay sheet rather than an in-flow, layout-shrinking full-height panel.
   - This is directly visible in `apps/frontend/app/routes/schedule.tsx`.

4. Mobile schedule rendering relies on nested scroll containers with fragile containment.
   - The day view uses an internal vertical scroller while the page shell remains fixed-height.
   - This is workable only if cross-axis propagation is fully contained, which is not currently guaranteed.

5. The weekly reset surface is structurally separate from the main app shell branding language.
   - The sidebar currently uses a generic `Sprout` icon rather than the Cadence logo.

---

## Executive Summary

Plan 13 frontend work is organized around five product corrections:

1. **Restore route identity**
   - `Today` becomes a simplified overdue-plus-today aggregate viewer.
   - `Holding` (`/inbox`) is rewritten into the capture and unmanaged-work surface for tasks with no project.

2. **Fix schedule semantics**
   - make deadline vs duration meaning explicit everywhere
   - allow deadline creation from schedule
   - stop tasks from vanishing after date moves

3. **Replace overlay detail panels with true panel-mode layout**
   - schedule and habits detail panels must take full viewport height and push the primary canvas, consistent with the manifesto's panel-mode rule

4. **Stabilize habits**
   - fix archived/active leakage
   - fix post-sync creation disappearance
   - harden rapid resolve interactions

5. **Restore shell continuity**
   - reorder and rename navigation
   - use Cadence branding consistently in desktop and mobile navigation and weekly reset surfaces

This plan assumes the backend companion work in Plan 13 is completed in parallel, especially the task-range contract normalization, `hasNoProject` support, and the task scheduling invariants.

---

## Non-Negotiable Frontend Constraints

### 1. Manifesto Compliance

All implementation work must be checked against the following manifesto rules before merge:

- New route compositions must feel like additional rooms in the same sanctuary, not separate products.
- Panel mode must remain calm and full-height, never cramped, never enterprise-like.
- Surfaces must use semantic tokens from `app/app.css`, never one-off component colors.
- Mobile interactions must respect safe areas, thumb reach, bottom-sheet conventions, and contained scrolling.

### 2. No Product Surface Expansion

Plan 13 does not add new features, new routes, or new backend-only concepts.

Allowed:

- route role correction
- naming correction
- copy changes
- layout restructuring
- cache and API contract fixes
- interaction semantics fixes

Not allowed:

- new planning modes
- new task concepts
- new dashboard widgets
- new analytics surfaces

### 3. URL Stability

Display labels may change.

The route and API path stability target is:

- keep `/inbox`
- keep `/schedule`
- keep `/weekly-review`
- keep shared backend contracts unless the backend companion explicitly adds a backward-compatible input relaxation

---

## Clarified Product Decisions

The following product decisions are locked for Plan 13 and must drive implementation:

1. `Holding` is the main landing route.
   - The visible name is `Holding`, and the route remains `/inbox`.
   - It behaves like a project-like surface for unmanaged tasks.
   - A task belongs in `Holding` when `projectId = null`, even if it has a deadline, duration, or time block.

2. Quick capture on `Holding` creates real tasks.
   - Route-level quick add should create `tasks` with `projectId = null`.
   - `inbox_items` remain a secondary unresolved-capture feed, not the primary task list.

3. `Today` shows overdue work and work due/scheduled today.
   - It is not an exact-day-only surface.
   - Overdue items must be visually distinct and grouped before today items.

4. Frontend compatibility must cover two temporal storage systems.
   - Deadline-style all-day tasks may still use `dueDate`.
   - Duration and timed scheduling may use schedule fields.
   - The frontend must classify both deterministically without ad hoc guessing.

5. Privacy-sensitive telemetry matters.
   - The frontend should surface `requestId` on server failures where available.
   - UI error handling must not expose raw private identifiers in toasts or debug panels.

---

## Current-State Diagnosis

### A. `Today` and `Inbox` are reversed at the product-role level

Current state:

- `apps/frontend/app/routes/home.tsx` owns:
  - greeting
  - weekly reset prompt
  - add-task input
  - mixed scheduled and unscheduled task presentation
- `apps/frontend/app/routes/inbox.tsx` is a thin inbox item viewer

Why this is wrong:

- The request explicitly redefines `Today` as a simplified aggregate viewer, modeled after `Upcoming`.
- The current implementation keeps `Today` as the emotional landing page and quick-capture surface.
- The current implementation also treats `Inbox` too narrowly, even though unmanaged tasks are already modeled by `projectId = null`.
- That breaks the product mental model and makes navigation hierarchy inconsistent.

### B. Deadline vs duration semantics are currently ambiguous

Current state:

- `DeadlinePickerPopover` exposes `deadline` and `duration`, but the downstream display language remains inconsistent.
- `TaskEditPanel` labels the date control as `Deadline` even when the task is a range.
- `TaskCard` and related list/calendar surfaces derive labels from overloaded field combinations.
- `CalendarEventPopover` only distinguishes all-day vs timed creation, not deadline vs due-on-day vs range semantics.

Why this is wrong:

- Users cannot reliably infer whether a task is due on a day or spans a range.
- The request explicitly defines the difference:
  - **deadline**: due on a single day
  - **duration**: exists from day X to day Y

### C. Schedule and habits panels are using overlay behavior where panel-mode layout is required

Current state:

- `apps/frontend/app/routes/schedule.tsx` renders the task editor as an absolute-positioned side-sheet over the calendar.
- `apps/frontend/app/routes/habits.tsx` uses a desktop side panel, but the layout treatment is not yet standardized with the schedule route.

Why this is wrong:

- The request requires full-height panels that push or shrink the main layout.
- The manifesto's layout rhythm distinguishes canvas mode and panel mode. The current schedule overlay violates that distinction and creates hierarchy confusion.

### D. Habit cache logic is not segregating active vs archived views correctly

Current state:

- `apps/frontend/app/hooks/habits/use-create-habit.ts`
- `apps/frontend/app/hooks/habits/use-update-habit.ts`
- `apps/frontend/app/lib/api/cache-sync.ts`

All three currently operate too broadly across `["habits"]` and `["habits", "weekly"]` caches without respecting archive view boundaries.

Why this is wrong:

- Archived habits leak into the active view.
- Active habits can disappear or become inconsistent after server reconciliation.
- The runtime experience feels unstable even when the backend row exists.

### E. Weekly reset actions are too optimistic in the wrong places and too silent in the wrong places

Current state:

- `apps/frontend/app/routes/weekly-review.tsx` chains create/update/delete mutations inline.
- Buttons do not have dedicated per-card busy states.
- There is no explicit step-local action orchestration.

Why this is wrong:

- A button can appear to do nothing while work is happening or while cache state is catching up.
- The UX lacks deterministic progression for a guided workflow.

### F. Scroll containment and panel containment are not strict enough

Current state:

- schedule day/week views use nested vertical scrolling
- task notes panel and calendar share the same spatial container hierarchy in ways that allow cross-surface interference
- mobile schedule must rely on tight overflow management, but the current composition does not explicitly centralize that rule

Why this is wrong:

- The request explicitly reports calendar horizontal motion when panel scrolling occurs.
- Mobile schedule also fails the intended viewport-height behavior.

### G. Navigation and branding continuity are incomplete

Current state:

- `Inbox` still sits below `Today` and `Upcoming`
- weekly reset uses a generic icon in its custom sidebar
- mobile drawer header lacks the product logo

Why this is wrong:

- The navigation order does not match the corrected product hierarchy.
- The shell loses brand continuity at exactly the points where continuity should be strongest.

---

## Recommended Naming Decision

### Display rename for `Inbox`

Chosen display name: **Holding**

Why this name:

- preserves the meaning of held, unmanaged, not-yet-placed work
- feels warmer and more Cadence-native than `Inbox`
- does not read like corporate workflow software
- still supports the current shell eyebrow `Capture`

Implementation rule:

- keep the route path `/inbox`
- keep backend `inbox` route names
- change only user-facing labels, page titles, empty states, and supporting copy

Supporting clarity rule:

- keep `Inbox` as a command-palette alias and helper descriptor for immediate recognition

Do not use:

- `Dashboard`
- `Queue`
- `Staging`
- anything overtly corporate or sterile

---

## Implementation Tracks

## Track 1: Route Role Realignment

### Goal

Make `Holding` the project-like capture and unmanaged-task surface, and make `Today` a simplified overdue-plus-today aggregate viewer.

### Files

- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/components/layout/PlannerHeader.tsx`
- `apps/frontend/app/components/tasks/AddTaskInput.tsx`
- `apps/frontend/app/components/inbox/InboxList.tsx`
- `apps/frontend/app/components/inbox/InboxBoard.tsx`
- `apps/frontend/app/hooks/inbox/use-inbox.ts`
- `apps/frontend/app/hooks/tasks/use-tasks.ts`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/MainLayout.tsx`

### Required changes

1. Rewrite `/inbox` into the primary capture surface.
   - Move the greeting header from `PlannerHeader` into the route-level top section for `/inbox`.
   - Move the current quick add area from `home.tsx` into `/inbox`.
   - Keep the emotional tone of the greeting, but make the route's job clearer: capture and sort unmanaged work.

2. Make `/inbox` the canonical unmanaged-task route.
   - Use `projectId = null` as the ownership rule for the main task list.
   - Do not define `Holding` by `hasNoDate`.
   - Add a universal task filter such as backend `hasNoProject` and consume that filter here.
   - Quick capture on this route must create real tasks with `projectId = null`.

3. Keep unresolved `inbox_items` visible, but subordinate.
   - Render active unmanaged tasks as the primary list/board content.
   - Render unresolved raw captures in a separate secondary section such as `Needs Processing`.
   - Do not interleave `tasks` and `inbox_items` into one undifferentiated list.
   - Do not dedupe by title heuristics.
   - A raw inbox item should disappear from this route only when it is processed, deleted, or intentionally converted.

4. Define route and shell counts explicitly.
   - The `Holding` nav badge should represent unresolved raw captures, not the full unmanaged task count.
   - Route-level section headers may show both unmanaged task count and unresolved capture count.
   - Do not let a large unmanaged task list turn the nav badge into noise.

5. Rewrite `/` into an overdue-plus-today aggregate viewer modeled after `Upcoming`.
   - Remove:
     - route-level greeting
     - add-task input
     - weekly reset prompt from the page body
   - Replace with:
     - a clean aggregate list for active tasks that are overdue or due/scheduled today
     - styling and row language derived from `upcoming.tsx`

6. Define grouping and sort rules for `Today`.
   - Group 1: `Overdue`
   - Group 2: `Today`
   - Keep overdue first.
   - Within each group, preserve the calmer `Upcoming`-style ordering rules so urgency is legible.

7. Remove quick-wins-specific local branching from the `Today` route unless it materially improves the simplified viewer.
   - The new route should prioritize clarity over cleverness.

### Acceptance criteria

- `Today` contains no task creation controls
- `Today` reads visually as a focused viewer, not a planner dashboard
- `Today` shows overdue tasks before today tasks
- `Holding` becomes the first main-nav destination
- `Holding` owns the greeting and quick capture experience
- `Holding` is driven by `projectId = null`, not by missing dates
- users can clearly distinguish unmanaged tasks from unresolved raw captures

---

## Track 2: Explicit Date Semantics

### Goal

Make deadline vs duration meaning explicit in creation, editing, list display, and schedule surfaces.

### Files

- `apps/frontend/app/components/tasks/DeadlinePickerPopover.tsx`
- `apps/frontend/app/components/tasks/AddTaskInput.tsx`
- `apps/frontend/app/components/tasks/TaskCard.tsx`
- `apps/frontend/app/components/tasks/TaskEditPanel.tsx`
- `apps/frontend/app/components/calendar/CalendarEventPopover.tsx`
- `apps/frontend/app/components/tasks/TaskContextMenu.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/lib/utils/date-format.ts`
- `apps/frontend/app/types/task.ts`

### Required changes

1. Introduce a single frontend scheduling summary helper.
   - Create a shared helper that returns:
     - display mode
     - primary label
     - secondary label
     - whether the task is a deadline, a duration, or a timed block
     - whether the task is legacy-mixed and needs normalization on next write
   - Stop deriving date copy ad hoc in each component.

2. Define a deterministic read-compatibility matrix.
   - Timed block:
     - `scheduledStart` present
     - `isAllDay = false`
     - `scheduledStart` wins as the primary semantic anchor
   - All-day duration:
     - `isAllDay = true`
     - start anchor plus end boundary present
     - display as a span, never as a deadline
   - Deadline-only:
     - all-day
     - one due/start anchor day only
     - no range copy
   - Legacy mixed shapes:
     - classify by explicit precedence rules
     - never let each component invent its own interpretation

3. Standardize terminology.
   - Use `Deadline` only for due-on-day tasks.
   - Use `Duration` only for date ranges.
   - Use `Time block` or `Scheduled time` for timed entries.
   - Never label a range as a deadline.

4. Upgrade `CalendarEventPopover`.
   - Add an explicit mode switch so schedule creation can create:
     - deadline-only task
     - all-day duration
     - timed block
   - The current all-day/timed split is not enough.

5. Make intent-based edits clear stale fields deliberately.
   - Switching to `Deadline` must clear duration/timed-only fields.
   - Switching to `Duration` must clear deadline-only copy and incompatible timed fields.
   - Switching to `Time block` must clear all-day-only assumptions.
   - Frontend payload builders must send explicit nulls where required so stale fields do not survive reschedules.

6. Update task-row and panel copy.
   - `TaskCard`
   - `TaskEditPanel`
   - `Upcoming`
   - `Today`

7. Fix quick reschedule semantics.
   - Rescheduling to `Tomorrow` from a task menu must keep the task visible in the appropriate next surface and must not leave stale range fields behind.

### Acceptance criteria

- a deadline-only task shows one date
- a duration task shows a clear start-to-end span
- a timed task shows time information without pretending to be a deadline
- legacy mixed records still render deterministically before they are normalized
- schedule creation supports due dates as well as ranges
- every route uses the same temporal language

---

## Track 3: Full-Height Detail Panels and Scroll Containment

### Goal

Replace overlay behavior with true panel-mode behavior on desktop and fix scroll hierarchy leaks.

### Files

- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/routes/habits.tsx`
- `apps/frontend/app/components/shared/ResizableSidePanel.tsx`
- `apps/frontend/app/components/shared/ResponsiveOverlayPanel.tsx`
- `apps/frontend/app/components/tasks/TaskEditPanel.tsx`
- `apps/frontend/app/components/habits/HabitDetailPanel.tsx`
- `apps/frontend/app/components/calendar/DayView.tsx`
- `apps/frontend/app/components/calendar/WeekView.tsx`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/app.css`

### Required changes

1. Remove the absolute schedule overlay panel on desktop.
   - The editor must live in layout flow.
   - The calendar canvas must shrink when the panel opens.

2. Standardize panel-mode behavior across schedule and habits.
   - desktop and laptop:
     - resizable in-flow panel
     - full viewport height
   - phone:
     - overlay or sheet behavior remains acceptable
     - but must preserve full-height, safe-area-aware detail treatment

3. Define the shell layout contract explicitly.
   - Split-layout parents must use `min-h-0`.
   - Non-phone panel mode must use `100dvh`-safe height treatment with safe-area padding where needed.
   - Panel widths must be clamped so laptop layouts remain readable and the calendar remains operable.
   - Focus return must be intentional when switching between panel-open and panel-closed states.

4. Audit overflow ownership.
   - One surface owns vertical scroll at a time.
   - Notes/editor scroll must not leak horizontal scroll into the calendar canvas.
   - Add explicit `overflow-x-hidden`, `min-w-0`, and `overscroll-behavior` rules where the hierarchy currently relies on defaults.

5. Ensure mobile schedule can actually be scrolled vertically.
   - Validate scroll on day and week views after the panel hierarchy is corrected.

### Acceptance criteria

- opening a task on schedule visibly shrinks the calendar workspace
- opening a habit on desktop does the same
- mobile schedule can be vertically scrolled without layout dead ends
- panel scrolling does not move the calendar horizontally
- layout remains stable at phone, tablet, laptop, and wide desktop breakpoints

---

## Track 4: Habit Data Consistency and Fast Resolve UX

### Goal

Make habits feel immediate, correct, and archive-safe.

### Files

- `apps/frontend/app/hooks/habits/use-create-habit.ts`
- `apps/frontend/app/hooks/habits/use-update-habit.ts`
- `apps/frontend/app/hooks/habits/use-resolve-habit.ts`
- `apps/frontend/app/hooks/habits/optimistic-helpers.ts`
- `apps/frontend/app/hooks/habits/use-habits.ts`
- `apps/frontend/app/lib/api/cache-sync.ts`
- `apps/frontend/app/routes/habits.tsx`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx`
- `apps/frontend/app/components/habits/HabitItem.tsx`
- `apps/frontend/app/components/habits/HabitMenu.tsx`

### Required changes

1. Segregate habit caches by view meaning.
   - Active weekly caches and archived weekly caches must stop sharing blind optimistic mutations.
   - Reconciliation must insert, remove, or relocate habits based on archive state.

2. Fix post-create persistence.
   - Newly created active habits must survive the optimistic-to-server transition without disappearing from the active weekly grid.

3. Fix archive visibility leakage.
   - Archiving a habit must remove it from the active view immediately.
   - Restoring a habit must remove it from the archived view immediately.

4. Improve rapid habit toggling.
   - Replace broad invalidate-on-every-click behavior with tighter optimistic patching plus a calmer reconciliation strategy.
   - Add per-habit-per-day mutation serialization or an equivalent latest-write guard.
   - Older slower responses must not overwrite newer optimistic intent.
   - Prevent repeated taps from feeling slow or contradictory.

5. Preserve selection continuity.
   - If a visible habit changes state and leaves the current list, clear or redirect the selected detail panel intentionally.

6. Define rollback behavior.
   - On failure, restore the last committed status for the affected habit cell.
   - Surface failure clearly instead of leaving the grid in a contradictory optimistic state.

### Acceptance criteria

- active habits stay in the active view after sync
- archived habits appear only in archived view
- rapid completion tapping feels responsive and deterministic
- no stale ghost habit remains selected after an archive/restore transition
- out-of-order responses cannot revert the latest visible habit state

---

## Track 5: Weekly Reset Reliability

### Goal

Make the guided weekly reset fully actionable and visibly responsive.

### Files

- `apps/frontend/app/routes/weekly-review.tsx`
- `apps/frontend/app/hooks/tasks/use-create-task.ts`
- `apps/frontend/app/hooks/tasks/use-update-task.ts`
- `apps/frontend/app/hooks/inbox/use-delete-inbox-item.ts`
- `apps/frontend/app/components/primitives/Button.tsx`

### Required changes

1. Introduce step-local action orchestration.
   - Each card action must own its pending state.
   - Repeated clicks must be impossible while the mutation chain is running.

2. Remove silent no-op perception.
   - `Decide Later`
   - `Do Tomorrow`
   - `Assign Tomorrow`
   - `Activate Tomorrow`

   All must:

   - visibly disable while running
   - advance the deck immediately after success
   - surface failure if anything breaks

3. Refactor multi-mutation action chains into explicit route helpers.
   - create -> patch -> delete should be wrapped in one route-level async action with a clear success/failure boundary
   - serialize actions per visible card so double-clicks and retries cannot overlap

4. Define partial-failure behavior.
   - Do not optimistically remove a card before the full chain succeeds.
   - If a middle mutation fails, refetch affected queries and keep the current card visible with a clear error state.
   - Only advance the deck once the route helper reports success.

5. Replace generic iconography in the weekly reset sidebar with product branding.

### Acceptance criteria

- no weekly reset CTA appears inert
- the first remaining card always updates after a successful action
- failures are surfaced instead of silently disappearing into cache churn
- weekly reset looks like part of Cadence, not a side experience
- partial successes cannot silently strand the user in a mismatched deck state

---

## Track 6: Navigation Order, Branding, and Shell Continuity

### Goal

Align the shell with the corrected product hierarchy and the manifesto's room-to-room continuity.

### Files

- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/sidebar/SidebarPanel.tsx`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/routes/weekly-review.tsx`
- `apps/frontend/public/logo.png`
- `apps/frontend/app/components/CommandPalette.tsx`

### Required changes

1. Reorder main navigation.
   - `Holding`
   - `Today`
   - `Upcoming`

2. Rename visible `Inbox` labels to `Holding`.
   - sidebar
   - page title
   - empty states
   - command palette
   - shell metadata
   - preserve `Inbox` as a search alias and supporting descriptor so discoverability is not lost

3. Use the Cadence logo in the weekly reset sidebar.

4. Add logo + brand name to the mobile drawer header.
   - Current mobile drawer header is text-only.
   - It must visibly match the icon rail and the app shell.

5. Keep the rest of the shell language token-based and manifesto-safe.

### Acceptance criteria

- navigation order reflects corrected workflow priority
- brand language is consistent across desktop, laptop, and mobile shell states
- weekly reset no longer visually drops out of the product system

---

## Track 7: Supporting API-Consumption Corrections

### Goal

Prepare the frontend for the backend contract fixes without inventing client-only behavior.

### Files

- `apps/frontend/app/hooks/tasks/use-tasks.ts`
- `apps/frontend/app/lib/api/cache-sync.ts`
- `apps/frontend/app/types/task.ts`
- any task list route that consumes scheduled ranges

### Required changes

1. Stop relying on implicit date-shape assumptions.
   - The frontend currently passes date-only boundaries for month/week/year ranges on purpose.
   - Once the backend companion accepts and normalizes them, the frontend should still centralize range-shape construction so it is not duplicated.

2. Expose existing backend filters that the frontend currently underuses.
   - `hasNoProject` for the `Holding` route
   - `hasNoDate` for weekly reset's unscheduled-work step
   - `scheduledDate` for exact-day lookups
   - `effectiveOnOrBeforeDate` or an equivalent additive universal filter if the backend companion provides a server-filtered `Today` path for overdue-plus-today

3. Make cache matching logic aware of normalized task timing semantics.
   - especially when a task changes from:
     - no date -> deadline
     - deadline -> duration
     - timed -> all-day
     - no project -> assigned project

### Acceptance criteria

- route data fetching aligns with the backend companion plan
- no frontend-only contract forks are introduced
- cache placement matches visible route behavior

---

## Implementation Sequence

### Phase 1: Contract-safe scaffolding

- align frontend query hooks with the backend companion plan
- add shared task timing summary helpers
- add any missing route-level loading and empty-state primitives needed by the rewrites

### Phase 2: Route identity correction

- rewrite `Holding`
- rewrite `Today`
- update navigation labels and order

### Phase 3: Panel-mode correction

- schedule panel in-flow conversion
- habits panel normalization
- overflow containment cleanup

### Phase 4: Date semantics cleanup

- `DeadlinePickerPopover`
- `CalendarEventPopover`
- task rows, cards, and panel labels
- quick reschedule semantics

### Phase 5: Habit consistency pass

- optimistic cache segregation
- archive/restore relocation
- rapid resolve hardening

### Phase 6: Weekly reset and brand continuity

- guided flow loading states
- no-op elimination
- logo treatment and mobile drawer branding

### Phase 7: Regression and polish sweep

- desktop
- laptop
- phone
- auth-restored sessions
- empty states
- loading states

---

## Testing and Verification Plan

### Automated

Add or update tests in `apps/frontend/tests` for:

- `use-tasks` filter serialization and placement behavior
- `Holding` placement using `projectId = null` semantics
- `Today` grouping for overdue vs today items
- habit cache reconciliation for active vs archived weekly queries
- habit rapid-toggle ordering protection
- quick reschedule cache placement
- any new timing-summary utility

### Manual QA

Desktop:

- create deadline-only task from `Holding`
- create duration task from `Holding`
- create a timed task in `Holding` and confirm it remains in `Holding` until moved to a project
- create deadline from `Schedule`
- open schedule task panel and confirm layout shrink
- open habit detail panel and confirm layout shrink
- archive and restore habits across both tabs
- confirm `Today` shows `Overdue` before `Today`

Mobile:

- open navigation drawer and confirm logo + brand
- vertically scroll schedule day/week view
- open detail panels and confirm full-height sheet treatment
- scroll notes panel and confirm the calendar does not move sideways
- verify at `320px` width that no horizontal page scroll appears
- verify safe-area spacing on a notched viewport

Weekly reset:

- process every action path on inbox, unscheduled, and waiting steps
- confirm no button appears inert
- deliberately trigger a failing chain and confirm the same card remains actionable after recovery

Temporal display:

- deadline-only task shows one date
- duration task shows start to end
- timed task shows time consistently
- legacy mixed-shape task still renders deterministically before edit

Accessibility and stress:

- keyboard through `Today`, `Holding`, schedule panel, and habits panel
- verify visible focus states in panel mode
- verify `200%` text scaling does not break shell or panel layout
- verify reduced-motion mode does not create layout traps

---

## Merge Gates

Plan 13 frontend work is not complete until all of the following are true:

1. `Today` is a viewer, not a capture surface.
2. `Today` shows overdue work before today work.
3. `Holding` owns greeting and quick capture.
4. `Holding` is defined by `projectId = null`, not by missing dates.
5. `Inbox` is renamed in the UI to `Holding`, moved to the top of the main nav, and remains discoverable through `Inbox` aliases.
6. Schedule month, week, and day flows use consistent date semantics.
7. Legacy temporal task shapes still render deterministically until normalized.
8. Schedule and habits detail panels use full-height panel-mode layout on non-phone breakpoints.
9. Habit archive segregation is correct before and after server reconciliation.
10. Weekly reset buttons are visibly actionable, deterministic, and rollback-safe.
11. Mobile drawer shows the Cadence logo and brand name.
12. All changed surfaces remain compliant with `docs/Design Manifesto.md`.

---

## Explicitly Deferred

The following are outside Plan 13:

- new route creation
- new scheduling concepts beyond clarifying existing semantics
- major backend schema expansion for frontend-only convenience
- AI, analytics, or dashboard features
- mobile app changes in `apps/mobile`

If any of those become necessary, they require a separate plan.
