
### _"Recurring schedule blocks without adding a new mental surface."_

This document defines the product, UX, frontend, and backend implementation plan for weekly timetable blocks in Cadence.

The goal is not to add a separate mini-calendar product inside the app.
The goal is to let a user describe fixed weekly time commitments such as:

- college classes
- school periods
- labs
- tutoring sessions
- office hours
- recurring study blocks

without increasing mental load or breaking the existing task model.

---

## 0. Executive Decision

### Primary decision

Cadence should implement timetable support as **recurring timed task series rendered as virtual schedule instances**.

### Why this is the correct approach

- It preserves the existing product rule: a scheduled item still lives inside the `tasks` domain.
- It avoids adding a fourth mental surface or a new top-level route.
- It allows the feature to feel native inside `/schedule`, which is where users already think spatially.
- It reuses the existing schema primitives that already exist in the stack:
  - `scheduledStart`
  - `scheduledEnd`
  - `durationEstimate`
  - `timezoneLocked`
  - `recurrenceRule`
- It lets the app remain simple for users who never touch the feature.

### Explicit non-decision

Cadence should **not** add a standalone `timetable` page or a separate `routine_blocks` backend resource in v1.

That would create unnecessary product weight before the current task/calendar model has been fully realized.

---

## 1. Product Intent

### Problem being solved

Many users, especially students, do not only manage tasks.
They also need to see the fixed weekly structure around which their tasks must fit.

Without timetable support, Cadence knows the user's flexible work but not the recurring structure that constrains it.
That causes three failures:

- the schedule page is incomplete as a planning surface
- drag-and-drop planning is less trustworthy
- the app asks the user to mentally remember recurring anchors that should already exist on the canvas

### Desired experience

The user should be able to say:

> "I have Calculus every Tuesday and Thursday from 9:30 to 10:45 until the semester ends."

and then see those blocks appear naturally in day, week, month, and year schedule views with minimal setup friction.

### Experience principles

- No separate setup wizard
- No RRULE jargon in the UI
- No forced categorization
- No hidden recurrence logic
- No surprise edits to an entire series
- No noisy task-list pollution outside schedule-heavy contexts

---

## 2. Current-State Audit

This section documents what already exists and what is only partially scaffolded.

### 2.1 What already exists

The current stack already supports the following task fields:

- `scheduledStart`
- `scheduledEnd`
- `durationEstimate`
- `timezoneLocked`
- `recurrenceRule`

The frontend task type already carries those values and schedule views already render timed blocks from `scheduledStart` and `scheduledEnd`.

The backend also already normalizes scheduled fields correctly for:

- timed blocks
- all-day deadlines
- all-day durations

### 2.2 What is only partially implemented

The app currently allows `recurrenceRule` to be stored on tasks, but recurring task behavior is not completed.

Specifically:

- Task reads do not expand recurring rules into visible schedule instances.
- Schedule queries only look at stored `scheduledStart` and `dueDate`.
- The schedule page injects virtual habit instances, but it does not do the same for recurring tasks.
- The main schedule composer does not support recurring block creation.
- The task recurrence UI is too coarse for a school timetable.

### 2.3 What this means in practice

The feature is currently scaffolded at the model layer, but not usable as a user-facing schedule feature.

The user can store recurrence metadata.
The user cannot rely on Cadence to behave like a real recurring timetable system.

### 2.4 Current UX gaps

The current authoring path is fragmented:

- one-off blocks are created from the schedule popover
- recurrence is configured in a secondary deadline popover
- recurrence is displayed as raw RRULE text in task details

That is the wrong hierarchy for this feature.
Timetable setup should feel schedule-native, not metadata-native.

---

## 3. Scope Definition

### 3.1 In scope for v1

V1 should support:

- recurring **timed** weekly blocks
- one series representing one recurring class or recurring study block
- multiple selected weekdays
- fixed start and end times
- a visible start date
- an optional term end date
- full rendering in:
  - day view
  - week view
  - month view
  - year view
- series-level editing from the schedule surface
- visually distinct recurring blocks

### 3.2 Out of scope for v1

The following should be explicitly deferred:

- per-occurrence exceptions
- skipping one occurrence without affecting the series
- moving a single occurrence
- syncing to Google or Apple calendars
- timetable import from PDF / image / OCR
- attendance tracking
- location-aware travel time
- semester templates shared across users

### 3.3 Important constraint

V1 should be **series-first**, not exceptions-first.

That means:

- editing a recurring timetable block edits the series
- dragging a recurring timetable block should not silently create an exception
- if occurrence exceptions are desired later, they should be designed deliberately rather than improvised

---

## 4. Product Behavior

### 4.1 Mental model

Cadence should treat recurring timetable blocks as:

- persistent schedule anchors
- visible in schedule contexts
- editable as a series
- quiet in non-schedule contexts

They are not meant to behave like guilt-inducing recurring checklist items.

### 4.2 Rendering rule

Recurring timetable blocks should be expanded only for schedule-based task queries:

- `scheduledDate`
- `scheduledRange`

This keeps the planning canvas truthful without flooding unrelated list views.

### 4.3 Action rule

Recurring timetable blocks should not expose the same quick actions as ordinary one-off task chips in schedule views.

In v1:

- no quick complete on recurring timetable chips
- no quick archive on recurring timetable chips
- no direct drag-to-move for recurring timetable chips

Clicking the block should open the detail/editor surface in **series mode**.

### 4.4 Archive behavior

Archiving a recurring timetable series should archive the master task and remove future occurrences from schedule views.

The user-facing copy should say:

- `Archive series`

not:

- `Complete`
- `Done`
- `Dismiss`

### 4.5 Undo behavior

All destructive actions on recurring series should be reversible through the standard toast + undo pattern already used elsewhere in Cadence.

---

## 5. The Correct UX Home

### 5.1 Primary page

The feature belongs on:

- `/schedule`

This is non-negotiable.

Timetable blocks are spatial and temporal.
They must be created where time is visible.

### 5.2 Primary view

The best initial setup surface is:

- week view

Why week view is the right authoring surface:

- it shows weekday repetition immediately
- it reduces month-view density
- it makes class-like patterns legible
- it matches how students typically think about recurring class structure

### 5.3 Secondary surfaces

The feature should also integrate with:

- day view for close inspection
- month view for density confirmation
- year view for long-horizon confidence
- task detail panel for series editing

### 5.4 No new top-level route

There should be no new nav item such as:

- `Timetable`
- `Classes`
- `Routine`

That would violate the app's simplicity rule.

---

## 6. Creation Flow

### 6.1 Entry points

There should be three entry points:

1. `Add Task` from the schedule header
2. click / tap on an empty schedule slot
3. edit an existing recurring block from the detail panel

### 6.2 Composer strategy

The schedule composer should become a unified schedule-native composer with two modes:

- `Once`
- `Repeats weekly`

### 6.3 Default behavior

When the user clicks an empty grid slot:

- the selected date should be prefilled
- the start time should be prefilled from the clicked slot
- the end time should default to a sensible duration
- the selected weekday should be preselected if repeat mode is turned on

### 6.4 Recommended form structure

The recurring block composer should use this order:

1. title
2. mode: `Once` or `Repeats weekly`
3. day chips
4. start time
5. end time
6. start date
7. optional end date
8. optional project / notes / reminder

This order keeps the intent first and the metadata second.

### 6.5 Progressive disclosure

The form should remain short by default.

Only the essential fields should be visible immediately.
Secondary fields should remain collapsed or visually quiet.

### 6.6 Copy rules

The UI should never expose raw rule language.

Good:

- `Repeats Tue & Thu`
- `Ends May 2`
- `9:30 AM - 10:45 AM`

Bad:

- `RRULE`
- `BYDAY`
- `UNTIL`
- `INTERVAL`

---

## 7. Neurodivergent-Friendly UX Rules

This feature must explicitly follow the repo's neurodivergent-first product rules.

### 7.1 Reduce decision count

Do not ask the user to decide:

- series vs occurrence at creation time
- project, tag, and reminder before the block can be saved
- whether the feature is a task or event

The user should only need:

- title
- weekday pattern
- time

### 7.2 Keep setup reversible

The user should be able to:

- create a block quickly
- edit the series later
- archive the series later

No irreversible setup ceremony.

