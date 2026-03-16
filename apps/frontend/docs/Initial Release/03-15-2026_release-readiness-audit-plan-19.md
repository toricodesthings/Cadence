# Cadence Release Readiness Audit Plan

Date: 2026-03-15
Scope: `apps/frontend`, `apps/backend`, web release CI/CD, Cloudflare Workers deployment readiness, and OWASP-focused security review

## 1. Verified Baseline

The current baseline is usable, but not yet production-ready.

- Frontend tests pass: `37/37`
- Backend tests pass: `52/52`
- Frontend typecheck passes
- Backend typecheck passes
- Frontend production build passes
- Frontend Worker dry-run deploy passes
- Backend Worker dry-run deploy passes

Additional release notes from validation:

- The frontend production build currently emits very large chunks. The biggest observed bundles were `MainLayout` at roughly `934 kB`, `TaskEditPanel` at roughly `173 kB`, and a shared `ui` chunk at roughly `264 kB`.
- This audit adds a dedicated web/backend verification workflow. Deployment should remain Cloudflare-native so each push to `main` continues to trigger the existing Workers redeploy flow without a redundant second deploy system in GitHub Actions.
- Local secret-bearing files exist in the workspace (`apps/backend/.dev.vars`, `apps/frontend/.env`, `apps/frontend/.env.desktop`), but they are not tracked by git.
- The worktree is already dirty in several frontend files. This audit avoids treating those in-progress edits as release regressions unless they are directly observable risks.

## 2. Highest-Priority Frontend UX Findings

### 2.1 Auth surface violates the manifesto and does not scale like a premium Cadence room

Evidence:

- `apps/frontend/app/routes/auth.tsx` renders the right-hand auth panel with `items-start` instead of centering it vertically (`lines 379-380`).
- In local browser validation on 2026-03-15, the sign-in card rendered at `top: 16px` inside a `1024px` desktop viewport instead of sitting on a centered vertical axis.
- The page still uses a temporary `"C"` mark in both desktop and mobile auth branding (`apps/frontend/app/routes/auth.tsx:343-345`, `387-390`, `398-400`) even though the real logo exists in `apps/frontend/public/logo.png`.
- The left panel copy is still a generic product pitch: `"A quiet space for your brightest thoughts"` and `"Cadence is a digital sanctuary..."` with two benefit bullets that still read like polished SaaS marketing (`apps/frontend/app/routes/auth.tsx:347-373`).
- Lighthouse on the sign-in page reported unlabeled buttons, which matches the current icon-only social provider buttons rendered through the Neon Auth UI.
- The auth CSS still uses `transition: all` and does not set pointer affordances on buttons (`apps/frontend/app/app.css:902-910`), which is explicitly against the manifesto and interaction rules.

Implementation plan:

1. Rebuild auth as a single environmental surface instead of a left-marketing / right-form split.
2. Keep the existing header text `"Step into your Cadence."`, but replace the surrounding copy with quieter editorial text and remove the feature-bullet SaaS framing.
3. Replace every temporary `"C"` mark with the shipped logo asset from `apps/frontend/public/logo.png`.
4. On desktop, vertically center the auth card and its surrounding composition. Use `items-center` and remove the top-biased scrollable layout unless the form actually overflows.
5. Preserve mobile comfort by keeping the card scrollable only when needed, not as the default desktop posture.
6. Add cursor affordance and stronger interactive polish to all Neon Auth buttons and links. This includes `cursor: pointer`, consistent hover treatment, and eliminating `transition: all`.
7. Explicitly label vendor social buttons for screen readers if the Neon component still renders icon-only controls after theming.
8. Keep the auth surface visually tied to the sanctuary system: atmospheric background, soft glow, logo-led identity, and no foreign vendor styling leaking through.

Files to change:

- `apps/frontend/app/routes/auth.tsx`
- `apps/frontend/app/app.css`
- `apps/frontend/public/logo.png` as the visual source of truth

Tests to add:

- Browser/UI test that asserts the auth card is vertically centered on desktop
- Accessibility test that fails on unlabeled social buttons
- Visual regression for sign-in and sign-up pages

### 2.2 Timeblocks are still modeled as tasks, not passive timetable anchors

Evidence:

