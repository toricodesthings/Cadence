# Implementation Plan 18: Final Polish Before Working Beta

Date: 2026-03-14

## Purpose

This plan is the final production-readiness pass for Cadence before a working beta. The goal is not more surface area. The goal is trust:

- lower daily-use friction
- make drag, reschedule, complete, and capture feel immediate
- add a real offline/recovery layer
- polish the product so it feels deliberate, not fragile
- start collecting the right product signals for future AI assistance without handing control to AI

## Audit Summary

Current strengths:

- Core task, habit, inbox, schedule, search, and settings surfaces already exist.
- Task mutations are optimistic-first and the cache reconciliation layer is already in place.
- Backend foundations for `task_metrics`, `user_metrics`, and `ai_memories` already exist.

Current blockers and gaps:

1. Settings reliability is currently below beta-ready.
   - `apps/frontend/app/hooks/use-settings.ts` now exposes a simplified mutation API, but `AccountTab` and `DataPrivacyTab` still call `mutateAsync` or callback-style signatures.
   - `pnpm --filter @cadence/frontend typecheck` fails.
   - `pnpm --filter @cadence/frontend test` fails in `tests/app/hooks/use-settings.test.tsx`.

2. Inbox processing is visually present but operationally incomplete.
   - `apps/frontend/app/components/inbox/InboxItemCard.tsx` renders a `Process to Task` button with no handler.
   - `apps/frontend/app/hooks/inbox/use-update-inbox-item.ts` appears to call `api.inbox...` instead of `client.api.inbox...`, which likely breaks Inbox board section moves.

3. Today and Upcoming are missing explicit sort modes and Upcoming is not fully mobile-safe.
   - `apps/frontend/app/routes/home.tsx` sorts by anchor and `orderIndex`, but there is no route-level sort control for priority/manual/schedule.
   - `apps/frontend/app/routes/upcoming.tsx` is chronological-only and not draggable.
   - `apps/frontend/app/routes/upcoming.tsx` has no mobile overlay detail panel, unlike Today and Holding.

4. Drag reorder is only partially durable.
   - `apps/frontend/app/hooks/tasks/use-reorder-task.ts` sends `orderedTaskIds`.
   - `apps/backend/src/types/task.ts` and `apps/backend/src/routes/tasks.ts` ignore them and only persist a single `orderIndex`.
   - That is enough for local optimism, but not enough for stable, non-reversing server-backed ordering over time.

5. “Quick complete” currently has too much latency.
   - `apps/frontend/app/stores/task-completion-store.ts` delays commit by 4000ms.
   - That is calm, but not quick. It also keeps completed work hanging in place too long.

6. Offline support is not implemented.
   - No service worker, no manifest, no persisted query cache, no mutation outbox, no reconnect replay.
   - `apps/frontend/app/hooks/use-workspace-sync.ts` is manual invalidation, not offline resilience.

7. Export is not implemented.
   - `apps/frontend/app/components/settings/tabs/DataPrivacyTab.tsx` only records `lastExportRequestedAt`.
   - There is no real export route or download flow.

8. Search is useful but not yet “reliable.”
   - `apps/frontend/app/hooks/use-universal-search.ts` is simple weighted substring scoring, not fuzzy search.
   - Privacy flags for recent search storage are not wired to any actual search history behavior.

9. AI-readiness data is only partially wired.
   - `task_metrics` tracks completion and reschedules.
   - `user_metrics` and `ai_memories` exist in schema but are not actively maintained outside debug seeding.
   - There is no event pipeline for schedule usage, habits usage, search usage, or burnout signals.

10. Recurring task support needs a final hardening pass.
   - `apps/backend/src/lib/task-recurrence.ts` expands timed recurring tasks for schedule-scoped queries, but all-day recurring tasks are not expanded the same way.
   - Frontend cache handling currently falls back to broad invalidation for recurring tasks rather than precise reconciliation.

## Implementation Principles

- Keep the calm, atmospheric feel. Remove friction without flattening the product.
- Prefer fewer, stronger controls over more knobs.
- Manual control always wins. AI can suggest, never override.
- Offline behavior must be obvious, reversible, and conflict-safe.
- Beta release requires green typecheck, green tests, and explicit route-level QA.

## Phase 0: Release Blockers First

Objective: restore engineering trust before adding polish.

Scope:

- Fix the settings mutation contract so all settings tabs use one valid API.
- Repair the failing settings tests and update expectations to match normalized defaults.
- Fix Inbox item mutation plumbing.
- Wire the Inbox `Process to Task` action.
- Add Upcoming mobile detail behavior.

Primary files:

- `apps/frontend/app/hooks/use-settings.ts`
- `apps/frontend/app/components/settings/tabs/AccountTab.tsx`
- `apps/frontend/app/components/settings/tabs/DataPrivacyTab.tsx`
- `apps/frontend/tests/app/hooks/use-settings.test.tsx`
- `apps/frontend/app/hooks/inbox/use-update-inbox-item.ts`
- `apps/frontend/app/components/inbox/InboxItemCard.tsx`
- `apps/frontend/app/routes/upcoming.tsx`

