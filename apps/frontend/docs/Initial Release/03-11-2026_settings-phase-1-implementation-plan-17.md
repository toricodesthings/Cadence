# Cadence Settings Phase 1 Implementation Plan 17

## Purpose

This document defines the March 11, 2026 implementation plan for finishing the non-AI settings experience in Cadence.

Phase 1 is not about making every preference fully power the entire product. It is about making every non-AI setting real:

- visible
- understandable
- writable
- persisted correctly
- restored correctly
- organized under the right subsection
- auto-applied to the backend immediately after change

If a downstream behavior is expensive or still evolving, the setting may be "persisted now, consumed later." What is not acceptable in Phase 1 is a dead control, a disabled fake control, or unclear copy.

---

## Scope

### In scope

- all settings tabs except AI
- settings schema expansion
- backend normalization and persistence
- frontend auto-save behavior
- settings IA and subsection reorganization
- replacing non-AI placeholders and locked controls
- copy cleanup so labels and descriptions read naturally
- tests for the expanded contract

### Out of scope

- AI settings implementation
- full external integration auth/sync flows
- actual data export and account deletion pipelines
- push notifications or service worker work

These out-of-scope items should not block Phase 1. Where necessary, Phase 1 stores the preference cleanly and presents truthful status.

---

## Core Constraints

- `docs/Design Manifesto.md` is a hard constraint, especially Twilight Sanctuary tone, readability, soft surfaces, and the rejection of generic disabled SaaS slabs.
- `apps/frontend/AGENTS.md` rules apply throughout.
- All settings except avatar upload must auto-save.
- Account actions that are not true settings must remain honest about where they persist:
  - auth-backed data stays in auth
  - preference-backed data stays in `users.settings`
- Use existing Cadence primitives:
  - `Switch` for boolean on/off
  - `Select` for bounded option sets
  - `Input` for freeform text or numeric text
  - `Button` only for explicit actions, resets, requests, or confirms
  - `Dialog` / `AlertDialog` only for confirmation or irreversible actions
- No hardcoded one-off styling in tab components when a token belongs in `app/app.css`.
- Copy must feel calm, specific, and human. No filler labels like "Base Theme Engine Configuration."

---

## Current State Audit

### What is already real

- `tasks.hideCompleted`
- `tasks.hideTrash`
- `tasks.defaultDueDate`
- `dateTime.weekStart`
- `dateTime.timeDisplay`
- `dateTime.timezone`
- `calendar.holidays.*`
- `notifications.email`
- `notifications.browser`
- `notifications.taskReminders`
- `notifications.habitReminders`
- `notifications.dueDateAlerts`
- `profile.pronouns`
- `preferredView`

### What is half-implemented

- `preferredView` is saved, but it sits at the top level instead of under a task/workflow subsection.
- date and time settings save, but the app still has hardcoded date utility assumptions in places such as week start.
- holiday settings are the most complete settings area, but they live under the wrong mental model for the current settings IA.
- browser notifications save and request permission, but the surrounding settings structure is still narrow.

### What is still presentational or dead

- `AppearanceTab`
- `ShortcutsTab` remapping
- `IntegrationsTab`
- `DataPrivacyTab`
- all non-AI "coming soon" / disabled settings surfaces

### Structural issues

- frontend and backend duplicate settings schema shape manually
- backend `GET /settings` returns whatever exists in storage instead of normalizing against a single canonical default shape
- there is no explicit compatibility strategy for new keys or moved keys
- settings are organized by broad labels, but not by the mental model of the rows inside them
- some rows in settings are actually auth actions, not settings
- some text is still too placeholder-like for a polished Cadence surface

---

## Outcome Definition

After Phase 1:

- every non-AI settings tab is fully interactive
- every non-AI setting persists to the backend immediately
- reloading the app restores the exact values
- existing users with partial settings blobs are normalized without data loss
- there are no disabled non-AI controls in settings
- rows that are not true settings are clearly presented as account actions or future connection state, not fake toggles
- the settings IA matches the content inside each tab
- the UI copy feels natural and consistent with Cadence

---

## Canonical Information Architecture

Use this final sidebar structure for Phase 1:

### Profile & Security

- `account`
  - Profile
  - Sign-in & security
  - Connected accounts
  - Active devices

### Preferences

- `appearance`
  - Theme
  - Motion
  - Density
- `notifications`
  - Delivery
  - Reminder types
  - Quiet hours