- Recurring timed schedule items are authored as normal tasks with `recurrenceRule` plus `timezoneLocked` from `CalendarEventPopover` (`apps/frontend/app/components/calendar/CalendarEventPopover.tsx:165-198`).
- Backend recurrence expansion turns them into virtual schedule instances, but still as task-shaped records (`apps/backend/src/lib/task-recurrence.ts:77-145`).
- In schedule view, recurring blocks cannot be completed or archived. The UI only shows a toast saying they are edited as a series (`apps/frontend/app/routes/schedule.tsx:525-553`).
- Outside schedule, the generic `TaskCheckbox` still completes any task it receives and has no special handling for recurring timetable blocks (`apps/frontend/app/components/tasks/TaskCheckbox.tsx:57-90`).

This is the current mismatch:

- Schedule view already treats recurring timed items as special
- List and detail surfaces still treat them as normal completable tasks
- There is no persisted concept for "this recurring timed thing is a passive timetable block"

Implementation plan:

1. Introduce an explicit model field for recurring timed blocks. Recommended shape:
   - `completionMode: "manual" | "auto-advance"`
   - or `interactionMode: "task" | "timetable"`
2. Default new recurring timed blocks authored from the schedule canvas to the passive mode, not manual completion.
3. Offer a naturally embedded opt-in such as `"Needs check-off"` or `"Treat this as a task"` for users who do want manual completion.
4. Suppress task-completion affordances for passive timetable blocks across every surface:
   - schedule
   - planner lists
   - upcoming
   - task detail panel
   - search results
5. Update copy so passive timetable blocks read as anchors or reminders, not overdue work.
6. Do not bulk-convert existing recurring tasks automatically unless a reliable migration rule exists. Safer release path:
   - keep current recurring tasks as manual by default
   - default only newly created recurring timed schedule blocks to passive mode
   - optionally add a one-time inline conversion affordance per recurring series

Files likely involved:

- Frontend:
  - `apps/frontend/app/components/calendar/CalendarEventPopover.tsx`
  - `apps/frontend/app/components/tasks/TaskCheckbox.tsx`
  - `apps/frontend/app/routes/schedule.tsx`
  - `apps/frontend/app/lib/utils/task-scheduling.ts`
  - `apps/frontend/app/types/task.ts`
- Backend:
  - `apps/backend/src/db/schema.ts`
  - `apps/backend/src/routes/tasks.ts`
  - `apps/backend/src/lib/task-recurrence.ts`
  - `apps/backend/src/types/task.ts`

Tests to add:

- Backend contract test for the new passive recurring block field
- Frontend test verifying passive timetable blocks never show completion checkbox semantics
- Cross-surface test confirming planner/upcoming/schedule all treat passive blocks consistently

### 2.3 Toast styling is too heavy and no-description toasts are not truly centered

Evidence:

- Toasts use a relatively heavy radial + linear background stack, a strong box shadow, and a persistent progress treatment (`apps/frontend/app/app.css:952-1005`).
- The layout is still optimized around a three-column grid with title, description, icon, and close button (`apps/frontend/app/app.css:958-1098`).
- The current system only special-cases the icon when a description exists, but does not define a cleaner single-line layout for title-only toasts (`apps/frontend/app/app.css:1067-1087`).

Implementation plan:

1. Split the toast system into two patterns:
   - compact single-line toast
   - rich action/banner toast
2. For title-only toasts, vertically center title and icon and remove phantom spacing entirely.
3. Flatten the background styling:
   - reduce shadow depth
   - reduce gradient intensity
   - keep blur, but move toward quieter frosted glass
4. Make the close affordance optional for short informational toasts instead of always reserving visual balance around it.
5. Keep the action-rich layout only for flows that actually need multiple choices.

Files to change:

- `apps/frontend/app/components/feedback/Toaster.tsx`
- `apps/frontend/app/app.css`
- `apps/frontend/app/lib/utils/cadence-toast.ts`

Tests to add:

- DOM test for a title-only toast
- DOM test for a title + description toast
- DOM test for an action-rich banner toast

### 2.4 The holiday location prompt is overloaded, and settings persistence feels unreliable

Evidence:

- The schedule route mounts the holiday location prompt through `toast.custom(...)` as a top-center custom toast (`apps/frontend/app/routes/schedule.tsx:584-620`).
- The prompt contains four actions in one action row, which is a strong signal that this is acting like a mini-dialog inside a toast.
- Settings writes are debounced in `useUpdateSettings()` but there is no explicit flush-on-unmount or flush-on-close path (`apps/frontend/app/hooks/core/use-settings.ts:90-172`).

Likely failure mode:

- The UI optimistically updates local cache
- The settings panel or route changes before the debounced network flush lands
- The user later perceives the setting as not saving consistently

Implementation plan:

1. Replace the top-center holiday prompt toast with a dedicated schedule callout or sheet:
   - desktop: anchored callout from holiday controls
   - mobile: bottom sheet or modal card
2. Reserve the toast system for simple confirmations and errors, not four-choice configuration flows.
3. Add a guaranteed settings flush path:
   - on dialog close
   - on tab switch
   - on unmount
4. Use `mutateAsync` for settings actions that must persist immediately before closing UI.
5. Add explicit save/error instrumentation around holiday settings updates so failures are visible during QA instead of looking like state drift.

Files to change:

- `apps/frontend/app/routes/schedule.tsx`
- `apps/frontend/app/components/calendar/HolidayControls.tsx`
- `apps/frontend/app/hooks/core/use-settings.ts`
- settings dialog/tab close handlers where applicable

Tests to add:

- Hook test that pending settings patches flush on unmount
- UI test confirming the holiday prompt no longer overflows on mobile width
- Integration test for changing holiday mode and reopening settings

### 2.5 Precise location is not transparent enough, and weather asks for the same permission twice

Evidence:

- `useHolidayOverlay()` already resolves precise location and derives effective country/subdivision labels (`apps/frontend/app/hooks/environment/use-holiday-overlay.ts:63-172`, `132-138`, `239-260`).
- `useWeather()` independently calls `navigator.geolocation.getCurrentPosition(...)` and does not consume the existing holiday/location state (`apps/frontend/app/hooks/environment/use-weather.ts:55-100`).
- The current precise-location result is only in hook-local state, so each surface can end up resolving location independently.

Implementation plan:

1. Introduce a shared location service/store for the web app.
2. The shared location layer should own:
   - permission state
   - last resolved coordinates
   - last resolved country/subdivision
   - freshness timestamp
3. The holiday overlay and weather hook should both consume that shared source instead of asking the browser separately.
4. Surface the resolved location clearly in settings:
   - detected country
   - detected region/state
   - when it was last refreshed
5. Keep the data transparent without over-collecting:
   - no long-term persistence of raw latitude/longitude unless explicitly needed
   - session cache is sufficient for the current UX requirement

Files to change:

- `apps/frontend/app/hooks/environment/use-geolocation.ts`
- `apps/frontend/app/hooks/environment/use-holiday-overlay.ts`
- `apps/frontend/app/hooks/environment/use-weather.ts`
- `apps/frontend/app/components/settings/tabs/DateTimeTab.tsx`
- `apps/frontend/app/components/layout/PlannerHeader.tsx`

Tests to add:

- Shared location store test
- Weather hook test proving it reuses resolved location
- Holiday settings UI test showing detected location labels

## 3. CI/CD Findings and Recommended Delivery Model

### 3.1 Current state

Current CI/CD is improved by this audit, but still incomplete for a production web release.

- `.github/workflows/web-platform-verify.yml` now verifies frontend/backend tests, typechecks, production build health, Worker dry-run deploys, and tracked-secret hygiene
- Cloudflare Workers remains the deployment source of truth, so pushes to `main` continue to trigger frontend/backend redeploys without a duplicate GitHub deploy workflow
- Required status checks, and GitHub push protection / secret scanning still need to be enabled at the repository or organization level

### 3.2 Recommended release pipeline

Use GitHub Actions as the verification gate and Cloudflare Workers as the deployment engine.

Reasoning:

- This is a pnpm monorepo
- Frontend and backend still need to be validated together
- Cloudflare is already configured to redeploy both Workers from `main`
- Running a second deploy path from GitHub would create redundant release ownership and noisier rollback/debugging

Recommended pipeline:

1. `verify` workflow on `pull_request` and `push`:
   - frontend tests
   - frontend typecheck
   - frontend production build
   - frontend `wrangler deploy --dry-run --env=""`
   - backend tests
   - backend typecheck
   - backend `wrangler deploy --dry-run --env=""`
   - tracked secret-file hygiene checks