Deliverables:

- `typecheck` passes.
- `test` passes.
- Inbox board drag between sections works.
- “Process to Task” converts capture into a task and marks/removes the inbox item.
- Upcoming task details open on phone/tablet via `ResponsiveOverlayPanel`.

Acceptance:

- No settings tab relies on stale mutation APIs.
- No primary capture/processing action is decorative-only.

## Phase 1: Daily-Use Friction Removal

Objective: make the core daily loop fast, low-load, and predictable.

### 1.1 Sort modes for Today and Upcoming

Add a shared sort model with three explicit modes:

- `Smart`: current date/time-first behavior
- `Priority`: priority desc, pinned desc, then date/time
- `Manual`: `orderIndex`-first and drag-enabled

Implementation notes:

- Store route sort mode in user settings or URL search params.
- Reuse one shared sorter helper for `home.tsx` and `upcoming.tsx`.
- When not in `Manual`, hide or disable drag handles so the UI does not promise reorder where reorder is not active.

Primary files:

- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/components/shared/ViewToggle.tsx` or new shared sort control
- `apps/frontend/app/lib/utils/priority.ts`
- new shared sort helper under `apps/frontend/app/lib/utils/`

### 1.2 Durable drag reorder

Promote reorder from “optimistic enough” to “server-stable.”

Implementation notes:

- Extend `reorderTaskSchema` to accept `orderedTaskIds`.
- Rebalance the affected subset server-side instead of only persisting the moved item’s `orderIndex`.
- Keep reorder scoped to the visible bucket/list to avoid cross-bucket instability.
- Add tests for repeated reorder, reverse drag, and refresh persistence.

Primary files:

- `apps/backend/src/types/task.ts`
- `apps/backend/src/routes/tasks.ts`
- `apps/frontend/app/hooks/tasks/use-reorder-task.ts`
- `apps/frontend/app/components/tasks/TaskList.tsx`

### 1.3 Quick reschedule and quick complete

Make the fastest actions available without opening the detail panel.

Implementation notes:

- Add visible quick actions for Today and Upcoming rows on touch devices, not hover-only.
- Keep context menu for power users, but expose one-tap presets for `Today`, `Tomorrow`, `Next week`, and `Done`.
- Reduce completion delay from 4000ms to a short premium-feeling undo window, or move undo into toast while committing immediately.
- Ensure bulk action bar supports the same presets.

Primary files:

- `apps/frontend/app/components/tasks/TaskCheckbox.tsx`
- `apps/frontend/app/stores/task-completion-store.ts`
- `apps/frontend/app/components/tasks/TaskContextMenu.tsx`
- `apps/frontend/app/components/tasks/FloatingActionBar.tsx`
- `apps/frontend/app/routes/upcoming.tsx`

### 1.4 Inbox and Holding friction removal

Make raw capture genuinely frictionless.

Implementation notes:

- Add one-step “Process to Task” with smart defaults into Holding or selected project.
- Add “Process and keep note” vs “Convert and remove” behavior.
- Keep capture creation fast from Quick Add, but make processing fast from the Holding surface too.
- Remove hover-only dependency for inbox actions on mobile.

Primary files:

- `apps/frontend/app/components/inbox/InboxItemCard.tsx`
- `apps/frontend/app/components/inbox/InboxList.tsx`
- `apps/frontend/app/components/inbox/InboxBoard.tsx`
- `apps/frontend/app/hooks/inbox/use-update-inbox-item.ts`
- backend inbox/task routes as needed

Acceptance for Phase 1:

- Today and Upcoming both support `Smart`, `Priority`, and `Manual` sort modes.
- Drag reorder feels stable and survives refresh.
- Completing/rescheduling a task takes one interaction from Today, Upcoming, and Holding.
- Captures can be converted without opening a separate edit flow.

## Phase 2: Reliability Layer

Objective: Cadence remains trustworthy when the network is weak or absent.

### 2.1 Offline-first client shell

Add:

- PWA manifest
- service worker for app shell and static asset caching
- explicit online/offline status banner

Primary files:

- `apps/frontend/app/root.tsx`
- `apps/frontend/public/`
- `apps/frontend/worker.ts` or dedicated service-worker entry

### 2.2 Persisted cache and offline reads

Add:

- persisted TanStack Query cache using durable browser storage
- route boot hydration from persisted cache
- clear separation between cached data and sync status

Primary files:

- `apps/frontend/app/providers.tsx`
- `apps/frontend/app/lib/api/query-keys.ts`
- new offline/persistence helpers under `apps/frontend/app/lib/api/`

### 2.3 Mutation outbox and reconnect replay

Every task/habit/inbox mutation needed for daily use should work offline and replay safely when back online.

Required actions:

- create task
- update task
- reorder task
- complete task
- reschedule task
- create capture
- process capture
- resolve habit

Implementation notes:

- Queue mutations locally with a stable client mutation id.
- Replay on reconnect in order.
- Mark syncing state in UI.
- Add idempotency handling and stale-write protection on backend mutations.

Primary files:

- `apps/frontend/app/hooks/tasks/*`
- `apps/frontend/app/hooks/inbox/*`
- `apps/frontend/app/hooks/habits/*`
- `apps/frontend/app/hooks/use-workspace-sync.ts`
- backend routes for tasks, inbox, habits

### 2.4 Conflict handling

Define a minimal beta-safe policy:

- if server `updatedAt` is newer, do not silently overwrite
- keep local copy in outbox as a recoverable conflict
- surface “Review conflict” instead of silent loss

Acceptance for Phase 2:

- The app opens and reads cached Today/Holding/Upcoming data offline.
- Core mutations queue offline and replay on reconnect.
- Users always know whether a change is local-only, syncing, failed, or confirmed.

## Phase 3: Polish Layer

Objective: make the app feel premium without adding noise.

### 3.1 Drag animation polish

- Tighten `dnd-kit` + motion transitions so cards do not snap or reverse visually.
- Add lifted overlay treatment and smoother drop-settle.
- Respect reduced motion.

### 3.2 Completion animation polish

- Keep the current celebratory feel, but shorten and soften it.
- Prefer subtle glow, check draw, and row fade/slide instead of a long pending state.

### 3.3 Empty states with action

Current empty states are calm, but too passive.

Add CTA-driven empty states for:

- Holding: capture a thought or add a task
- Today: pull from Holding or plan schedule
- Upcoming: schedule next work block
- Search: recent searches when enabled, plus suggested destinations

Primary files:

- `apps/frontend/app/routes/home.tsx`
- `apps/frontend/app/routes/upcoming.tsx`
- `apps/frontend/app/routes/inbox.tsx`
- `apps/frontend/app/components/tasks/EmptyState.tsx`
- `apps/frontend/app/components/CommandPalette.tsx`
- `apps/frontend/app/components/tasks/SortableTaskCard.tsx`

Acceptance for Phase 3:

- No core surface feels empty without telling the user what to do next.
- Motion feels intentional, not flashy.

## Phase 4: AI-Readiness and Observability

Objective: prepare the system for assistant behavior without giving AI product authority.

### 4.1 Event and metric model

Keep the existing foundations and extend them.

Track at minimum:

- tasks completed
- task reschedules
- overdue carries
- schedule page opens
- schedule drag usage
- habits completed/skipped
- capture volume
- search usage
- export usage

Recommended direction:

- add a lightweight `usage_events` table or Analytics Engine sink
- aggregate into `user_metrics`
- keep `task_metrics` task-specific and `user_metrics` user-state specific

### 4.2 Burnout and workload signals

Use existing `user_metrics` to compute:

- reschedule velocity
- overdue carry load
- completion ratio
- habit adherence trend
- recent schedule density

Do not expose raw “judgmental” scores in beta UI.

### 4.3 Suggestion-only assistant groundwork

Do not ship autonomous scheduling in beta.

Do ship:

- suggestion event model
- suggestion draft schema
- UI placeholder for “suggested cleanup,” “lighten today,” or “move these out of sight”
- privacy gating through `settings.privacy.usageDiagnostics`

Primary files:

- `apps/backend/src/db/schema.ts`
- `apps/backend/src/lib/metrics.ts`
- new backend routes for usage events / suggestions
- `apps/frontend/app/components/settings/tabs/AITab.tsx`
- frontend action hooks where events are emitted

Acceptance for Phase 4:

- Metrics needed for future AI are collected immediately after launch.
- AI remains assistive and non-destructive by design.

## Phase 5: Final Checklist and Release Gate

### Required product outcomes

- Inbox/Holding capture is frictionless
- Today page supports fast sorting, complete, and reschedule
- Upcoming supports fast sorting, complete, reschedule, and mobile detail
- Recurring tasks behave correctly across list and schedule views
- Search is reliable and useful offline from cache
- Offline mode is safe and reconnect replay is visible
- Export is actually downloadable
- Mobile interactions do not depend on hover
- Keyboard shortcuts cover capture, search, navigation, complete, reschedule, and archive

### Required engineering gate

- `pnpm --filter @cadence/frontend typecheck` passes
- `pnpm --filter @cadence/frontend test` passes
- add regression coverage for:
  - settings mutation API
  - inbox process-to-task
  - inbox board section move
  - reorder persistence
  - offline queue replay
  - recurring task expansion
  - export flow

### Manual QA matrix

- Desktop mouse
- Desktop keyboard-only
- iPhone-width touch
- Android-width touch
- Offline boot
- Offline mutation then reconnect
- Slow 3G-style reconnect

## Recommended Execution Order

1. Phase 0
2. Phase 1.1 to 1.4
3. Phase 2.1 to 2.4
4. Phase 3
5. Phase 4
6. Phase 5 release gate

## Definition of Done

Cadence is ready for working beta when the calmness of the UI is matched by operational trust:

- no dead-end controls
- no hidden mobile-only failures
- no silent data loss under weak connectivity
- no fake export/support placeholders
- no AI behavior without user-first guardrails

