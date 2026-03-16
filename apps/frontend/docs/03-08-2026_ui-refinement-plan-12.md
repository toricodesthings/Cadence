# Cadence UI Refinement 12

## Purpose

This document converts the March 8, 2026 frontend QA audit into an implementation-ready refinement plan for `apps/frontend`.

This is not a redesign plan.

The goal is to address the remaining production-readiness issues in the authenticated Cadence shell and its primary route surfaces while preserving the existing product language:

- calm
- structured
- very readable
- elegant
- neurodivergent-friendly
- atmospheric
- cozy
- explicitly not generic SaaS

This plan is a direct follow-up to:

- `apps/frontend/docs/03-07-2026_ui-refinement-plan-11.md`

---

## Verification Basis

### Primary references

- `docs/Design Manifesto.md`
- `apps/frontend/app/app.css`
- `apps/frontend/app/components/MainLayout.tsx`
- `apps/frontend/app/components/sidebar/Sidebar.tsx`
- `apps/frontend/app/components/sidebar/ProjectLink.tsx`
- `apps/frontend/app/components/habits/HabitMenu.tsx`
- `apps/frontend/app/components/habits/HabitItem.tsx`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx`
- `apps/frontend/app/components/tasks/TaskCard.tsx`
- `apps/frontend/app/components/tasks/SectionedTaskList.tsx`
- `apps/frontend/app/components/tasks/DeadlineQuickActions.tsx`
- `apps/frontend/app/components/primitives/Switch.tsx`
- `apps/frontend/app/components/kanban/KanbanBoard.tsx`
- `apps/frontend/app/components/inbox/InboxBoard.tsx`
- `apps/frontend/app/components/settings/SettingsDialog.tsx`
- `apps/frontend/app/components/settings/layout/SettingsLayout.tsx`
- `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx`
- `apps/frontend/app/routes/home.tsx`

### Chrome DevTools MCP verification

The live app was inspected on Sunday, March 8, 2026 through Chrome DevTools MCP.

Routes checked:

- `/`
- `/habits`

Automated checks used:

- accessibility tree snapshots
- runtime DOM inspection
- Lighthouse snapshot audit

Observed Lighthouse result on the protected app shell:

- Accessibility: `91`
- Best Practices: `100`
- SEO: `100`

Active Lighthouse failures still present:

- `button-name`
- `target-size`

---

## Executive Summary

Cadence is visually close to product-ready, but the frontend still has a clear set of structural quality issues across accessibility, scaling, manifesto compliance, and performance.

The most important remaining problems are:

1. unnamed icon-only action triggers still exist in live task surfaces
2. the 44px interaction floor is still not systemically enforced
3. task rendering still does too much work per card
4. raw `Date` parsing remains scattered through core surfaces
5. several refinements introduced local improvements but not system-level consistency

This plan covers every finding from the audit and turns each into an explicit implementation track.

---

## Anti-Pattern Verdict

### Tone

Pass.

Cadence still reads as Cadence, not generic SaaS.

### Production polish

Fail.

The remaining issues are mostly not about visual identity. They are about system discipline:

- inconsistent accessibility semantics
- inconsistent target sizing
- fixed-width controls where adaptive sizing is needed
- performance work being pushed into repeated leaf components
- hard-coded visual values bypassing the token system

That combination weakens the manifesto promise of calm, legible, supportive software.

---

## Full Findings Inventory

This section lists every finding from the audit and maps it to implementation work.

### Finding 1

Unnamed overflow and menu triggers remain in task organization surfaces.

Confirmed examples:

- `apps/frontend/app/components/tasks/SectionedTaskList.tsx:145-147`
- `apps/frontend/app/components/kanban/KanbanBoard.tsx:76-78`
- `apps/frontend/app/components/inbox/InboxBoard.tsx:66-68`

Impact:

- active Lighthouse failure on `button-name`
- screen readers encounter generic unlabeled buttons
- violates baseline accessibility expectations for command surfaces

### Finding 2

The 44x44 interaction floor is still violated in several live components.

Confirmed examples:

- `apps/frontend/app/components/primitives/Switch.tsx:9-21`
- `apps/frontend/app/components/habits/HabitMenu.tsx:158-164`
- `apps/frontend/app/components/sidebar/ProjectLink.tsx:200-206`
- `apps/frontend/app/components/tasks/DeadlineQuickActions.tsx:26-36`

Impact:

- active Lighthouse failure on `target-size`
- smaller controls feel twitchy instead of calm
- directly conflicts with the accessibility and neurodivergent-friendly goals

### Finding 3

Task cards still mount multiple task-scoped hooks per rendered card.

Confirmed location:

- `apps/frontend/app/components/tasks/TaskCard.tsx:94-99`

Impact:

- poor scaling as visible task count grows
- higher subscription and mutation overhead in dense lists
- unnecessary rerender pressure in planner and related task views

### Finding 4

Task cards still rely on raw `new Date(...)` parsing and formatting in the render path.

Confirmed examples:

- `apps/frontend/app/components/tasks/TaskCard.tsx:134-149`
- `apps/frontend/app/components/tasks/TaskCard.tsx:244`
- `apps/frontend/app/components/tasks/TaskCard.tsx:324`

Impact:

- same class of instability that already caused the `Invalid Time` bug on `/upcoming`
- timezone drift risk for all-day and date-only values
- formatting logic is fragmented instead of systemized

### Finding 5

The sidebar snap fix now depends on animating layout width directly.

Confirmed locations:

- `apps/frontend/app/components/sidebar/Sidebar.tsx:89-105`
- `apps/frontend/app/components/sidebar/Sidebar.tsx:130-145`

Impact:

- solves the visual snap, but by reflowing layout every frame
- introduces a known performance hotspot in the app shell
- acceptable only if measured and kept within budget

### Finding 6

The habits grid still scales rigidly and does extra repeated work per cell.

Confirmed locations:

- fixed width:
  - `apps/frontend/app/components/habits/HabitsCanvas.tsx:28`
  - `apps/frontend/app/components/habits/HabitsCanvas.tsx:70`
- repeated per-cell lookup:
  - `apps/frontend/app/components/habits/HabitsCanvas.tsx:113-116`

Impact:

- horizontal scrolling remains the fallback instead of graceful adaptation
- the layout still feels like a desktop canvas on smaller widths
- repeated `find()` lookups inside nested loops create avoidable render cost

### Finding 7

Settings still bypasses the design token system and keeps overly rigid sizing patterns.

Confirmed locations:

- hard-coded shell values:
  - `apps/frontend/app/components/settings/SettingsDialog.tsx:99-104`
  - `apps/frontend/app/components/settings/SettingsDialog.tsx:112`
  - `apps/frontend/app/components/settings/SettingsDialog.tsx:161`
- low-contrast settings hierarchy:
  - `apps/frontend/app/components/settings/SettingsDialog.tsx:127`
  - `apps/frontend/app/components/settings/layout/SettingsLayout.tsx:15`
  - `apps/frontend/app/components/settings/layout/SettingsLayout.tsx:39`
- fixed-width control rails:
  - `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:25`
  - `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:50`
  - `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:72`

Impact:

- settings feels visually detached from the rest of Cadence
- hierarchy is flatter and fainter than the manifesto intends
- row layouts remain rigid instead of responsive and calm

### Finding 8

The planner still auto-redirects users into Weekly Reset on Mondays.

Confirmed location:

- `apps/frontend/app/routes/home.tsx:57-67`

Impact:

- interrupts user intent
- surprises users who open Cadence for quick planning or capture
- weakens predictability in the primary entry route

### Finding 9

Some habits surfaces reference undefined theme utilities.

Confirmed locations:

- `apps/frontend/app/components/habits/HabitItem.tsx:68`
- `apps/frontend/app/components/habits/HabitItem.tsx:97`
- `apps/frontend/app/components/habits/HabitItem.tsx:108`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:25`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:30`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:47`