2. Cloudflare deployment on `main` push:
   - frontend and backend redeploy through the existing Workers Git integration
   - no duplicate GitHub deploy workflow
3. Branch protection, if adopted later:
   - require the verify workflow before merge
4. Rollback/runbook:
   - use Cloudflare Worker deployment history / versions for rollback
   - document a manual rollback command per app

Repository artifact created by this audit:

- `.github/workflows/web-platform-verify.yml`

### 3.3 Cloudflare-specific operational guidance

Recommended for Cadence:

- Keep GitHub Actions focused on verification
- Keep Cloudflare as the deploy executor for both Workers
- Keep Cloudflare dashboard configuration accurate for bindings, secrets, routes, build settings, and observability

Required Cloudflare dashboard follow-up:

- Confirm backend secrets/bindings exist in production and development
- Confirm frontend/public env vars match the deployed environment
- Confirm production routes/custom domains are correct
- Confirm observability remains enabled on the backend
- Confirm each Worker is scoped to the correct build path in the monorepo so both frontend and backend redeploy only from intended changes

### 3.4 Secrets and leak prevention

Current finding:

- No tracked `.env`, `.dev.vars`, or key files are present in git
- Local secret-bearing files do exist in the workspace, so repository-level leak prevention should be enabled before release

Recommended controls:

1. Enable GitHub push protection for the repository or organization.
2. Enable GitHub secret scanning alerts if licensing/plan allows it.
3. Keep CI failing if tracked `.env`, `.dev.vars`, `.pem`, `.key`, or `.crt` files ever appear.
4. Add a later-stage full secret scan in CI if you want broader coverage than file-hygiene rules alone.

## 4. Security Audit by OWASP Area

### A01 Broken Access Control

Current strengths:

- Backend auth middleware verifies bearer tokens via Neon JWKS
- App routes use per-user RLS with `withRls(...)`
- Admin-only tooling checks `ADMIN_USER_IDS` / `ADMIN_EMAILS`

Original finding:

- Debug routes were mounted in production by default (`apps/backend/src/index.ts:120-130`) and relied entirely on runtime admin checks (`apps/backend/src/routes/debug.ts:43-52`).

Status after this audit:

- Backend entrypoint now hard-disables `/api/debug` unless `ENABLE_DEBUG_ROUTES=true`.
- Added a route-availability test proving debug routes return `404` by default and only fall through to auth when explicitly enabled.

Remaining requirement:

1. Keep `ENABLE_DEBUG_ROUTES` unset in production.
2. Only enable it in controlled development or staging contexts when the tooling is needed.

### A02 Cryptographic Failures

Current strengths:

- JWT verification uses `jose`
- Remote JWKS is cached and refreshed
- No committed secret files were found in git

Finding:

- Repository leak prevention is not yet enforced in workflow or platform settings.

Remediation:

- Enable GitHub push protection and secret scanning
- Keep Cloudflare secrets in dashboard/secret storage, never in repo config

### A03 Injection

Current strengths:

- Zod request validation is consistently applied
- Drizzle queries are structured and parameterized
- The frontend markdown renderer uses `react-markdown` with `remark-gfm` and does not enable raw HTML rendering

Residual work:

- Add route-level security tests for malformed task, settings, and auth payloads

### A04 Insecure Design

Finding:

- The current recurring block model is semantically unsafe because passive timetable items are still treated like tasks in parts of the UI. This is more product/security-adjacent than exploit-driven, but it directly affects trust, correctness, and behavior consistency.

Remediation:

- Introduce a distinct passive recurring block mode as described in Section 2.2

### A05 Security Misconfiguration

Findings:

- There is no web/backend production verify workflow yet.
- Frontend security headers are not currently being shaped at the Worker layer because the assets pipeline serves the SPA directly and `worker.ts` only handles fall-through requests.

Remediation:

1. Add GitHub verification workflow and make it required.
2. Decide how frontend headers will be enforced:
   - Cloudflare static asset headers / transform rules
   - or a worker-first routing setup if you want CSP and frame policy controlled in code
3. Review backend CORS behavior before release and make the allowed origins model explicit in tests.

### A06 Vulnerable Components