- `calendar-time`
  - Formats
  - Timezone
  - Calendar layout
  - Holiday overlay
- `tasks`
  - Task defaults
  - Views & visibility
  - Workflow behavior
- `shortcuts`
  - Shortcut behavior
  - Key bindings

### Workspace

- `integrations`
  - Calendar sync preferences
  - Notes & knowledge preferences
  - Calendar feed preferences

### Privacy

- `privacy`
  - Privacy preferences
  - Local data preferences
  - Export and deletion status

### Planned

- `ai`
  - remains present but explicitly out of Phase 1

### Naming changes

- `My Account` -> `Profile & Security`
- `Date & Time` -> `Calendar & Time`
- `Tasks & Workflow` stays close, but its subsection titles get sharper
- `System Keyboard Shortcuts` -> `Keyboard Shortcuts`
- `External Integrations` -> `Integrations`
- `Data & Privacy` -> `Privacy & Data`

---

## Phase 1 Canonical Settings Model

Phase 1 should add or reorganize the settings JSON into the following logical shape.

Auth-backed account fields must not be shoved into `users.settings`. Name, email, avatar, password, 2FA state, linked OAuth accounts, and sessions remain auth/service concerns. Everything below belongs in settings persistence.

### Top-level shape

```text
profile
appearance
notifications
dateTime
calendar
tasks
shortcuts
integrations
privacy
```

### `profile`

- `pronouns: string`

### `appearance`

- `theme: "twilight" | "daylight" | "system"`
- `accentIntensity: "soft" | "balanced" | "vivid"`
- `motion: "system" | "full" | "reduced"`
- `density: "comfortable" | "compact"`

### `notifications`

- `email: boolean`
- `browser: boolean`
- `taskReminders: boolean`
- `habitReminders: boolean`
- `dueDateAlerts: boolean`
- `quietHoursEnabled: boolean`
- `quietHoursStart: string | null`
- `quietHoursEnd: string | null`

### `dateTime`

- `weekStart: "Sunday" | "Monday" | "Saturday"`
- `timezone: string`
- `timeDisplay: "12h" | "24h"`
- `dateStyle: "mdy" | "dmy" | "ymd"`

### `calendar`

- `defaultView: "month" | "week" | "day"`
- `showWeekNumbers: boolean`
- `showWeekends: boolean`
- `holidays.enabled: boolean`
- `holidays.usePreciseLocation: boolean`
- `holidays.locationMode: "auto" | "manual"`
- `holidays.countryCode: string | null`
- `holidays.subdivisionCode: string | null`
- `holidays.promptDismissedAt: string | null`

### `tasks`

- `defaultDueDate: "None" | "Today" | "Tomorrow" | "Next Week" | null`
- `defaultView: "list" | "kanban"`
- `defaultPriority: "none" | "low" | "medium" | "high" | "urgent"`
- `defaultDurationMinutes: 15 | 30 | 45 | 60 | 90 | null`
- `newTaskPlacement: "top" | "bottom"`
- `openDetailOnCreate: boolean`
- `hideCompleted: boolean`
- `hideTrash: boolean`
- `showDoneCelebration: boolean`

### `shortcuts`

- `enabled: boolean`
- `showHints: boolean`
- `bindings.commandPalette: string`
- `bindings.newTask: string`
- `bindings.focusSearch: string`
- `bindings.toggleView: string`
- `bindings.completeTask: string`
- `bindings.archiveTask: string`

### `integrations`

- `googleCalendar.enabled: boolean`
- `googleCalendar.syncMode: "one_way" | "two_way"`
- `googleCalendar.includeCompleted: boolean`
- `appleCalendar.enabled: boolean`
- `appleCalendar.syncMode: "one_way" | "two_way"`
- `notion.enabled: boolean`
- `notion.createBacklinks: boolean`
- `obsidian.enabled: boolean`
- `obsidian.appendTaskLinks: boolean`
- `ics.enabled: boolean`
- `ics.includeHabits: boolean`

### `privacy`

- `usageDiagnostics: boolean`
- `crashReports: boolean`
- `storeRecentSearches: boolean`
- `storeDismissedPrompts: boolean`
- `exportFormat: "json" | "csv"`
- `lastExportRequestedAt: string | null`

### Compatibility note

Current `preferredView` should migrate into `tasks.defaultView`.

Phase 1 compatibility rule:

- if `tasks.defaultView` exists, use it
- else if legacy `preferredView` exists, map it into `tasks.defaultView`
- do not write `preferredView` anymore after migration

