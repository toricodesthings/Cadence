# Cadence Post-Release Audit Plan

Date: 2026-03-16
Scope: `apps/frontend`, `apps/backend`, post-release web runtime, Cloudflare Workers deployment posture, and design-manifesto compliance

## 1. Verified Baseline

The current release is materially stronger than the pre-release state and is functioning as a coherent product. The audit baseline below was re-verified after the implementation work landed.

- Frontend tests pass: `50/50`
- Backend tests pass: `61/61`
- Frontend typecheck passes
- Backend typecheck passes
- Frontend production build passes
- Frontend Worker dry-run deploy passes
- Backend Worker dry-run deploy passes
- `pnpm audit --prod` reports no known vulnerabilities at audit time

Additional runtime validation completed during this audit:

- Auth page desktop Lighthouse snapshot scored:
  - Accessibility: `100`
  - Best Practices: `100`
  - SEO: `100`
- Auth page desktop runtime shows:
  - real logo asset is in use
  - pointer affordance is present on the primary action
  - console is clean
- Auth page mobile runtime is visually coherent and no longer exhibits the earlier collapsed or malformed composition

## 2. Current Strengths Worth Preserving

These are not generic compliments. They are implementation strengths that should be protected from future regressions.

### 2.1 Auth surface is now substantially aligned with the manifesto

Evidence:

- `apps/frontend/app/routes/auth.tsx` now uses the real logo asset and calmer editorial copy instead of the temporary mark and old SaaS-style split language.
- `apps/frontend/tests/app/routes/auth.test.tsx` explicitly checks for the centered auth surface, the logo, and labeled provider buttons.
- Browser inspection confirms:
  - the auth card is vertically centered on desktop
  - provider buttons are accessible by name
  - the page no longer throws console errors during boot

Preservation rule:

- Treat the auth surface as a protected design reference for future onboarding or account flows.

### 2.2 Timetable/passive recurring block semantics are now modeled explicitly

Evidence:

- Backend schema now includes `task_interaction_mode` and task persistence support for `"task"` vs `"timetable"`.
- Frontend task utilities and checkbox behavior respect passive timetable anchors.
- Tests exist on both sides:
  - `apps/frontend/tests/app/components/task-checkbox.test.tsx`
  - `apps/frontend/tests/app/lib/utils/task-scheduling.test.ts`
  - `apps/backend/tests/lib/task-recurrence.test.ts`
  - `apps/backend/tests/routes/tasks.contract.test.ts`

Preservation rule:

- Do not allow future list, search, detail, or batch-action surfaces to silently reintroduce completion affordances for timetable anchors.

### 2.3 Shared location state and settings flush protections are real

Evidence:

- `apps/frontend/app/hooks/environment/use-geolocation.ts` now holds shared geolocation state.
- `apps/frontend/app/hooks/environment/use-weather.ts` consumes shared coordinates instead of independently prompting.
- `apps/frontend/app/hooks/core/use-settings.ts` flushes pending writes on visibility change and unmount.
- Tests exist for both:
  - `apps/frontend/tests/app/hooks/location-sharing.test.tsx`
  - `apps/frontend/tests/app/hooks/use-settings.test.tsx`

Preservation rule:

- Keep weather and holiday location resolution on one permission path.
- Keep settings persistence guarantees in place when dialogs, tabs, or routes close.

### 2.4 Backend production attack surface is narrower than before

Evidence:

- `apps/backend/src/index.ts` hard-disables `/api/debug` unless `ENABLE_DEBUG_ROUTES=true`.
- `apps/backend/tests/routes/debug-availability.test.ts` proves debug routes return `404` by default and only fall through when explicitly enabled.
- Security middleware tests also cover auth rejection, limiter order, and admin gating in `apps/backend/tests/routes/security.middleware.test.ts`.

Preservation rule:

- Keep debug tooling dark in production and do not “temporarily” re-expose it for convenience.