Problem tokens:

- `text-twilight-content`
- `text-twilight-content-active`

Impact:

- these styles are not backed by `apps/frontend/app/app.css`
- creates unpredictable visual output and weakens token discipline
- directly violates the manifesto’s system consistency requirement

---

## Priority 0: Accessibility Baseline Completion

### 1. Remove the remaining unnamed icon-button failures

Severity: Critical

Implementation targets:

- `apps/frontend/app/components/tasks/SectionedTaskList.tsx:145-147`
- `apps/frontend/app/components/kanban/KanbanBoard.tsx:76-78`
- `apps/frontend/app/components/inbox/InboxBoard.tsx:66-68`

Required changes:

1. Add explicit accessible names to all overflow-menu triggers.
2. Ensure the label reflects the object being acted on.
3. Prefer patterns like:
   - `aria-label="Open actions for section {name}"`
   - `aria-label="Open actions for column {name}"`
4. Keep the visible icon-only presentation if desired, but do not rely on tooltip text for accessibility.

Acceptance criteria:

- Lighthouse no longer fails `button-name`.
- No task organization menu trigger is announced as a generic button.
- Accessibility tree shows distinct names for each overflow control.

### 2. Enforce the 44px control floor everywhere it is still broken

Severity: Critical

Implementation targets:

- `apps/frontend/app/components/primitives/Switch.tsx:9-21`
- `apps/frontend/app/components/habits/HabitMenu.tsx:158-164`
- `apps/frontend/app/components/sidebar/ProjectLink.tsx:200-206`
- `apps/frontend/app/components/tasks/DeadlineQuickActions.tsx:26-36`

Required changes:

1. Rebuild the shared switch primitive so the interactive root meets the minimum touch floor.
2. Expand small overflow/action buttons without visually bloating them:
   - preserve icon size
   - increase hit area
   - preserve spacing around adjacent text
3. Normalize quick deadline actions onto the same interaction contract as other compact controls.
4. Re-run Chrome sampling and Lighthouse after the target-size pass.

Acceptance criteria:

- Lighthouse no longer fails `target-size`.
- All interactive controls listed above render at or above `44x44`.
- No compact control depends on precision tapping.

---

## Priority 1: Performance and Scaling

### 3. Remove per-card data orchestration from `TaskCard`

Severity: High

Implementation targets:

- `apps/frontend/app/components/tasks/TaskCard.tsx:94-99`
- the list-level callers that feed task cards

Required changes:

1. Stop calling task-scoped tag and subtask hooks inside every card instance.
2. Move tag and subtask enrichment to an upstream layer:
   - task list level
   - planner route level
   - task data normalization layer
3. Pass already-available data into `TaskCard` as props.
4. Keep task card mutations available, but do not mount four separate data concerns on every visible card by default.

Acceptance criteria:

- `TaskCard` becomes primarily presentational.
- Repeated list renders do not spawn per-card query subscriptions for tags and subtasks.
- Dense task lists remain responsive under selection, filtering, and drag interactions.

### 4. Replace raw `Date` parsing in task rendering with local-safe utilities

Severity: High

Implementation targets:

- `apps/frontend/app/components/tasks/TaskCard.tsx:134-149`
- `apps/frontend/app/components/tasks/TaskCard.tsx:244`
- `apps/frontend/app/components/tasks/TaskCard.tsx:324`
- any task surface using raw `new Date(...)` for display

Required changes:

1. Route all task-facing date display through shared utilities in `apps/frontend/app/lib/utils/date-format.ts`.
2. Use local-safe parsing for:
   - `scheduledStart`
   - `scheduledEnd`
   - `dueDate`
   - `notBefore`
   - `waitingReminder`