`pnpm audit --prod` reported `15` vulnerabilities at audit time:

- `3 high`
- `10 moderate`
- `2 low`

Important nuance:

- Most of the findings are transitive and cluster under:
  - `@neondatabase/neon-js -> @supabase/postgres-meta -> fastify`
  - `drizzle-orm -> prisma -> @prisma/dev -> hono / @hono/node-server / lodash`
- The direct app dependency on `hono` is already newer than the flagged vulnerable ranges, but the transitive chain still needs review and ideally elimination via upgrades or package overrides.

Required remediation work:

1. Audit which flagged packages are actually present in the Worker runtime bundle versus only in tooling trees.
2. Upgrade direct dependencies that can pull the transitive graph forward.
3. Add pnpm overrides if necessary as a temporary mitigation.
4. Re-run `pnpm audit --prod` after dependency changes and record the delta.

### A07 Identification and Authentication Failures

Current strengths:

- Missing and expired token handling is structured
- Auth failures return sanitized error bodies with request IDs
- Rate limiting exists at IP, user-read/write, and admin tiers

Gaps:

- No dedicated auth regression tests for:
  - missing bearer token
  - malformed bearer token
  - expired token
  - admin route denial

### A08 Software and Data Integrity Failures

Findings:

- No formal deployment gate currently ties code verification to deployment.
- No repository-level secret protection or provenance/hardening policy is currently enforced.

Remediation:

- Use required status checks
- Consider pinning third-party GitHub Actions to full commit SHAs during final release hardening
- Add dependency update cadence and post-merge audit checks

### A09 Security Logging and Monitoring Failures

Current strengths:

- Request IDs are generated and returned
- Validation failures and errors are structured and sanitized
- Cloudflare observability is enabled in backend Wrangler config

Residual work:

- Define release alerts for:
  - elevated `5xx`
  - auth provider unavailable errors
  - rate-limit spikes
  - cron failures

### A10 SSRF

Current state:

- Backend does not appear to perform user-directed outbound fetches
- Frontend holiday/weather requests call fixed providers, not attacker-controlled URLs

Risk level:

- Low at the moment

## 5. Test Coverage Gaps That Still Matter

Current tests are passing, but coverage is not yet release-complete.

Missing high-value frontend tests:

- Auth UI rendering/accessibility
- Toast layout variants
- Holiday prompt layout and settings persistence
- Shared location reuse between holidays and weather
- Passive timetable block behavior

Missing high-value backend tests:

- Production debug-route disablement
- Admin route denial
- Rate-limit middleware behavior
- CORS allow/deny behavior
- Dependency/bundle regression checks if overrides are added

Recommended test strategy:

1. Keep the current fast unit/contract suite.
2. Add a thin browser-level smoke suite for:
   - auth
   - schedule holiday controls
   - timeblock behavior
3. Avoid noisy snapshot sprawl. Prefer behavior-focused assertions.

## 6. Release Order

### Release gate 0: must land before production

- Fix auth layout, branding, cursor affordance, and button accessibility
- Fix settings persistence flush behavior
- Remove duplicate location prompts by centralizing location state
- Introduce the recurring block model decision and stop passive timetable items from behaving like tasks
- Add web/backend verification workflow

### Release gate 1: should land before launch unless explicitly deferred

- Refactor the toast system into compact vs action-rich variants
- Replace the holiday prompt toast with a real callout/sheet
- Disable debug routes in production by default
- Resolve or document the transitive vulnerability set with upgrades/overrides

### Release gate 2: final hardening

- Add branch protection and required checks
- Enable GitHub push protection / secret scanning
- Add browser smoke tests for auth and schedule
- Add release runbook and rollback notes

## 7. References

Cloudflare Workers CI/CD overview:

- https://developers.cloudflare.com/workers/ci-cd/

Cloudflare Workers external CI/CD guidance:

- https://developers.cloudflare.com/workers/ci-cd/external-cicd/

Cloudflare Workers Git integration / Workers Builds:

- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/

Wrangler GitHub Action:

- https://github.com/cloudflare/wrangler-action

GitHub push protection:

- https://docs.github.com/en/code-security/concepts/secret-security/about-push-protection

GitHub leak-prevention how-tos:

- https://docs.github.com/en/code-security/how-tos/secure-your-secrets/work-with-leak-prevention