## 3. Highest-Priority Findings

The findings below are the post-release risks that still matter. They are ordered by release impact, not by code locality.

### 3.1 P1 Reliability: failed offline mutations cannot truly be retried from the banner

Status: confirmed defect

Evidence:

- `apps/frontend/app/components/shared/OfflineBanner.tsx` wires the Retry button to `outbox.retryFailed`.
- `apps/frontend/app/lib/api/mutation-outbox.ts` implements `retryFailed` by only calling `retryFailedEntries()`.
- `apps/frontend/app/lib/api/offline-wal.ts` changes failed entries back to `pending`, but does not execute them.
- Actual replay only happens in:
  - `replayWal(queryClient)` on `online`
  - the startup effect in `apps/frontend/app/providers.tsx`

Impact:

- A user can click Retry while already online and see no immediate sync attempt.
- This creates a false sense of recovery and can leave queued mutations stranded until the next reconnect event or app reload.
- This is directly in the data-loss / trust category because a failed mutation appears user-recoverable when it is not.

Required remediation:

1. Change the Retry action to invoke `retryAndReplay(queryClient)` rather than only `retryFailedEntries()`.
2. Add a UI/integration test proving the Retry action immediately attempts replay while online.
3. Surface replay outcome clearly:
   - success confirmation
   - partial failure count
   - actionable error message if replay still fails

Files involved:

- `apps/frontend/app/components/shared/OfflineBanner.tsx`
- `apps/frontend/app/lib/api/mutation-outbox.ts`
- `apps/frontend/app/lib/api/mutation-executor.ts`
- new test coverage near `apps/frontend/tests/app/lib/mutation-outbox.test.ts`

### 3.2 P1 Performance: the authenticated shell is still too large

Status: confirmed build pressure

Production build output at audit time:

- `MainLayout`: roughly `985 kB` minified / `249 kB` gzip
- `runtime`: roughly `428 kB` minified / `115 kB` gzip
- shared `ui` chunk: roughly `264 kB` minified / `84 kB` gzip
- root CSS: roughly `216 kB` / `30 kB` gzip
- `TaskEditPanel`: roughly `174 kB` / `53 kB` gzip

Evidence:

- `apps/frontend/app/components/layout/MainLayout.tsx` eagerly imports:
  - `Sidebar`
  - `CommandPalette`
  - `FloatingActionBar`
  - `SettingsDialog`
  - `QuickAddSurface`
  - notification hooks
  - theme sync hooks
  - keyboard shortcut machinery
- Route-level lazy loading is almost absent. The audit search found meaningful lazy loading only for:
  - runtime target resolution
  - the emoji picker

Impact:

- First authenticated shell load remains heavier than it should be.
- Even though individual route chunks exist, large amounts of UI and global behavior arrive before the user actually opens them.
- This increases input delay risk on lower-end devices and weakens the “calm sanctuary” feel by making the shell more machinery-heavy than necessary.

Required remediation:

1. Split heavy shell overlays behind lazy boundaries:
   - `CommandPalette`
   - `SettingsDialog`
   - `QuickAddSurface`
   - possibly `FloatingActionBar`
2. Re-check whether notification center / browser notification wiring must initialize on initial shell paint.
3. Audit `TaskEditPanel` imports and split rarely used edit affordances where practical.
4. Set a bundle budget and fail CI if the authenticated shell regresses past an agreed threshold.

Files involved:

- `apps/frontend/app/components/layout/MainLayout.tsx`
- `apps/frontend/app/components/tasks/TaskEditPanel.tsx`
- `apps/frontend/app/providers.tsx`
- CI workflow: `.github/workflows/web-platform-verify.yml`

### 3.3 P1 Test coverage: major backend route families still have no direct contract tests

Status: confirmed coverage gap

Backend route files present:

- `debug.ts`
- `events.ts`
- `habits.ts`
- `health.ts`
- `inbox.ts`
- `projects.ts`
- `sections.ts`
- `settings.ts`
- `subtasks.ts`
- `suggestions.ts`
- `tags.ts`
- `tasks.ts`