---

## Which Settings Must Apply Now vs Persist Now

### Must apply immediately in Phase 1

- `profile.pronouns`
- `appearance.theme`
- `appearance.motion`
- `appearance.density`
- `notifications.*`
- `dateTime.weekStart`
- `dateTime.timeDisplay`
- `dateTime.timezone`
- `calendar.defaultView`
- `calendar.showWeekNumbers`
- `calendar.showWeekends`
- `calendar.holidays.*`
- `tasks.defaultView`
- `tasks.hideCompleted`
- `tasks.hideTrash`

### Persist now, consumer can follow later

- `appearance.accentIntensity`
- `dateTime.dateStyle`
- `tasks.defaultPriority`
- `tasks.defaultDurationMinutes`
- `tasks.newTaskPlacement`
- `tasks.openDetailOnCreate`
- `tasks.showDoneCelebration`
- `shortcuts.*`
- `integrations.*`
- `privacy.*` except UI-local hints that are already session-only

This split keeps Phase 1 honest. The user can change these settings now, and the backend truth is ready, even if a later feature consumes them.

---

## Shared Implementation Rules

### 1. One canonical defaults object

Create one canonical default settings object and use it everywhere:

- backend schema defaults
- backend route normalization
- frontend local cache hydration
- tests
- tab fallbacks

Do not keep separate ad hoc fallback objects in individual tabs.

### 2. Normalize on read, not only on write

`GET /settings` must deep-merge stored settings with canonical defaults before returning.

Why this matters:

- older users will have partial blobs
- new Phase 1 keys should appear instantly without requiring the user to touch each control
- frontend tabs should never need to guess missing defaults

### 3. Validate the merged result

`PATCH /settings` should:

- validate the incoming patch
- deep-merge into normalized stored settings
- validate the merged full object
- save only the validated merged result

This avoids accumulating invalid partially merged shapes.

### 4. Auto-save contract

- `Switch`: save immediately on toggle
- `Select`: save immediately on selection
- `Input`: debounce save at 400 to 600ms and flush on blur
- destructive or service actions: explicit confirmation only

### 5. Calm save feedback

Do not spam toasts for every switch change.

Use:

- inline subtle "Saving..." / "Saved" text for text inputs where helpful
- toasts only for errors, destructive confirms, export requests, or auth/service actions

### 6. No dead buttons

If a button does not perform a real action in Phase 1, remove it from the row.

For example:

- replace disabled integration connect buttons with status copy plus persistable sync preferences
- replace disabled privacy export rows with a real export request status flow or truthful passive copy

---

## Tab-by-Tab Implementation Plan

## 1. Profile & Security

### Keep auth-backed sections, but cleanly separate them from settings-backed rows

Subsections:

- Profile
- Sign-in & security
- Connected accounts
- Active devices

### Profile subsection

- Keep avatar upload auth-backed
- Keep display name auth-backed
- Keep email change auth-backed
- move pronouns into a true inline settings row instead of a modal edit affordance

### Required cleanup

- remove hover-only discoverability for essential edit actions where it hurts clarity
- rewrite labels so they read naturally:
  - `Display Name`
  - `Pronouns`
  - `Email Address`
- keep auth actions clearly labeled as account changes, not preferences

### Persistence

- `profile.pronouns` -> settings backend
- name/email/avatar/password/2FA/OAuth/sessions -> auth backend

This distinction should be stated in the plan comments and implementation notes so a future agent does not incorrectly move auth data into JSON settings.

## 2. Appearance

Subsections:

- Theme
- Motion
- Density

### Settings to implement

- Theme
  - `appearance.theme`
- Accent intensity
  - `appearance.accentIntensity`
- Motion
  - `appearance.motion`
- Density
  - `appearance.density`

### Phase 1 behavior

- `theme` applies immediately via root theme state or document data attribute
- `motion` applies immediately by honoring `system`, `full`, or `reduced`
- `density` applies immediately through a shared root density class used by settings rows, task rows, and shell spacing tokens where safe
- `accentIntensity` may persist now and be consumed in a smaller pass if token plumbing is not finished

### UI notes

- remove the current `Future Upgrade` badge
- do not dim the entire tab
- use normal interactive controls

## 3. Notifications

Subsections:

- Delivery
- Reminder types
- Quiet hours

### Keep and improve

- email delivery
- browser notifications
- task reminders
- habit reminders
- due date alerts

