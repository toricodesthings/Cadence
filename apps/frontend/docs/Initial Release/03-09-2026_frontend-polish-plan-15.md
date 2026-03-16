# Frontend Polish Plan 15 — March 9, 2026

> **Scope:** UI/UX refinement — layout, spacing, responsive scaling, sizing, and optimistic-UI reliability.

---

## Part 1: Visible & Reported UI Issues

### 1.1 Optimistic UI Reverting

**Symptoms:** Drag-and-drop in schedule, task reorder, and habit unarchive snap back visually.

**Root cause analysis:**

- **Schedule DnD** — The `useUpdateTask` hook's optimistic patch + `onSettled → invalidateTaskCaches` round-trips correctly. However, `onSettled` fires quickly and re-fetches stale server state before the PATCH response propagates. The `onSuccess → reconcileTaskInCaches` replaces the optimistic entry, but the broad `invalidateTaskCaches` in `onSettled` triggers yet another refetch that can race with reconciliation. **Fix:** In `onSettled`, use `invalidateQueries` with `refetchType: "none"` to mark stale without immediate refetch, then call `refetchQueries` with a slight debounce — or simply remove the `onSettled` invalidation when `onSuccess` has already reconciled.

- **Task reorder** — Same `onSettled` race pattern as above. The `useReorderTask` hook's `onSettled` can trigger a refetch that returns the pre-reorder server state if the PATCH hasn't committed yet. Same fix.

- **Habit unarchive** — `useUpdateHabit.onMutate` searches only flat-list caches (`queryKeys.habits.all`) for the full habit object. If the habit only exists in a weekly cache, `fullHabit` is undefined and the active flat list doesn't get the unarchived habit until `onSettled` invalidation fires — causing a brief disappearance. **Fix:** Also search weekly caches when building `fullHabit`.

**Changes:**
- `use-update-task.ts` — Remove redundant `onSettled` invalidation; `onSuccess` reconciliation + `onError` rollback are sufficient. Keep `onSettled` only for error cases via conditional check.
- `use-reorder-task.ts` — Same pattern: make `onSettled` invalidation conditional on error.
- `use-update-habit.ts` — Extend `fullHabit` search to include weekly caches. Remove redundant second `invalidateQueries` call in `onSettled`.

### 1.2 Calendar Sidebar Width Overflow

**Symptom:** The mini calendar in the home page side panel overflows horizontally when the panel is narrow.

**Root cause:** Double padding (`p-5` on wrapper + `p-6` on CalendarView glass container). The 7-column grid needs ~236px minimum (7 × 32px cells + gaps), but available width at minimum panel width (260px) is only ~172px after both paddings.

**Changes:**
- `CalendarView.tsx` — Reduce padding from `p-6` to `p-4`. Add `min-w-0 overflow-hidden` on root div.
- `CalendarGrid.tsx` — For compact variant, ensure cells use flexible sizing instead of fixed `w-8`.

### 1.3 Project/Kanban Board Layout

**Symptom:** Kanban cards are squished, subtasks not laid out well compared to other views.

**Root cause:** Board cards use `variant="board"` with tighter padding (`px-3 py-3`) and the column width is fixed at `w-[300px]`. Subtask items have oversized checkboxes (`h-9 w-9`) and delete buttons that don't scale down for board context.

**Changes:**
- `KanbanBoard.tsx` — Increase column width to `w-[320px]`, increase droppable area gap.
- `TaskCard.tsx` — For `variant="board"`, use appropriately sized subtask checkboxes and adjust meta chip layout.
- `project.tsx` — Remove the double-overflow wrapper on kanban container.

### 1.4 Cannot Add Task in Project Page (500 Error)

**Symptom:** POST /api/tasks returns 500 when creating a task from the project page.

**Root cause:** The backend POST route has no try/catch around the DB insert. If the `projectId` doesn't exist in the `projects` table (FK violation) or if RLS blocks the insert, the error surfaces as a raw 500. Also, the optimistic task in `use-create-task.ts` is missing the `sectionId` field (set to `undefined` instead of `null`), which can cause the task object shape to mismatch.