Backend route tests present:

- `debug-availability.test.ts`
- `habits.test.ts`
- `security.middleware.test.ts`
- `settings.contract.test.ts`
- `tasks.contract.test.ts`
- `tasks.test.ts`

Uncovered route families at the route-contract level:

- `events`
- `inbox`
- `projects`
- `sections`
- `subtasks`
- `suggestions`
- `tags`
- `health` beyond implicit runtime assumptions

Impact:

- A large portion of the backend API surface can change shape without direct contract regression coverage.
- This is especially risky because the frontend relies on optimistic updates and offline replay; route drift can become user-visible only after deployment.

Required remediation:

1. Add contract tests for every exposed route family.
2. Prioritize the flows with offline or optimistic coupling first:
   - `inbox`
   - `projects`
   - `sections`
   - `subtasks`
   - `tags`
3. Add at least smoke-level tests for:
   - `events`
   - `suggestions`
   - `health`

### 3.4 P1 Operations: direct pushes to `main` mean verification is observational, not preventative

Status: structural operational risk

Evidence:

- `.github/workflows/web-platform-verify.yml` runs on `pull_request` and `push`.
- Cloudflare remains the deploy source of truth and redeploys on pushes to `main`.
- If the primary release habit is direct pushes to `main`, Cloudflare deployment starts from that same push regardless of whether GitHub verification later succeeds or fails.

Impact:

- The current workflow gives excellent post-push signal, but it is not a true release gate.
- A bad main push can still deploy before verification finishes.

Required remediation:

1. Decide explicitly whether this is acceptable operating policy.
2. If direct `main` pushes remain the norm, document that verification is post-deploy monitoring.
3. If preventative gating is desired later, move deployment authority or require protected merge flow.

## 4. High-Value Findings by Audit Area

### 4.1 Performance and loading speed

#### 4.1.1 Main authenticated shell is still over-bundled

This is the biggest current frontend performance issue and is covered in Section 3.2.

#### 4.1.2 Root CSS is large and should be budgeted

Evidence:

- Production CSS bundle is roughly `216 kB` uncompressed.

Interpretation:

- The design system is rich and justified, but the stylesheet has reached the point where token discipline alone is not enough.
- This is not automatically a bug, but it should now be measured and controlled like JS.

Recommended follow-up:

- Add CSS size reporting to CI.
- Review whether old variants, duplicate utility layers, or no-longer-used component styles can be trimmed.

#### 4.1.3 Build warnings are small but real maintenance friction

Evidence:

- Frontend build emitted sourcemap resolution warnings for:
  - `app/components/primitives/AlertDialog.tsx`
  - `app/components/primitives/Dialog.tsx`
- SSR build reported unused imports in:
  - `app/providers.tsx`
  - `app/components/shared/Loading.tsx`

Impact:

- These are not release blockers.
- They do reduce confidence in the build and make future build noise easier to ignore.

Recommended follow-up:

- Clean the unused imports.
- Investigate the sourcemap source mapping problem in the primitives layer.

#### 4.1.4 Service worker cache strategy is functional but under-versioned

Evidence:

- `apps/frontend/public/sw.js` uses a fixed cache name: `cadence-shell-v1`.
- Static assets are handled cache-first.
- Old caches are only cleared when the cache name changes, but the cache name is currently static.

Impact:

- Cache contents will accumulate until the service worker version string changes.
- Cache invalidation is manual rather than release-driven.
- This increases the chance of stale shell or asset behavior persisting longer than intended across releases.

Recommended follow-up:

1. Version cache names from build metadata or release hashes.
2. Consider a more explicit strategy for navigation shell vs static assets.
3. Add service-worker behavior tests or at least documented cache invalidation policy.

### 4.2 Reliability, data-loss protection, error states, and retry behavior