### Add

- `quietHoursEnabled`
- `quietHoursStart`
- `quietHoursEnd`

### Phase 1 behavior

- existing reminder filtering continues to use saved booleans
- browser permission flow remains real
- quiet hours can be persisted immediately even if reminder-engine suppression lands in a follow-up pass

### UI notes

- if browser permission is denied, keep the explanatory state
- do not disable the entire row permanently; give the user a truthful explanation and recovery guidance

## 4. Calendar & Time

Subsections:

- Formats
- Timezone
- Calendar layout
- Holiday overlay

### Existing settings to keep

- `dateTime.weekStart`
- `dateTime.timeDisplay`
- `dateTime.timezone`
- `calendar.holidays.*`

### Add

- `dateTime.dateStyle`
- `calendar.defaultView`
- `calendar.showWeekNumbers`
- `calendar.showWeekends`

### Phase 1 behavior

- week start must stop being hardcoded in date utilities and calendar helpers
- time display and timezone should continue feeding scheduling and formatting hooks
- holiday overlay stays fully wired
- default calendar view, week numbers, and weekends should save now; apply immediately where inexpensive, otherwise persist now and wire next

### UI notes

- keep holiday overlay in this tab, not split into Appearance or Privacy
- continue using the existing `HolidayPreferencesPanel`; it already fits the design language better than the older placeholder rows

## 5. Tasks & Workflow

Subsections:

- Task defaults
- Views & visibility
- Workflow behavior

### Keep

- `defaultDueDate`
- `hideCompleted`
- `hideTrash`

### Move and rename

- move legacy `preferredView` into `tasks.defaultView`

### Add

- `defaultPriority`
- `defaultDurationMinutes`
- `newTaskPlacement`
- `openDetailOnCreate`
- `showDoneCelebration`

### Phase 1 behavior

- `tasks.defaultView` replaces the top-level view setting and updates `use-view-mode`
- hide completed and hide trash keep driving sidebar visibility
- the new task defaults persist even if every task creation surface does not consume them in the same PR

### UI notes

- this tab should feel like task defaults and planner behavior, not "miscellaneous app settings"
- descriptions should describe what Cadence will do, not ask vague questions

## 6. Keyboard Shortcuts

Subsections:

- Shortcut behavior
- Key bindings

### Replace the static table with real settings rows

Add:

- `shortcuts.enabled`
- `shortcuts.showHints`
- `shortcuts.bindings.*`

### Phase 1 behavior

- settings persist immediately
- remapped bindings may remain persist-only if applying them inside `use-keyboard-shortcuts` is too large for the same pass
- if binding capture is implemented in Phase 1, use one focused key capture control per action and a reset-to-default button

### UI notes

- do not keep the footer saying remapping is unavailable
- if runtime remapping is not wired yet, say so clearly in helper text near the subsection, not as a stale footnote

## 7. Integrations

Subsections:

- Calendar sync preferences
- Notes & knowledge preferences
- Calendar feed preferences

### Replace disabled connect buttons

Phase 1 should not show dead `Connect` buttons for providers without a working flow.

Instead:

- show provider cards with truthful status such as `Disconnected`
- include only settings that can genuinely save now
- reserve real connection actions for providers that already have a real implementation

### Settings to add

- `integrations.googleCalendar.*`
- `integrations.appleCalendar.*`
- `integrations.notion.*`
- `integrations.obsidian.*`
- `integrations.ics.*`

### Phase 1 behavior

- all rows persist immediately
- no background sync is required yet
- the tab becomes a real preference surface instead of a promise wall

## 8. Privacy & Data

Subsections:

- Privacy preferences
- Local data preferences
- Export and deletion status

### Add settings

- `privacy.usageDiagnostics`
- `privacy.crashReports`
- `privacy.storeRecentSearches`
- `privacy.storeDismissedPrompts`
- `privacy.exportFormat`
- `privacy.lastExportRequestedAt`

### Phase 1 action treatment

- `Request Data` becomes a real action only if it records a request timestamp and selected export format
- `Delete Account` should not remain as a disabled fake action

Recommended Phase 1 handling:

- keep export as a real request intent saved into settings with confirmation copy explaining delivery is not yet automated
- remove the delete button from Phase 1 if there is no real deletion pipeline, or convert it into truthful passive copy under a "Contact support / future phase" label

The key rule is honesty. No destructive-looking button that does nothing.

---

## Shared Frontend Workstreams