3. Eliminate direct `new Date(string)` formatting in `TaskCard`.
4. Audit neighboring task surfaces for the same pattern before closing the work.

Acceptance criteria:

- Task rendering no longer risks `Invalid Time` from malformed or date-only values.
- All task date labels use one consistent formatting approach.
- Date-only fields do not drift by timezone.

### 5. Rework the habits canvas scaling and lookup strategy

Severity: High

Implementation targets:

- `apps/frontend/app/components/habits/HabitsCanvas.tsx:28`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx:70`
- `apps/frontend/app/components/habits/HabitsCanvas.tsx:113-116`

Required changes:

1. Reduce dependence on `min-w-[44rem]` as the first-line layout strategy.
2. Re-evaluate the left info column and day-cell proportions so the grid adapts more gracefully at mid widths.
3. Pre-index habit logs by date before render instead of calling `find()` inside the cell loop.
4. Use a lookup structure such as:
   - `Map<string, HabitLog>`
   - object keyed by `YYYY-MM-DD`
5. Keep the horizontally legible weekly model, but make adaptation intentional rather than rigid.

Acceptance criteria:

- Habits remains readable at mid-range widths without feeling like a hard desktop export.
- No repeated per-cell linear search remains in the render loop.
- Horizontal scrolling becomes a fallback, not the primary scaling strategy.

### 6. Validate the new sidebar animation against performance budget

Severity: Medium

Implementation targets:

- `apps/frontend/app/components/sidebar/Sidebar.tsx:89-105`
- `apps/frontend/app/components/sidebar/Sidebar.tsx:130-145`

Required changes:

1. Keep the improved “no snap” behavior.
2. Evaluate whether animating `width` is acceptable in the production shell.
3. If the layout cost is too high, replace the current technique with a lower-reflow strategy that still moves the main pane continuously.
4. Measure:
   - interaction smoothness
   - dropped frames during collapse/expand
   - perceived latency while the task list is populated

Acceptance criteria:

- Sidebar collapse preserves continuous workspace motion.
- The animation does not introduce noticeable jank on populated planner screens.
- The chosen implementation is intentional and measured, not just visually improved.

---

## Priority 2: Manifesto and System Consistency

### 7. Bring settings back under the token system

Severity: High

Implementation targets:

- `apps/frontend/app/components/settings/SettingsDialog.tsx:99-104`
- `apps/frontend/app/components/settings/SettingsDialog.tsx:112`
- `apps/frontend/app/components/settings/SettingsDialog.tsx:161`

Required changes:

1. Replace hard-coded shell colors with Cadence tokens where possible.
2. Remove one-off `#0a1628` shell decisions that should already map to the twilight scale.
3. Keep the settings shell visually distinct enough for focus, but not detached from the rest of the product.
4. If specific settings surfaces truly need bespoke treatment, define tokens for them instead of inlining values.

Acceptance criteria:

- Settings uses the same color language as the rest of Cadence.
- No major settings shell surface depends on hard-coded hex values unless the value is promoted into the design system.

### 8. Fix settings hierarchy and row rigidity

Severity: Medium

Implementation targets:

- `apps/frontend/app/components/settings/layout/SettingsLayout.tsx:15`
- `apps/frontend/app/components/settings/layout/SettingsLayout.tsx:39`
- `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:25`
- `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:50`
- `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx:72`
- parallel patterns in the other settings tabs

Required changes:

1. Raise the contrast of section headings and descriptions to align with the contrast floor.
2. Remove rigid `w-[180px]` control columns where adaptive width is more appropriate.
3. Let settings rows wrap or stack gracefully as space changes.
4. Rebalance title, body copy, and control alignment so the settings panel feels calm and deliberate, not form-builder rigid.

Acceptance criteria:

- Settings headings and descriptions remain clearly readable on twilight backgrounds.
- Controls do not appear pinned to arbitrary fixed rails.
- Settings rows adapt cleanly across desktop and laptop widths.

### 9. Remove undefined theme utility usage in habits surfaces

Severity: Medium

Implementation targets:

- `apps/frontend/app/components/habits/HabitItem.tsx:68`
- `apps/frontend/app/components/habits/HabitItem.tsx:97`
- `apps/frontend/app/components/habits/HabitItem.tsx:108`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:25`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:30`
- `apps/frontend/app/components/habits/HabitToastResolver.tsx:47`

Required changes:

1. Replace every use of:
   - `text-twilight-content`
   - `text-twilight-content-active`
2. Use existing semantic text tokens or add formal replacements to the theme if truly needed.
3. Verify these surfaces in the browser after replacement so the result matches the manifesto contrast rules.

Acceptance criteria:

- No component references undefined Cadence theme utilities.
- Habits popovers and toast surfaces inherit consistent tokenized text color.
- Styling no longer depends on silent fallback behavior.

---

## Priority 3: UX and Ritual Friction

### 10. Replace automatic Monday redirect with a guided weekly reset prompt

Severity: Medium

Implementation targets:

- `apps/frontend/app/routes/home.tsx:57-67`

Required changes:

1. Remove the forced route redirect from the planner entry path.
2. Replace it with a softer weekly reset prompt pattern such as:
   - inline banner
   - toast
   - subtle prompt card
3. Preserve the Monday ritual concept without hijacking primary navigation intent.
4. Ensure the prompt can be dismissed or deferred.

Acceptance criteria:

- Opening the planner never unexpectedly changes routes.
- Weekly Reset remains discoverable on Mondays.
- The planner stays predictable as the primary entry workspace.

---

## Cross-Cutting Cleanups Required During Implementation

These are not separate findings, but they must be observed while working through the above items.

### A. Preserve manifesto tone

Do not solve the remaining issues by making Cadence more generic.

Specifically:

- do not flatten everything into neutral admin UI
- do not over-brighten muted text into sterile white-heavy hierarchy
- do not replace atmospheric depth with default SaaS card stacks

### B. Prefer system fixes over local exceptions

When possible:

- fix primitives before patching instances
- fix shared layout patterns before route-level overrides
- fix token usage before adding new one-off visual rules

### C. Re-verify with tooling after each priority band

After each major band, re-run:

- `pnpm --filter @cadence/frontend typecheck`
- Chrome DevTools MCP verification on touched routes
- Lighthouse snapshot on the protected app shell

---

## Implementation Order

### Phase 1

Accessibility blockers:

1. unnamed buttons
2. target-size violations

### Phase 2

Performance and resilience:

3. `TaskCard` data orchestration cleanup
4. task date-format normalization
5. habits grid scaling and log lookup indexing
6. sidebar animation measurement/refinement

### Phase 3

System consistency:

7. settings token cleanup
8. settings hierarchy and adaptive row work
9. habits undefined token cleanup

### Phase 4

UX refinement:

10. replace Monday auto-redirect with a guided prompt

---

## Final Acceptance Criteria

Plan 12 is complete only when all of the following are true:

1. Lighthouse on the protected shell no longer fails `button-name`.
2. Lighthouse on the protected shell no longer fails `target-size`.
3. `TaskCard` no longer mounts task-scoped data hooks per card by default.
4. Core task rendering no longer uses raw `new Date(...)` parsing for display.
5. Habits grid no longer depends primarily on fixed `44rem` width and per-cell `find()` lookups.
6. Settings uses Cadence tokens instead of hard-coded shell colors for its main structure.
7. No component references undefined `twilight-content` utility classes.
8. Planner no longer auto-redirects into Weekly Reset on Mondays.
9. The sidebar collapse remains visually continuous without introducing noticeable jank.
10. The app still feels unmistakably like Cadence after the refinements.