### 7.3 Use calm defaults

Defaults should be:

- repeat day preselected from the clicked date
- duration prefilled from the selected slot or last edited value within the current session
- end date optional
- timezone locking enabled by default for timetable blocks

### 7.4 Make the summary visible

Before submit, the composer should show a plain-English preview such as:

`Repeats every Tue & Thu, 9:30 AM - 10:45 AM, until May 2`

That preview reduces uncertainty and prevents silent mistakes.

### 7.5 Avoid accidental loss

The current custom schedule popover closes on outside click.
For a more detailed recurring composer, accidental dismissal risk is too high.

Therefore:

- desktop recurring mode should use a larger anchored panel or sheet
- mobile recurring mode should use a bottom sheet
- closing a dirty form should require explicit confirmation or preserve draft state while open in the current route session

### 7.6 Keep touch and keyboard parity

The composer must maintain:

- 44x44 minimum touch targets
- visible focus treatment
- keyboard-usable day selection
- ESC close only when safe
- form submission without pointer dependency

---

## 8. Visual and Interaction Design Rules

### 8.1 Block styling

Recurring timetable blocks should look related to ordinary task blocks, but slightly calmer and more structural.

Recommended signals:

- repeat glyph
- quieter chrome
- slightly more neutral accent treatment
- no completion affordance on hover

### 8.2 Month view rule

Month view should not become dense with repeated labels.

Recurring timetable series should contribute to:

- day density
- dots / block hints

but month view should still prioritize scanability over content volume.

### 8.3 Week and day view rule

Week/day views should show the real recurring blocks as timed physical objects on the canvas.

### 8.4 Overlap rule

Recurring blocks make overlap handling mandatory.

The calendar must support parallel timed layout when two blocks overlap.
Full-width stacked collision is not acceptable for a class schedule feature.

### 8.5 Motion rule

Motion should only orient the user.

Allowed:

- composer expansion
- sheet slide
- subtle block insert animation
- overlap layout reflow

Not allowed:

- celebratory effects
- gamified feedback
- noisy recurrence animations

---

## 9. Time Precision Rules

### 9.1 Current problem

The current schedule grid and time picker operate at 30-minute granularity.

That is too coarse for real school schedules.
Common real examples:

- `8:15`
- `9:20`
- `10:50`
- `1:05`

### 9.2 Required v1 behavior

Cadence should support:

- 15-minute snap in the visible grid
- 5-minute precision in direct time entry controls

This balances clarity and practicality:

- drag remains simple
- actual class times remain expressible

### 9.3 Duration rule

The block duration must be derived from:

- `scheduledEnd - scheduledStart`

not from guesswork or estimate-only logic.

---

## 10. Data Model Strategy

### 10.1 Keep the task table

V1 should keep timetable series inside `tasks`.

No new table is required yet.

### 10.2 Required existing fields

The master row should continue using:

- `title`
- `scheduledStart`
- `scheduledEnd`
- `recurrenceRule`
- `timezoneLocked`
- `projectId` optionally
- `content` optionally

### 10.3 Recommended v1 interpretation

For recurring timetable series:

- `scheduledStart` is the anchor start datetime
- `scheduledEnd` is the anchor end datetime
- `recurrenceRule` describes the weekly repetition pattern
- `timezoneLocked` should default to `true`

### 10.4 Important v1 limitation

V1 should treat the stored row as the **series master**, not as a concrete occurrence.

That means schedule reads must materialize virtual instances for a range instead of expecting one row per visible block.

---

## 11. Backend Plan

### 11.1 New backend responsibility

The backend must expand recurring timed tasks into virtual schedule instances when a request is explicitly schedule-scoped.

### 11.2 Expansion trigger

Recurring expansion should run when the task query includes:

- `scheduledDate`
- `scheduledRangeStart`
- `scheduledRangeEnd`

### 11.3 Why expansion must be backend-side

The backend is the right place because:

- all clients need the same behavior
- recurrence logic should not fork across web and mobile
- habit expansion already sets the precedent
- query filters and date-range logic already live server-side

### 11.4 Expansion algorithm

For v1:

1. fetch one-off tasks that match the range normally
2. fetch recurring master tasks that may produce occurrences inside the requested range
3. expand each recurring master into virtual instances inside the range
4. merge one-off tasks and virtual instances
5. return the merged result sorted by effective start

### 11.5 V1 recurring support level

The schedule composer should only generate weekly BYDAY-based rules.

The backend may still accept broader RRULE strings for compatibility, but v1 implementation quality should be optimized around:

- weekly recurrence
- multi-day weekday selection
- optional end date

### 11.6 Required response shape additions

Task responses used by schedule views should support optional metadata for recurring instances:

- `seriesId`
- `isRecurringInstance`
- `occurrenceStart`
- `occurrenceEnd`

If the item is not virtual, these fields remain absent.

### 11.7 ID strategy

Virtual schedule instances should use a deterministic synthetic ID based on:

- master task id
- occurrence start datetime

This allows stable rendering and selection inside the frontend.

### 11.8 Mutation rule

V1 mutations remain series-level:

- `PATCH /tasks/:id` edits the master series
- there is no occurrence-specific patch route in v1

### 11.9 Validation rule

If `recurrenceRule` is present for a recurring timetable block, the backend should validate that the rule is syntactically parseable.

V1 should reject malformed recurrence rules early instead of storing broken series and failing later at read time.

### 11.10 Expired series behavior

If the recurrence rule has ended before the requested range, the backend should not emit any virtual instances.

### 11.11 Timezone behavior

Timetable series should default to `timezoneLocked = true`.

Reason:

- users expect a class to stay at its wall-clock time
- traveling or DST changes should not silently distort a school timetable

---

## 12. Frontend Plan

### 12.1 Replace the current recurrence picker for this feature path

The current `RecurrencePicker` is too weak for timetable creation.

It should be replaced or bypassed with a schedule-native weekly cadence picker that supports:

- weekday chips
- readable summary
- optional end date

The existing habit cadence picker should be used as the conceptual base, not the current task recurrence presets.

### 12.2 Upgrade the schedule composer

The current `CalendarEventPopover` should evolve into a composer that can safely expand into recurring-series mode.

Behavior:

- one-off creation remains fast
- enabling recurrence expands the UI into a larger form
- the user never leaves the schedule context

### 12.3 Desktop behavior

Desktop recurring creation should use:

- a larger anchored sheet or popover-panel

not a tiny transient popover.

### 12.4 Mobile behavior

Mobile recurring creation should use:

- a bottom sheet

This matches the repo's own design language and keeps the interaction thumb-friendly.

### 12.5 Detail panel behavior

When a recurring instance is selected:

- open the existing task detail panel
- label the schedule section as `Series`
- show a readable repeat summary
- expose `Edit series`
- expose `Archive series`

Do not show raw RRULE strings.

### 12.6 Calendar chip behavior

Recurring timetable chips should:

- render normally in the time grid
- show repeat identity visually
- suppress quick complete / archive hover actions
- be selectable
- be non-draggable in v1 or intercept drag into `Edit series` behavior

### 12.7 Cache strategy

Existing optimistic cache reconciliation assumes one task row equals one visible task item.
That is not true for recurring schedule instances.

Therefore recurring series mutations should:

- invalidate schedule task queries
- refetch the affected ranges

instead of trying to locally synthesize all future instances inside cache helpers.

---

## 13. Mutation Safety Rules

### 13.1 No silent series edits from direct manipulation

Direct manipulation is powerful, but for recurring series it is risky.

V1 rule:

- dragging a recurring timetable block should not silently move the whole series

### 13.2 Recommended v1 interaction

If the user attempts to drag a recurring timetable block:

- prevent the drag from completing
- open the series editor or show a short neutral explanation:
  - `Recurring blocks are edited as a series.`

### 13.3 Why this is the right tradeoff

This slightly reduces speed, but it massively reduces accidental global edits.

That is the correct tradeoff for a neurodivergent-friendly planning product.

### 13.4 Future exception model

If occurrence exceptions are added later, they should be introduced as a separate design phase with:

- explicit exception state
- series vs occurrence choice
- reliable undo semantics

They should not be improvised in the v1 feature.

---

## 14. Required File-Level Work

This section lists the expected implementation areas.