**Changes:**
- `use-create-task.ts` — Ensure `sectionId: null` is included in the optimistic task.
- Backend `tasks.ts` — Add try/catch around the insert to convert FK violations into 400 errors (separate backend fix, documented here).

### 1.5 Calendar Week View Drag Off-by-One

**Symptom:** Dragging a task from Tuesday to Thursday lands it on Wednesday.

**Root cause:** The `day-` prefix drop handler in `handleDragEnd` uses `droppedId.slice(4)` to extract the date string. The drop target IDs are built correctly as `day-YYYY-MM-DD`. The `preserveLocalTime` function correctly uses local timezone getters. The issue is in the `AllDayDropLane` component — the droppable zone overflow positioning causes the "over" detection to report the wrong column when dragging across the all-day row. The all-day drop targets may overlap at column boundaries.

**Changes:**
- `CalendarDropTargets.tsx` — Ensure all-day drop zones have precise column boundaries with no overlap.
- `WeekView.tsx` — Verify the all-day grid columns match the day columns exactly.

### 1.6 Habits Page Issues

**Symptom:** The habits page appears broken or test data doesn't display.

**Root cause analysis:**
- `HabitItem.tsx` imports `@radix-ui/react-popover` directly instead of through primitives — convention violation.
- `HabitToastResolver.tsx` — "Yes, I did" and "Missed it" buttons just dismiss the toast without calling the resolve API.
- The weekly query needs proper start/end date range calculation. If the range is empty or malformed, no habits display.

**Changes:**
- `HabitItem.tsx` — Switch to primitives `Popover` import.
- `HabitToastResolver.tsx` — Wire up actual resolve calls.

---

## Part 2: Inconsistent UI Issues

### 2.1 Tabs Height Inconsistency in TaskEditPanel

**Symptom:** The Effort indicator tabs in the task detail panel have a different height than the State tabs, despite both being inline toggle groups.

**Root cause:** Both tab groups use raw `<button>` elements with `px-3 py-1.5` padding, but the Effort group uses `<Button variant="ghost" size="sm">` which adds its own min-height via the primitives Button component. The State group uses raw buttons without the Button primitive wrapper.

**Changes:**
- `TaskEditPanel.tsx` — Normalize both tab groups to use the same raw button pattern with consistent padding `px-3 py-1.5 rounded-[10px]` and remove `<Button>` wrapping on Effort toggles.

### 2.2 Drag Handle Footprint

**Symptom:** The `GripVertical` drag handle takes up too much visual space everywhere.

**Root cause:** The drag handle button uses `btn-icon` class which sets `min-width: 44px; min-height: 44px`. Combined with the default icon sizing and margin, the handle dominates the card layout.

**Changes:**
- `TaskCard.tsx` — Replace `btn-icon` with a smaller custom class for the drag handle. Use `min-w-6 min-h-8` or similar, keeping the touch target reasonable but not oversized. Use `w-5` as the visible area.

### 2.3 Monthly View Hover Snapping

**Symptom:** Hovering over a task in month view causes the calendar week row to snap/expand.

**Root cause:** `CalendarDayCell.tsx` uses `AnimatePresence` with `height: "auto"` animation on task chips. When the mouse hovers over a chip and triggers any state change (tooltip, focus highlight), the animated height recalculates, causing a brief layout shift in the `auto-rows-[1fr]` grid.

**Changes:**
- `CalendarDayCell.tsx` — Remove `AnimatePresence` height animation from task chips in the month grid. Use `opacity`-only transitions instead.

### 2.4 General UI Polish Across Schedule, Habit, Planner Pages

**Areas to scan and fix:**
- **Schedule page:** Ensure all view modes have consistent spacing, the view mode switcher is well-aligned
- **Habits page:** Verify the grid layout, habit item click targets, day cell sizing
- **Planner (Home) page:** Verify the two-column board view card sizing, empty states

---

## Implementation Order

1. Fix optimistic UI reverting (highest user impact)
2. Fix calendar sidebar overflow
3. Fix project page task creation
4. Fix kanban board layout
5. Fix calendar drag off-by-one
6. Fix habits page
7. Normalize primitives and tab heights
8. Fix drag handle footprint
9. Fix monthly hover snapping
10. General polish pass
