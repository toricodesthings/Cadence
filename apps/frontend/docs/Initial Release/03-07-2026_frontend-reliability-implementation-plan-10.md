# Implementation Plan 10: Frontend Reliability, Auth Recovery, and Data Consistency

This document is the first-phase implementation plan for `apps/frontend`. It is intentionally limited to communication bugs, logic bugs, and missing non-visual reliability features. It does not cover UI refinement work.

The goal of this phase is to make the app resilient when auth state changes, keep optimistic updates stable after successful mutations, synchronize related pages without manual refreshes, and verify that backend access control is actually enforced rather than only assumed.

## 1. Confirmed Code-Level Findings

### 1.1 Protected pages fetch before auth is ready

The current auth gate is render-only, not data-aware.

- `apps/frontend/app/components/MainLayout.tsx:24-45` redirects only after `authClient.useSession()` resolves, and returns `null` for protected pages when there is no session.
- `apps/frontend/app/routes/home.tsx:59-61` starts task queries before `MainLayout` can gate the page.
- `apps/frontend/app/routes/habits.tsx:30-34` starts weekly habits queries before the auth shell has resolved.
- `apps/frontend/app/hooks/tasks/use-tasks.ts:23-47` defaults `enabled` to `true`, with no dependency on auth readiness.
- `apps/frontend/app/hooks/use-api-client.ts:22-41` will still issue fetches even if there is no token yet.

Impact:

- On app boot, dev server restart, or idle-session recovery, protected pages can dispatch unauthenticated requests.
- Those requests can 401 before the auth client has finished restoring session state.
- Because the shell returns `null` on missing session, the user sees a blank screen rather than a recoverable loading or re-auth state.

### 1.2 Global 401 handling is too aggressive and string-based

- `apps/frontend/app/providers.tsx:23-33` signs the user out and redirects whenever any query error message contains `"401"` or `"UNAUTHORIZED"`.

Impact:

- Temporary auth transport issues, token refresh races, backend startup failures, or malformed error messages can force an unnecessary sign-out.
- Error classification is not based on structured status/code metadata.

### 1.3 Optimistic task and habit flows do not reconcile with server truth

- `apps/frontend/app/hooks/tasks/use-create-task.ts:41-87` inserts an optimistic task, but never replaces it with the actual created task from the mutation response.
- `apps/frontend/app/hooks/tasks/use-update-task.ts:31-48` patches optimistically, but ignores the returned authoritative task.
- The same pattern exists for habits and other resources.

Impact:

- The app relies on invalidation/refetch to become correct after mutation success.
- If the immediate refetch returns stale data, the UI can revert to the pre-mutation snapshot and make the new item or edit appear to disappear.

### 1.4 Backend GET caching is likely contributing to optimistic reversion

- `apps/backend/src/routes/tasks.ts:332-333`
- `apps/backend/src/routes/tasks.ts:350-351`
- `apps/backend/src/routes/habits.ts:43-44`
- `apps/backend/src/routes/habits.ts:130-131`
- `apps/backend/src/routes/habits.ts:204-205`

These endpoints currently return `Cache-Control: private, max-age=0, stale-while-revalidate=5`.

Impact:

- Immediately after a successful mutation, the frontend invalidates and refetches.
- The browser or edge can legally serve a stale authenticated response during the `stale-while-revalidate` window.
- That stale response can overwrite the optimistic state and create the "it appeared, then disappeared until refresh" behavior.

### 1.5 Habit cache invalidation is incomplete

- `apps/frontend/app/hooks/habits/optimistic-helpers.ts:21-33` only invalidates `habits.all` and weekly queries.
- `apps/frontend/app/hooks/habits/use-habit-monthly.ts:17-29` uses separate monthly query keys that are never invalidated by create/update/resolve/delete flows.

Impact:

- Habit detail and monthly heatmap views can stay stale even when the weekly board updates.

### 1.6 Session/profile refresh is inconsistent

- `apps/frontend/app/components/settings/tabs/AccountTab.tsx:493-504` updates the avatar through `authClient.updateUser()` but does not refetch session afterward.
- `apps/frontend/app/components/settings/tabs/AccountTab.tsx:565-572` does refetch for some user updates, so the behavior is inconsistent.

Impact:

- Profile image and other session-derived fields can blank or remain stale until a full refresh.

### 1.7 Error responses are not consistently sanitized

- `apps/backend/src/lib/auth.ts:81-87` returns `stack` in the JSON body for auth failures.