### 14.1 Frontend

Likely touch points:

- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/components/calendar/CalendarEventPopover.tsx`
- `apps/frontend/app/components/calendar/ScheduleHeader.tsx`
- `apps/frontend/app/components/calendar/WeekView.tsx`
- `apps/frontend/app/components/calendar/DayView.tsx`
- `apps/frontend/app/components/calendar/CalendarTaskChip.tsx`
- `apps/frontend/app/components/tasks/TaskEditPanel.tsx`
- `apps/frontend/app/components/tasks/DeadlinePickerPopover.tsx`
- `apps/frontend/app/components/habits/CadencePicker.tsx` as a logic/design reference
- `apps/frontend/app/lib/api/cache-sync.ts`
- `apps/frontend/app/lib/utils/calendar-dnd.ts`
- `apps/frontend/app/lib/utils/calendar-utils.ts`
- `apps/frontend/app/types/task.ts`

### 14.2 Backend

Likely touch points:

- `apps/backend/src/routes/tasks.ts`
- `apps/backend/src/types/task.ts`
- `apps/backend/src/db/schema.ts` only if a follow-up schema refinement becomes necessary
- a new recurrence expansion helper under `apps/backend/src/lib/`

### 14.3 Tests

Likely touch points:

- `apps/backend/tests/routes/tasks.contract.test.ts`
- new backend recurrence expansion tests
- frontend schedule rendering tests
- frontend cache invalidation tests for recurring series

---

## 15. Testing Plan

### 15.1 Backend tests

Must cover:

- weekly recurrence expansion inside a range
- multiple weekday expansion
- end-date-bounded recurrence
- no duplicate master + first instance
- deterministic synthetic IDs
- correct sort order with one-off tasks mixed in
- malformed rule rejection

### 15.2 Frontend tests

Must cover:

- recurring series summary formatting
- recurring instance rendering in schedule views
- recurring chip action suppression
- recurring mutation cache invalidation behavior
- composer defaults from clicked slot/date

### 15.3 Manual QA scenarios

Must cover:

1. add a Tue/Thu class from week view
2. confirm it appears in future weeks
3. confirm month view stays readable
4. edit the series time and see all occurrences update
5. archive the series and confirm future instances disappear
6. ensure recurring blocks do not expose complete affordances
7. verify mobile bottom-sheet behavior
8. verify keyboard-only creation flow
9. verify reduced-motion behavior remains sane
10. verify overlap layout when two classes intersect

---

## 16. Rollout Plan

### Phase 1: data and rendering correctness

- implement backend recurring expansion for schedule queries
- extend frontend task types for recurring instance metadata
- render recurring instances in schedule views
- invalidate schedule caches correctly

### Phase 2: creation and editing UX

- upgrade the schedule composer
- add weekday selection and end date
- replace raw RRULE presentation with readable summaries
- route recurring block edits through the detail panel in series mode

### Phase 3: polish and trust

- overlap layout
- improved time precision
- recurring chip visual refinement
- drag safety behavior
- accessibility and mobile polish

### Phase 4: future work if justified

- per-occurrence exceptions
- import flows
- external calendar sync
- attendance / notes by occurrence

---

## 17. Definition of Done

The feature is done only when all of the following are true:

- a user can create a weekly recurring class block from `/schedule`
- the block appears correctly across future day/week/month/year schedule views
- the UI never exposes raw RRULE strings
- recurring blocks do not behave like one-off completable tasks in the schedule canvas
- the user can edit the series safely
- the user can archive the series safely
- the mobile flow feels first-class
- keyboard and focus behavior remain solid
- overlap handling is good enough for realistic school schedules
- tests cover the recurrence expansion path

---

## 18. Final Recommendation

Cadence should ship this feature as a **schedule-native recurring series system**, not as a separate product area.

The correct implementation path is:

- keep the task model
- expand recurring timed series only in schedule-scoped queries
- make `/schedule` the creation home
- use a calm, series-first recurring block composer
- favor safety and clarity over cleverness

If this is done correctly, timetable support will feel like Cadence became more complete.
If it is done incorrectly, it will feel like a second planning tool got bolted onto the side.

This plan is designed to produce the first outcome.