#### 4.2.1 Offline replay bug in retry UX

Covered in Section 3.1.

#### 4.2.2 Only one route-level error boundary exists on the frontend

Evidence:

- Search across `apps/frontend/app` shows only the root `ErrorBoundary` in `apps/frontend/app/root.tsx`.

Impact:

- A route-level rendering or loader failure collapses to a full-app fallback instead of preserving shell context.
- The user loses local orientation and surrounding workspace state more easily than necessary.

Recommended follow-up:

1. Add per-route or per-surface error boundaries for the highest-value authenticated views:
   - holding/home
   - schedule
   - habits
   - weekly review
   - settings
2. Keep the root boundary as the final fallback, not the only fallback.

#### 4.2.3 Retry policy comments overstate current behavior

Evidence:

- `apps/frontend/app/providers.tsx` says retry should use `Retry-After` when available.
- `apps/frontend/app/types/api.ts` does not store response headers in `ApiErrorResponse`.
- `apps/frontend/app/lib/api/helpers.ts` never extracts `Retry-After` from failed responses.
- `retryDelay` in providers therefore uses a generic exponential formula, not server-provided timing.

Impact:

- Rate-limit recovery is workable, but less precise than the code comments imply.
- This can produce unnecessary retry pressure or longer-than-needed wait times.

Recommended follow-up:

1. Either implement real header-aware retry delay handling or update the comment to match reality.
2. Add tests around 429 handling with explicit delay extraction if implemented.

#### 4.2.4 Weather failure handling is operationally quiet, but too opaque

Evidence:

- `apps/frontend/app/hooks/environment/use-weather.ts` catches fetch failures and only logs `console.error`.
- The user gets no explicit degraded-state indicator if weather is unavailable.

Impact:

- This is acceptable for a non-critical feature, but it is not fully transparent.
- It can make “weather missing” indistinguishable from “weather not yet loaded” or “permission denied”.

Recommended follow-up:

- Add a subtle degraded-state indicator or explicit “location/weather unavailable” state in the header if this feature remains user-facing.

### 4.3 UI/UX and manifesto alignment

#### 4.3.1 Auth now passes, but the offline banner still violates the sanctuary language

Evidence:

- `apps/frontend/app/components/shared/OfflineBanner.tsx` still uses generic solid system bars:
  - `bg-blue-900/90`
  - `bg-rose-900/90`
  - `bg-amber-900/90`
- Actions use generic utility pill styling instead of the glass/lantern system.

Manifesto conflict:

- This reads like a system alert pasted over Cadence rather than a sanctuary-native surface.
- It reintroduces the “external product layer” feeling the manifesto explicitly rejects.

Recommended remediation:

1. Rebuild the offline banner using the same frosted twilight surface language as toasts and shell overlays.
2. Keep severity communication, but route it through semantic Cadence tokens instead of raw utility alert colors.
3. Preserve tappability and urgency without falling back to generic admin-app styling.

#### 4.3.2 Root error boundary is usable, but still more fallback card than sanctuary room

Evidence:

- `apps/frontend/app/root.tsx` renders a single heavy centered fallback card for all uncaught route failures.

Interpretation:

- The boundary is serviceable and readable.
- It is also visually more “error card in an app” than “recoverable room in Cadence”.

Recommended follow-up:

- When route-level boundaries are added, give each one a calmer contextual recovery state so users remain anchored inside the workspace they were using.

#### 4.3.3 Toast system appears materially improved and should not be re-genericized

Evidence:

- `apps/frontend/app/components/feedback/Toaster.tsx`
- `apps/frontend/app/lib/utils/cadence-toast.ts`
- `apps/frontend/app/app.css` toast classes

Assessment:

- Current toast styling is materially more aligned with Cadence than the offline banner.
- Keep this system as the baseline feedback language.

### 4.4 Security protocol and handling

#### 4.4.1 Backend security posture is currently respectable

Confirmed strengths:

- `secureHeaders()` is applied in `apps/backend/src/index.ts`
- CORS origin handling is explicit
- bearer-token verification uses Neon JWKS
- structured validation errors are returned
- request IDs and structured error logs are emitted
- debug routes are default-off
- `pnpm audit --prod` is clean at audit time

This is a good baseline and should be protected.

#### 4.4.2 Frontend CSP still requires `'unsafe-inline'`

Evidence:

- `apps/frontend/public/_headers` sets:
  - `script-src 'self' 'unsafe-inline' ...`
  - `style-src 'self' 'unsafe-inline' ...`
- `apps/frontend/app/root.tsx` contains inline scripts for:
  - `127.0.0.1` to `localhost` redirect
  - service worker registration

Impact:

- The deployed frontend has a CSP, which is good.
- It also still needs inline-script allowance, which weakens the policy compared with a nonce-free, external-script model.

Recommended follow-up:

1. Externalize the inline scripts where practical.
2. Revisit whether `style-src 'unsafe-inline'` is still required after the current implementation stabilizes.
3. Keep `_headers` under active review when adding third-party providers or analytics.

#### 4.4.3 Frontend security headers are file-based, not code-owned

Evidence:

- `apps/frontend/worker.ts` is still effectively a `404` fallback.
- Security headers are currently provided by `apps/frontend/public/_headers`.

Interpretation:

- This is acceptable if `_headers` is treated as a first-class security control.
- It does mean edge logic cannot dynamically evolve policy without moving more responsibility into the Worker.

Recommended follow-up:

- Keep `_headers` audited alongside code changes.
- If future requirements need dynamic CSP or feature-specific header policies, move enforcement into Worker code.

#### 4.4.4 Third-party public data sources deserve explicit reliability/privacy review

Evidence:

- Frontend directly calls:
  - `api.open-meteo.com`
  - `nominatim.openstreetmap.org`
  - `openholidaysapi.org`
  - `date.nager.at`

Impact:

- This is acceptable for the current feature set.
- It does create runtime dependence on public third-party services with no app-owned SLA.

Recommended follow-up:

1. Decide whether these remain acceptable direct browser dependencies.
2. If not, proxy through a controlled backend endpoint with caching and rate protection.
3. At minimum, document privacy and availability assumptions for geolocation-derived calls.

### 4.5 Test suite comprehensiveness

#### 4.5.1 Frontend tests are useful, but still narrow for the surface area

Current frontend tests cover:

- auth route rendering
- settings flush
- shared location state
- task checkbox timetable behavior
- scheduling helpers
- mutation outbox basics
- API helpers/client helpers

High-value frontend areas with no direct tests:

- `MainLayout`
- `OfflineBanner`
- `Toaster` behavior patterns
- `SettingsDialog`
- `Schedule` route
- `Home` route
- `HolidayControls`
- `TaskEditPanel`
- service worker behavior
- route-level runtime failure recovery

Recommended follow-up:

1. Add targeted component tests for `OfflineBanner` and `SettingsDialog`.
2. Add route tests for `home` and `schedule`.
3. Add at least one browser-level smoke suite for:
   - auth
   - initial authenticated shell
   - schedule holiday controls
   - offline queued mutation replay

#### 4.5.2 Backend tests should be expanded to the whole route map

Covered in Section 3.3.

#### 4.5.3 CI verifies health, but not behavior quality

Evidence:

- `.github/workflows/web-platform-verify.yml` runs tests, typechecks, production build, dry-run deploys, and secret hygiene.
- It does not run:
  - browser/E2E tests
  - Lighthouse or accessibility budgets
  - coverage thresholds
  - service worker validation

Recommended follow-up:

1. Add browser smoke tests for critical web flows.
2. Add at least one performance budget check.
3. Add coverage reporting even if strict thresholds are introduced later.

## 5. Recommended Remediation Order

The current release does not need a broad rewrite. It needs disciplined tightening in the places that still affect trust, speed, and long-term maintainability.