Impact:

- Internal backend details can leak to the browser for auth failures.
- Frontend error handling cannot safely assume server messages are sanitized.

### 1.8 Actual Postgres RLS is not confirmed

- `apps/backend/src/lib/rls.ts:4-25` sets `request.jwt.claims` and runs queries in transactions.
- A repository search did not find `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or `FORCE ROW LEVEL SECURITY` in `apps/backend/drizzle`.

Impact:

- The codebase currently demonstrates application-level ownership filtering plus session context setup.
- It does not yet prove that database-enforced RLS policies exist.
- If a query ever misses a `userId` predicate, there may be no database-level guardrail.

### 1.9 Local cached settings are not scoped per user

- `apps/frontend/app/hooks/use-settings.ts:6-8` uses a single global `cadence_user_settings` localStorage key.
- `apps/frontend/app/hooks/use-settings.ts:33-67` hydrates from that key before the server responds.

Impact:

- On shared browsers or account switching, one user can briefly see another user's cached settings.
- This is a low-severity data leak, but it violates the "no cross-user leakage" goal.

## 2. Phase Objective

This phase should deliver the following behavior:

1. Protected pages never issue authenticated data requests until auth bootstrap is complete.
2. Idle-session expiry never degrades into a blank screen.
3. Successful create/update/delete flows persist visibly without requiring refresh.
4. Related views stay in sync across planner, schedule, habits, project, and settings surfaces.
5. Auth and API errors are sanitized, typed, and recoverable.
6. Database access control is verified with real RLS policies, not only route-level filtering.

## 3. Workstream A: Rebuild Auth Bootstrap and Session Recovery

### 3.1 Introduce an explicit auth state model

Create a small auth state layer with these states:

- `bootstrapping`
- `authenticated`
- `anonymous`
- `refreshing`
- `recoverable_error`

Primary targets:

- `apps/frontend/app/lib/auth-client.ts`
- `apps/frontend/app/providers.tsx`
- `apps/frontend/app/components/MainLayout.tsx`
- New hook or provider: `apps/frontend/app/hooks/use-auth-state.ts`

Implementation tasks:

- Wrap `authClient.useSession()` in a project-level hook that exposes `status`, `session`, `isAuthenticated`, and `authReady`.
- Stop using `null` render output as the protected-page fallback.
- Add a protected-shell fallback that can render:
  - loading state during bootstrap
  - session-expired recovery state
  - explicit sign-in redirect only after auth bootstrap is definitively complete

Acceptance criteria:

- Reloading a protected route during dev server startup does not produce a blank screen.
- Expired sessions surface a recoverable auth state before redirecting or signing out.

### 3.2 Gate all protected queries on auth readiness

Primary targets:

- `apps/frontend/app/hooks/tasks/use-tasks.ts`
- `apps/frontend/app/hooks/habits/use-habits.ts`
- `apps/frontend/app/hooks/habits/use-habit-monthly.ts`
- `apps/frontend/app/hooks/projects/use-projects.ts`
- `apps/frontend/app/hooks/inbox/use-inbox.ts`
- `apps/frontend/app/hooks/use-settings.ts`
- Route files that currently fetch before auth settles

Implementation tasks:

- Thread `enabled: authReady && isAuthenticated && existingEnabled` through every authenticated query hook.
- Stop route components from firing protected queries by default before auth has stabilized.
- Make auth readiness part of query execution, not just page rendering.

Acceptance criteria:

- No protected API request is sent without a valid auth state.
- Cold boot, tab restore, and dev restart do not produce initial 401 storms.

### 3.3 Replace global sign-out-on-string-match logic

Primary targets:

- `apps/frontend/app/providers.tsx`
- `apps/frontend/app/lib/api/helpers.ts`
- `apps/frontend/app/hooks/use-api-client.ts`

Implementation tasks:

- Introduce a typed `ApiError` shape containing `status`, `code`, `message`, `isAuthError`, and `isRetryable`.
- Remove string matching on `error.message`.
- Only sign out after:
  - the request was authenticated
  - a refresh/rehydration attempt failed
  - the backend returned a definitive auth failure
- Keep 401 handling centralized, but make it stateful and explicit.

Acceptance criteria:

- Network failures and backend boot failures do not automatically sign users out.
- Actual invalid sessions still redirect correctly.

## 4. Workstream B: Harden the Frontend-Backend Communication Layer

### 4.1 Create a single authenticated fetch wrapper

Primary targets:

- `apps/frontend/app/hooks/use-api-client.ts`
- `apps/frontend/app/lib/api/client.ts`
- `apps/frontend/app/lib/api/helpers.ts`

Implementation tasks:

- Centralize token injection, auth retry, error parsing, and fetch options.
- For authenticated GET requests, use `cache: "no-store"` unless there is a deliberate exception.
- Normalize response parsing so all callers receive typed errors instead of raw `Error(message)`.

Acceptance criteria:

- All authenticated requests share the same error model and cache behavior.
- Request behavior is deterministic across pages.

### 4.2 Remove stale authenticated caching from mutable resource endpoints

Primary targets:

- `apps/backend/src/routes/tasks.ts`
- `apps/backend/src/routes/habits.ts`
- `apps/backend/src/routes/subtasks.ts`

Implementation tasks:

- Remove `stale-while-revalidate` from user-specific mutable endpoints.
- Prefer `Cache-Control: private, no-store` for task, habit, subtask, and other interactive data APIs.
- Keep cache headers only where the UX explicitly benefits and stale reads are harmless.

Acceptance criteria:

- A successful mutation is not immediately followed by a stale authenticated refetch.
- Optimistic state no longer disappears because of cache reuse.

### 4.3 Sanitize backend auth failures

Primary targets:

- `apps/backend/src/lib/auth.ts`
- `apps/backend/src/lib/errors.ts`

Implementation tasks:

- Remove `stack` from client-visible auth responses.
- Return stable error codes such as `UNAUTHORIZED`, `TOKEN_EXPIRED`, and `AUTH_PROVIDER_UNAVAILABLE`.
- Log details server-side only.

Acceptance criteria:

- Browser-visible auth errors never contain internal stack traces.
- Frontend can branch on codes without exposing internals.

## 5. Workstream C: Re-architect Optimistic Mutations Around Authoritative Cache Writes

### 5.1 Replace invalidate-only success handling with write-through reconciliation

Primary targets:

- `apps/frontend/app/hooks/tasks/use-create-task.ts`
- `apps/frontend/app/hooks/tasks/use-update-task.ts`
- `apps/frontend/app/hooks/tasks/use-delete-task.ts`
- `apps/frontend/app/hooks/habits/use-create-habit.ts`
- `apps/frontend/app/hooks/habits/use-update-habit.ts`
- `apps/frontend/app/hooks/habits/use-resolve-habit.ts`
- Equivalent inbox/project/tag mutations

Implementation tasks:

- On success, replace temporary records with the real server record.
- Patch all relevant caches using the server response before any invalidation happens.
- Use invalidation as cleanup, not as the primary correctness mechanism.
- Preserve rollback snapshots for failure cases only.

Acceptance criteria:

- Creating a task or habit never visually disappears after success.
- Editing task priority and effort updates immediately and stays correct.

### 5.2 Add missing optimistic coverage where it is currently absent or partial

Primary targets:

- `apps/frontend/app/hooks/tasks/use-batch-state.ts`
- `apps/frontend/app/hooks/tasks/use-reorder-task.ts`
- Tag association hooks
- Project mutations

Implementation tasks:

- Add optimistic patches for reorder, batch state changes, and other high-frequency interactions.
- Ensure mutations that affect list membership remove or insert records in the correct filtered caches.

Acceptance criteria:

- Batch state changes, reorder operations, and tag changes are visible immediately.
- Cross-list movement no longer waits on full refetch to look correct.

## 6. Workstream D: Make Cross-Page Data Coherence Deliberate

### 6.1 Define canonical resource relationships

Primary targets:

- `apps/frontend/app/lib/api/query-keys.ts`
- New shared cache utility file, e.g. `apps/frontend/app/lib/api/cache-sync.ts`

Implementation tasks:

- Define which query families a task mutation affects:
  - all task lists
  - schedule ranges
  - project-specific lists
  - task detail
  - task tags
- Define which query families a habit mutation affects:
  - all habits
  - weekly habits
  - monthly heatmap data
  - habit detail
- Define similar maps for projects, tags, inbox, and settings/session.

Acceptance criteria:

- Every mutation has an explicit cache update contract.
- No related page depends on incidental refetch behavior.

### 6.2 Complete habit monthly invalidation

Primary targets:

- `apps/frontend/app/hooks/habits/optimistic-helpers.ts`
- `apps/frontend/app/hooks/habits/use-habit-monthly.ts`

Implementation tasks:

- Include `queryKeys.habits.monthly(...)` in snapshot, rollback, cancel, and invalidate helpers.
- Patch monthly cache directly on resolve when the currently viewed month is affected.

Acceptance criteria:

- Weekly board, detail panel, and monthly heatmap stay in sync after resolve/update/delete actions.

### 6.3 Unify session-derived UI refresh

Primary targets:

- `apps/frontend/app/components/settings/tabs/AccountTab.tsx`
- `apps/frontend/app/components/sidebar/IconRail.tsx`
- `apps/frontend/app/components/layout/PlannerHeader.tsx`

Implementation tasks:

- Refetch or locally patch session data after avatar/name/email changes.
- Ensure sign-in, sign-out, and profile updates clear or repopulate dependent caches consistently.

Acceptance criteria:

- Profile image and user name update everywhere without a full refresh.

## 7. Workstream E: Security, Data Isolation, and Real RLS Verification

### 7.1 Implement actual database RLS policies

Primary targets:

- `apps/backend/drizzle/*.sql`
- `apps/backend/src/db/schema.ts`
- `apps/backend/src/lib/rls.ts`

Implementation tasks:

- Add `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to all user-scoped tables.
- Add `CREATE POLICY` statements keyed to `request.jwt.claims.sub`.
- Cover at minimum:
  - `users`
  - `tasks`
  - `projects`
  - `inbox_items`
  - `inbox_sections`
  - `tags`
  - `task_tags`
  - `habits`
  - `habit_logs`
  - `subtasks`
  - `task_sections`
  - any metrics or memory tables that store user data
- Keep route-level `userId` predicates even after RLS is added. They remain useful defense in depth and improve query clarity.

Acceptance criteria:

- Direct SQL access without the correct claim cannot read or mutate another user's rows.
- Route bugs cannot silently bypass isolation.

### 7.2 Fix low-severity client-side data leakage

Primary targets:

- `apps/frontend/app/hooks/use-settings.ts`
- Sign-out/session change flow in `apps/frontend/app/providers.tsx`

Implementation tasks:

- Scope the local settings cache key by authenticated user id.
- Clear cached settings on sign-out and user switch.
- Avoid hydrating one user's settings into another user's session.

Acceptance criteria:

- Account switching on the same browser does not briefly show another user's settings.

## 8. Recommended Implementation Order

1. Auth bootstrap boundary and typed auth state.
2. Typed API error model and centralized authenticated fetch wrapper.
3. Remove stale authenticated cache headers for task/habit/subtask GETs.
4. Rewrite task mutation success handling to reconcile caches with returned server data.
5. Rewrite habit mutation success handling, including monthly cache support.
6. Add explicit resource relationship invalidation and patch helpers.
7. Normalize session/profile refresh behavior.
8. Add real Postgres RLS policies and isolation tests.
9. Run end-to-end regression verification.

## 9. Verification Plan

### 9.1 Automated checks

- Run `pnpm --filter @cadence/frontend typecheck`
- Add frontend tests for:
  - auth bootstrap gating
  - optimistic create/update/delete reconciliation
  - task priority and effort updates
  - habit weekly/monthly synchronization
- Add backend integration tests for:
  - expired token handling
  - sanitized error bodies
  - RLS cross-user isolation

Note:

- `pnpm --filter @cadence/frontend typecheck` passes at the time of this review. That confirms the current code compiles, but it does not validate runtime reliability.

### 9.2 Manual verification scenarios

- Open a protected route, restart the frontend dev server, and confirm the page does not blank.
- Leave the app idle until the token expires, then resume activity and confirm session recovery is graceful.
- Create a task on Planner and confirm it remains visible without refresh.
- Edit task priority and effort from both context menu and detail panel and confirm immediate persistence.
- Create and resolve habits, then confirm weekly board and monthly heatmap both update.
- Update avatar/name and confirm sidebar/header session UI updates immediately.
- Sign out, sign in as another user on the same browser, and confirm no prior settings flash.
- Attempt cross-user reads/writes in backend tests and confirm database-level rejection.

## 10. Definition of Done for This Phase

This phase is complete when:

1. Blank-screen auth failures are eliminated.
2. Authenticated queries never run before auth is ready.
3. Successful optimistic operations no longer revert after backend success.
4. Planner, schedule, habits, project, and settings views stay synchronized without manual refresh.
5. Browser-visible errors are sanitized and structured.
6. Real Postgres RLS policies exist and are covered by isolation tests.