## 1. Shared settings contract cleanup

- move toward one shared settings type source instead of duplicated frontend/backend shapes
- define canonical defaults in one place
- add helper utilities:
  - normalize settings
  - migrate legacy settings
  - deep merge safe settings patches

## 2. Auto-save UI helpers

Introduce shared settings form helpers so tabs are consistent:

- immediate mutation wrapper for switch/select
- debounced text mutation wrapper for inputs
- inline save state helper for text rows
- reset-to-default helper for subsections where useful

## 3. Dialog/sidebar reorganization

- rename tab ids and labels where needed
- keep search, but update it to search on actual tab labels after the rename
- preserve the existing shell and atmospheric layout

## 4. Truthful status treatment

- no tab-wide opacity dimming for non-AI settings
- no non-AI `Coming Soon` badges
- status copy should be precise:
  - `Disconnected`
  - `Saved for future sync`
  - `Permission blocked`
  - `Uses system setting`

---

## Shared Backend Workstreams

## 1. Expand the settings schema

- backend patch schema
- backend full schema
- database default JSON
- debug seed defaults if needed
- contract tests

## 2. Normalize legacy users

Use route-level normalization first.

If a SQL backfill is added later, it should be optional and not required for correctness.

## 3. Key migration rules

- `preferredView` -> `tasks.defaultView`
- missing new sections -> merge in defaults
- missing nested keys -> merge in defaults

## 4. Validation rules

- allow nested partial patches
- reject invalid enum values
- reject invalid booleans and malformed shapes
- validate the merged final object before write

---

## Execution Order

1. Finalize the canonical settings model and defaults.
2. Update backend schemas, defaults, route normalization, and compatibility migration.
3. Update backend tests for expanded settings coverage.
4. Update frontend settings types and hydration logic to use normalized defaults.
5. Move `preferredView` consumption to `tasks.defaultView`.
6. Implement Appearance.
7. Implement Notifications quiet hours.
8. Implement Calendar & Time additions.
9. Implement Tasks & Workflow additions.
10. Replace Shortcuts with a real editable settings surface.
11. Replace Integrations placeholders with saveable preference rows.
12. Replace Privacy placeholders with real preferences and truthful action treatment.
13. Clean up copy across all tabs.
14. Run frontend and backend tests for settings flows.

This order minimizes rework because the contract is stabilized before UI expansion.

---

## Testing Plan

### Backend

- `settings` route contract tests for all new sections
- merge tests for legacy `preferredView`
- validation tests for new enums and booleans
- GET normalization tests for missing nested sections

### Frontend

- `use-settings` tests for normalized hydration
- optimistic update tests for new nested keys
- `use-view-mode` tests for `tasks.defaultView`
- tab interaction tests:
  - switch saves
  - select saves
  - text input debounce saves
  - rollback on mutation error

### Manual verification

- sign in with an older user settings blob
- open each tab and confirm every row is interactive
- change one setting in every subsection
- reload the page
- verify values restore correctly
- verify currently applied settings actually affect the live UI where Phase 1 promises they do

---

## Copy Rules For Implementation

- Labels should be short and concrete.
- Descriptions should explain the effect in one calm sentence.
- Buttons should use plain language:
  - `Reset to Default`
  - `Request Export`
  - `Use System`
  - `Disconnect`
- Avoid corporate phrasing like `Configuration`, `Enable Feature Set`, or `Preference Engine`.
- Avoid misleading future-speak for Phase 1 tabs.

---

## Design Guardrails

- Keep the settings surface as another room in the sanctuary, not a boxed admin console.
- Do not replace atmospheric rows with dense tables unless the content truly requires it.
- Maintain readable contrast floors from the manifesto.
- Keep row copy comfortably readable at current sizes.
- Do not over-pack controls into one row. If a row needs multiple related controls, stack them cleanly inside the content area.
- Preserve keyboard and reduced-motion accessibility.

---

## Final Notes For The Implementing Agent

- AI is the only settings area allowed to remain visibly planned.
- Account data and auth actions are not the same thing as JSON settings. Do not collapse them together.
- The biggest correctness risk is schema drift between frontend defaults, backend defaults, and route normalization. Solve that first.
- The biggest product risk is shipping a lot of saved settings with misleading copy or fake actions. Keep the UX truthful.
- Phase 1 succeeds when the settings panel stops feeling half-built, even if a subset of the newly saved preferences are only consumed in later feature passes.