### Phase 1: Backend changes

This phase is strictly backend and backend-adjacent operational work.

1. Add backend contract tests for every currently untested route family:
   - `events`
   - `inbox`
   - `projects`
   - `sections`
   - `subtasks`
   - `suggestions`
   - `tags`
   - `health`
2. Prioritize route-contract coverage for the backend flows most tightly coupled to optimistic UI and offline replay:
   - `inbox`
   - `projects`
   - `sections`
   - `subtasks`
   - `tags`
3. Preserve and extend backend security coverage:
   - keep debug routes default-off
   - keep auth rejection, limiter order, and admin gating covered
   - add smoke-level verification where new route families expose privileged or stateful operations
4. Decide whether the frontend’s direct browser dependence on public third-party data sources should remain as-is or move behind controlled backend endpoints with caching and rate protection:
   - `api.open-meteo.com`
   - `nominatim.openstreetmap.org`
   - `openholidaysapi.org`
   - `date.nager.at`
5. Explicitly document the current deployment operating model for backend changes:
   - Cloudflare deploys from direct pushes to `main`
   - GitHub verify is therefore post-push signal, not a preventative release gate
   - if that remains intentional, document it as policy rather than leaving it ambiguous

### Phase 2: Frontend changes

This phase is strictly frontend and frontend-CI work.

1. Fix the OfflineBanner Retry path so it immediately replays failed WAL entries instead of only flipping them back to pending.
2. Add frontend tests for offline failure recovery and replay, including a UI/integration path that proves Retry actually replays while online.
3. Clarify or implement true `Retry-After` support on the frontend:
   - either parse header-derived delay information into `ApiErrorResponse`
   - or reduce the provider comments so they match the current exponential backoff behavior
4. Add route-level or surface-level frontend error boundaries for the highest-value authenticated experiences:
   - holding/home
   - schedule
   - habits
   - weekly review
   - settings
5. Reduce authenticated-shell weight by lazy-loading heavy frontend overlays and global panels:
   - `CommandPalette`
   - `SettingsDialog`
   - `QuickAddSurface`
   - possibly `FloatingActionBar`
6. Audit `TaskEditPanel` and other heavy frontend surfaces for import splitting and reduce initial shell cost where practical.
7. Add frontend performance controls to CI:
   - bundle budgets
   - CSS size reporting
   - at least one performance budget check
8. Version the frontend service-worker cache strategy more explicitly so cache invalidation is release-driven rather than manual.
9. Expand frontend test coverage across real product surfaces:
   - `MainLayout`
   - `OfflineBanner`
   - `Toaster`
   - `SettingsDialog`
   - `Schedule`
   - `Home`
   - `HolidayControls`
   - `TaskEditPanel`
   - service worker behavior
   - route-level runtime failure recovery
10. Add browser-level smoke coverage for critical frontend flows:
    - auth
    - initial authenticated shell
    - schedule holiday controls
    - offline queued mutation replay
11. Reduce or remove `'unsafe-inline'` in the frontend CSP where practical by externalizing inline script behavior and then re-evaluating the `_headers` policy.
12. Keep `apps/frontend/public/_headers` under active audit as a frontend security control until header ownership moves into Worker code.
13. Restyle the OfflineBanner into the same sanctuary language as the toast system so degraded-state UX stays aligned with the design manifesto.
14. Review whether weather/location degraded states need a clearer user-facing frontend indicator instead of staying console-only.

## 6. Bottom Line

Cadence is now in a credible post-release state. The major release-plan work landed and is visible in both the code and the runtime.

The remaining work is no longer about rescuing fundamentals. It is about hardening the product around four things:

- trustworthy offline recovery
- smaller authenticated shell payloads
- broader route-level and browser-level test coverage
- consistent sanctuary language in edge-case UI states

That is the correct shape of post-release work. The product should stay functionally as-is while these gaps are closed.
